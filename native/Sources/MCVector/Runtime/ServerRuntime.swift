// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore
import Observation

/// Running servers as the UI sees them (React `serverStore` runtime status,
/// `consoleStore` and `use-server-process-actions`): live status from the
/// core, the optimistic starting/stopping/restarting states, console lines
/// and memory, and the start/stop/restart actions with the EULA gate.
@MainActor
@Observable
final class ServerRuntime {
    /// One console line kept for the Console view.
    struct Entry: Identifiable, Equatable {
        let id: Int
        let text: String
        let level: LogLevel
        let isStderr: Bool
    }

    /// React keeps 2000 lines per server and drops the oldest.
    static let maxLines = 2_000

    /// A start or restart waiting for the EULA sheet.
    struct PendingEula: Equatable {
        enum Action { case start, restart }
        let serverID: String
        let action: Action
    }

    private(set) var liveStatus: [String: String] = [:]
    private(set) var transitional: [String: String] = [:]
    private(set) var logs: [String: [Entry]] = [:]
    private(set) var memoryBytes: [String: UInt64] = [:]
    /// The newest metric window per server and when it arrived (for uptime).
    private(set) var metrics: [String: MetricSnapshot] = [:]
    private(set) var metricsReceivedAt: [String: Date] = [:]
    /// Last high-CPU notification per server (React: 5-minute cooldown).
    private var lastHighCpuNotice: [String: Date] = [:]
    static let highCpuCooldown: TimeInterval = 5 * 60
    private(set) var pendingEula: PendingEula?
    private var nextEntryID = 0

    private let feedback: FeedbackCenter
    /// Profiles for names and notification settings; set by the shell.
    var serverProfile: (String) -> ServerProfile? = { _ in nil }

    private func serverName(_ serverID: String) -> String {
        serverProfile(serverID)?.name ?? serverID
    }

    init(feedback: FeedbackCenter) {
        self.feedback = feedback
    }

    /// Starts listening to the core. Call once.
    func subscribe() {
        CoreClient.subscribeServerEvents(RuntimeObserver(runtime: self))
    }

    // MARK: Status

    /// React's status string: an optimistic state wins, then the live one.
    func status(of serverID: String) -> String {
        transitional[serverID] ?? liveStatus[serverID] ?? "offline"
    }

    /// Servers that make quitting ask first (React: not offline and not crashed).
    var activeServerIDs: [String] {
        Set(liveStatus.keys).union(transitional.keys)
            .filter { !["offline", "crashed"].contains(status(of: $0)) }
            .sorted()
    }

    // MARK: Actions (React use-server-process-actions + use-server-eula-gate)

    func start(_ serverID: String) async {
        guard ServerStatusStyle.canStart(status(of: serverID)) else { return }
        guard ensureEula(serverID, then: .start) else { return }
        transitional[serverID] = "starting"
        do throws(CoreError) {
            try await CoreClient.startServer(id: serverID)
        } catch {
            transitional[serverID] = nil
            if error.code == "server.eula_required" {
                pendingEula = PendingEula(serverID: serverID, action: .start)
            } else {
                feedback.showError(L10n.t("native.server.startFailed"), message: error.uiText)
            }
            return
        }
        transitional[serverID] = nil
    }

    func stop(_ serverID: String) async {
        guard status(of: serverID) == "online" else { return }
        transitional[serverID] = "stopping"
        defer { transitional[serverID] = nil }
        do throws(CoreError) {
            try await CoreClient.stopServer(id: serverID)
        } catch {
            feedback.showError(L10n.t("native.server.stopFailed"), message: error.uiText)
        }
    }

    func restart(_ serverID: String) async {
        guard status(of: serverID) == "online" else { return }
        guard ensureEula(serverID, then: .restart) else { return }
        transitional[serverID] = "restarting"
        defer { transitional[serverID] = nil }
        do throws(CoreError) {
            try await CoreClient.restartServer(id: serverID)
        } catch {
            if error.code == "server.eula_required" {
                pendingEula = PendingEula(serverID: serverID, action: .restart)
            } else {
                feedback.showError(L10n.t("native.server.restartFailed"), message: error.uiText)
            }
        }
    }

    /// ⌘⇧S: stop a running server, start a stopped one.
    func toggle(_ serverID: String) async {
        let current = status(of: serverID)
        if current == "online" {
            await stop(serverID)
        } else if ServerStatusStyle.canStart(current) {
            await start(serverID)
        }
    }

    /// Sends a console command. Throws so the Console keeps the input on failure.
    func send(_ command: String, to serverID: String) async throws(CoreError) {
        try await CoreClient.sendCommand(id: serverID, command: command)
    }

    // MARK: EULA

    /// True when the EULA is accepted; otherwise asks for it and returns false.
    private func ensureEula(_ serverID: String, then action: PendingEula.Action) -> Bool {
        let status = try? CoreClient.serverEulaStatus(id: serverID)
        if status?.accepted == true { return true }
        pendingEula = PendingEula(serverID: serverID, action: action)
        return false
    }

    /// The EULA sheet saved eula.txt: run the waiting start or restart.
    func resumeAfterEula() async {
        guard let pending = pendingEula else { return }
        pendingEula = nil
        switch pending.action {
        case .start: await start(pending.serverID)
        case .restart: await restart(pending.serverID)
        }
    }

    func declineEula() {
        pendingEula = nil
    }

    // MARK: Console

    func clearLogs(_ serverID: String) {
        logs[serverID] = nil
    }

    // MARK: Events from the core (main queue, in order)

    fileprivate func receive(_ line: ConsoleLine) {
        nextEntryID += 1
        var lines = logs[line.serverId, default: []]
        lines.append(Entry(id: nextEntryID, text: line.text, level: line.level, isStderr: line.isStderr))
        if lines.count > Self.maxLines {
            lines.removeFirst(lines.count - Self.maxLines)
        }
        logs[line.serverId] = lines
    }

    fileprivate func receive(_ change: StatusChange) {
        switch change.status {
        case .online:
            liveStatus[change.serverId] = "online"
            let serverID = change.serverId
            Task { await refreshMetrics(serverID) }
        case .offline:
            liveStatus[change.serverId] = "offline"
            clearMetrics(change.serverId)
        case .crashed:
            liveStatus[change.serverId] = "crashed"
            clearMetrics(change.serverId)
            if !change.expected {
                let name = serverName(change.serverId)
                feedback.toast(.error, L10n.t("native.server.crashed", ["name": name]))
                feedback.notifyInBackground(
                    title: L10n.t("native.server.crashed", ["name": name]),
                    body: ""
                )
            }
        }
    }

    fileprivate func receive(_ sample: StatsSample) {
        guard liveStatus[sample.serverId] == "online" else { return }
        memoryBytes[sample.serverId] = sample.memoryBytes
        noticeHighCpu(sample)
    }

    /// Keeps the newest snapshot of the current generation (React metric store).
    fileprivate func receive(_ snapshot: MetricSnapshot) {
        let serverID = snapshot.serverId
        guard liveStatus[serverID] == "online" else { return }
        if let shown = metrics[serverID],
           shown.generation == snapshot.generation, shown.sequence >= snapshot.sequence {
            return
        }
        metrics[serverID] = snapshot
        metricsReceivedAt[serverID] = Date()
    }

    /// Fills the window after a start, or when the dashboard opens.
    func refreshMetrics(_ serverID: String) async {
        if let snapshot = await CoreClient.serverMetricHistory(id: serverID) {
            receive(snapshot)
        }
    }

    private func clearMetrics(_ serverID: String) {
        memoryBytes[serverID] = nil
        metrics[serverID] = nil
        metricsReceivedAt[serverID] = nil
    }

    /// React notifies only while its dashboard is open; here it works on any view.
    private func noticeHighCpu(_ sample: StatsSample) {
        guard let profile = serverProfile(sample.serverId), profile.notifyOnHighCpu else { return }
        let threshold = profile.notifyHighCpuThreshold ?? 90
        guard Double(sample.cpu) >= threshold else { return }
        if let last = lastHighCpuNotice[sample.serverId], Date().timeIntervalSince(last) < Self.highCpuCooldown {
            return
        }
        lastHighCpuNotice[sample.serverId] = Date()
        feedback.notifyInBackground(
            title: L10n.t("server.notification.highCpu"),
            body: "\(profile.name): \(Int(sample.cpu.rounded()))%"
        )
        #if DEBUG
        CaptureState.note("[capture] high cpu notice: \(profile.name) \(Int(sample.cpu.rounded()))%")
        #endif
    }

    #if DEBUG
    /// Capture tooling: fills a server's console and status without a process.
    func setForCapture(serverID: String, status: String, lines: [(String, LogLevel)], memory: UInt64?) {
        liveStatus[serverID] = status
        memoryBytes[serverID] = memory
        logs[serverID] = []
        for (text, level) in lines {
            receive(ConsoleLine(serverId: serverID, generation: 1, text: text, level: level, isStderr: false))
        }
    }
    #endif
}

/// Hops core callbacks onto the main queue in arrival order.
private final class RuntimeObserver: ServerEventObserver, @unchecked Sendable {
    private weak var runtime: ServerRuntime?

    init(runtime: ServerRuntime) {
        self.runtime = runtime
    }

    func onConsole(line: ConsoleLine) {
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated { self?.runtime?.receive(line) }
        }
    }

    func onStatus(change: StatusChange) {
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated { self?.runtime?.receive(change) }
        }
    }

    func onMetrics(snapshot: MetricSnapshot) {
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated { self?.runtime?.receive(snapshot) }
        }
    }

    func onStats(sample: StatsSample) {
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated { self?.runtime?.receive(sample) }
        }
    }
}
