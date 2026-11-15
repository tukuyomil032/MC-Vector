// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// The four player lists of one server (UI-009, React UsersView): loading,
/// adding and removing, and the live console command while the server runs.
@MainActor
@Observable
final class UsersModel {
    enum Load: Equatable {
        case loading
        case loaded
        case failed(CoreError)
    }

    let serverID: String
    private(set) var load: Load = .loading
    private(set) var lists = PlayerListSnapshot(whitelist: [], ops: [], bannedPlayers: [], bannedIps: [])
    /// Lists with an add in flight (the Add button shows a spinner).
    private(set) var pendingAdds: Set<PlayerListKind> = []
    /// True once a load succeeded; a later failure keeps the lists on screen.
    private(set) var hasLoaded = false
#if DEBUG
    /// Holds an add after the spinner appears so capture.sh can photograph it.
    var capturePendingAddDelay: Duration?
#endif

    @ObservationIgnored private var reloadTask: Task<Void, Never>?

    init(serverID: String) {
        self.serverID = serverID
    }

    func entries(_ list: PlayerListKind) -> [PlayerEntry] {
        switch list {
        case .whitelist: lists.whitelist
        case .ops: lists.ops
        case .bannedPlayers: lists.bannedPlayers
        case .bannedIps: lists.bannedIps
        }
    }

    func reload() async {
        if !hasLoaded { load = .loading }
        do {
            let snapshot = try await CoreClient.playerLists(serverID: serverID)
            withAnimation(Motion.standard) { lists = snapshot }
            hasLoaded = true
            load = .loaded
        } catch {
            load = .failed(error)
        }
    }

    enum AddOutcome: Equatable {
        /// Saved (or already there): clear the field.
        case done
        /// The name or address was rejected: show this under the field.
        case invalid(String)
        /// Another failure, already reported.
        case failed
    }

    func add(
        _ value: String, to list: PlayerListKind, runtime: ServerRuntime, feedback: FeedbackCenter
    ) async -> AddOutcome {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            return .invalid(L10n.t(list == .bannedIps ? "users.validation.ipRequired" : "users.validation.playerRequired"))
        }
        pendingAdds.insert(list)
        defer { pendingAdds.remove(list) }
#if DEBUG
        if let delay = capturePendingAddDelay {
            capturePendingAddDelay = nil
            try? await Task.sleep(for: delay)
        }
#endif
        do {
            let result = try await CoreClient.mutatePlayerList(
                serverID: serverID, list: list, action: .add, value: value)
            withAnimation(Motion.standard) { lists = result.lists }
            guard result.changed else {
                feedback.toast(.info, L10n.t("users.toast.alreadyExists"))
                return .done
            }
            await applyLive(list: list, action: .add, target: result.canonicalTarget, runtime: runtime,
                done: L10n.t("users.toast.listUpdated"), feedback: feedback)
            return .done
        } catch {
            if error.code == "player.invalid_name" || error.code == "player.invalid_ip" {
                return .invalid(error.uiText)
            }
            feedback.showError(L10n.t("users.toast.addFailed"), message: error.uiText)
            return .failed
        }
    }

    func remove(
        _ identifier: String, from list: PlayerListKind, runtime: ServerRuntime, feedback: FeedbackCenter
    ) async {
        do {
            let result = try await CoreClient.mutatePlayerList(
                serverID: serverID, list: list, action: .remove, value: identifier)
            withAnimation(Motion.standard) { lists = result.lists }
            await applyLive(list: list, action: .remove, target: result.canonicalTarget, runtime: runtime,
                done: L10n.t("users.toast.removed"), feedback: feedback)
        } catch {
            feedback.showError(L10n.t("users.toast.removeFailed"), message: error.uiText)
        }
    }

    /// While the server runs, the file change alone is not picked up: send the
    /// matching command, then read the lists again once the server wrote them.
    /// A failed command does not undo the saved list (UI-009).
    private func applyLive(
        list: PlayerListKind, action: PlayerListAction, target: String, runtime: ServerRuntime,
        done: String, feedback: FeedbackCenter
    ) async {
        guard runtime.status(of: serverID) == "online" else {
            feedback.toast(.success, done)
            return
        }
        do {
            try await runtime.send(PlayerListCommand.command(for: list, action: action, target: target), to: serverID)
            feedback.toast(.success, done)
        } catch {
            // Saved, but not applied: a warning, not a failure.
            feedback.toast(.warning, L10n.t("users.toast.liveCommandFailed"))
        }
        reloadTask?.cancel()
        reloadTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            await self?.reload()
        }
    }
}
