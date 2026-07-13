import Foundation
import Observation

/// A single TPS sample the Dashboard's TPS chart plots against time.
///
/// Extracted as its own value type (rather than a bare tuple) so
/// Swift Charts' `ForEach`/`AreaMark` can key on a stable `Identifiable`
/// id across window-trim events -- same rationale as `ServerMetrics.id`
/// (see that type's doc). The `id` is per-sample so a rebuilt window
/// after trim still identifies rows uniquely.
public struct TPSPoint: Sendable, Identifiable, Equatable {
    public let id: UUID
    public let timestamp: Date
    public let value: Double

    public init(id: UUID = UUID(), timestamp: Date, value: Double) {
        self.id = id
        self.timestamp = timestamp
        self.value = value
    }
}

/// Drives the Dashboard's live KPI cards + Swift Charts panels for a
/// single running server (task 5-4). Owns three long-lived background
/// tasks that each drain one upstream `AsyncStream`:
///
/// - **metrics** — `ServerPerformanceService.stream(for:processService:)`,
///   the 1 Hz CPU/memory sampler wired up in task 5-2. Appends every
///   sample to `metrics`, then trims to the 60 s rolling window.
/// - **stdout** — `ServerProcessService.stdoutLines(serverId:)`, the
///   broadcaster added in task 5-1. Every line is fed through
///   `TPSExtractor` (task 5-3); non-`nil` results become `TPSPoint`s in
///   `tpsHistory` under the same 60 s window rule.
/// - **events** — `ServerProcessService.events`, filtered by our
///   `serverId`. `.online` sets `startedAt = Date()`; `.offline` and
///   `.crashed` reset `startedAt` to `nil` and update `currentStatus`.
///
/// **Why three separate `Task`s rather than one `withTaskGroup`.** The
/// three streams have unrelated lifecycles: `metrics` ends when the
/// process exits, `stdout` ends on pipe EOF, `events` runs for the
/// service's whole lifetime. Bundling them under one group would tie
/// the earliest-finisher's exit to the whole group's exit unless we
/// added child-Task juggling, whereas three independent stored
/// handles cancel cleanly and independently in `deinit`. This matches
/// `ServerListViewModel`'s single-Task pattern (see its
/// `processEventTask` doc for the `isolated deinit` + `@ObservationIgnored`
/// rationale), scaled up to three properties.
///
/// **Multi-consumer safe on stdout.** `ServerProcessService.stdoutLines`
/// became a broadcaster in task 5-1 specifically so this view model
/// can subscribe concurrently with `ServerLogViewModel` on the same
/// running server without either doubling the pipe reader or splitting
/// bytes between them; see that method's doc for the fan-out contract.
///
/// **Bootstrapping `startedAt` from the passed-in `Server`.** If the
/// Dashboard opens on a server that is already `.online`, we don't have
/// the historical `.online` event to key off (events are single-consumer
/// per subscribe, so we can't replay). Mirrors the Tauri reference
/// (`DashboardView.tsx`'s `useState(server.status === 'online'
/// ? Date.now() : null)`): initial `startedAt` = `Date()` when the
/// server is already `.online` at construction, otherwise `nil`. Uptime
/// then counts from the moment the view opened rather than from the
/// unknown-to-us historical start, which matches the Tauri behaviour
/// exactly.
@MainActor
@Observable
public final class DashboardViewModel {
    /// The rolling 60 s window of 1 Hz CPU/memory samples driving the
    /// CPU and Memory charts. Newest sample is `.last`. Trimmed on every
    /// append via `Self.pruneWindow`.
    public private(set) var metrics: [ServerMetrics] = []

    /// The rolling 60 s window of TPS values parsed out of stdout via
    /// `TPSExtractor`. Newest is `.last`. Same trim rule as `metrics`.
    public private(set) var tpsHistory: [TPSPoint] = []

    /// Wall-clock time the current run of this server was first observed
    /// as `.online`. `nil` when the server is not currently running.
    public private(set) var startedAt: Date?

    /// Last-seen status for this server. Updated by the events task.
    public private(set) var currentStatus: ServerStatus

    /// Seconds since `startedAt`, or `nil` if the server isn't running.
    /// Recomputed on every read -- Dashboard's uptime KPI wraps its
    /// consumer in a `TimelineView(.periodic(...))` so this getter is
    /// re-evaluated once per second without any timer state living
    /// here.
    public var uptime: TimeInterval? {
        guard let startedAt else { return nil }
        return Date().timeIntervalSince(startedAt)
    }

    /// Latest CPU sample, or `nil` if no sample has arrived yet. Multi-
    /// core so it may exceed 100 % — see `ServerMetrics.cpu`'s doc.
    public var currentCPU: Double? {
        self.metrics.last?.cpu
    }

    /// Latest RSS in bytes, or `nil` if no sample has arrived yet.
    public var currentMemoryBytes: UInt64? {
        self.metrics.last?.memoryBytes
    }

    /// Latest parsed TPS, or `nil` if none has arrived in the window.
    public var currentTPS: Double? {
        self.tpsHistory.last?.value
    }

    private let serverId: String
    private let processService: ServerProcessService
    private let performanceService: ServerPerformanceService
    private let tpsExtractor = TPSExtractor()

    /// Background Task handles — housekeeping, no view reads them, so
    /// opted out of `@Observable`'s tracking (same rationale as
    /// `ServerListViewModel.processEventTask`). Cancelled from
    /// `isolated deinit` — that runs on this class's `@MainActor` so it
    /// can touch these actor-isolated stored properties directly.
    @ObservationIgnored
    private var metricsTask: Task<Void, Never>?
    @ObservationIgnored
    private var stdoutTask: Task<Void, Never>?
    @ObservationIgnored
    private var eventsTask: Task<Void, Never>?

    /// - Parameter server: initial snapshot -- used only to seed
    ///   `currentStatus` and (when `.online`) `startedAt`. The view model
    ///   never re-reads this after `init`; live status updates flow
    ///   entirely through `processService.events`.
    public init(
        server: Server,
        processService: ServerProcessService,
        performanceService: ServerPerformanceService,
    ) {
        self.serverId = server.id
        self.processService = processService
        self.performanceService = performanceService
        self.currentStatus = server.status
        self.startedAt = server.status == .online ? Date() : nil
        self.startTasks()
    }

    isolated deinit {
        self.metricsTask?.cancel()
        self.stdoutTask?.cancel()
        self.eventsTask?.cancel()
    }

    private func startTasks() {
        let serverId = self.serverId
        let processService = self.processService
        let performanceService = self.performanceService

        // metrics — 1 Hz CPU/memory sampler. `stream(for:processService:)`
        // is `nonisolated` and creates its own `@concurrent` sampler
        // Task internally, so this outer Task hop is only for the
        // `@MainActor` re-entry after each yielded `ServerMetrics`.
        self.metricsTask = Task { @concurrent [weak self] in
            let stream = performanceService.stream(for: serverId, processService: processService)
            for await sample in stream {
                await self?.append(metric: sample)
            }
        }

        // stdout — TPS extractor. `stdoutLines(serverId:)` returns `nil`
        // if there's no live process yet (Dashboard opened before start,
        // or already-drained); the ViewModel simply has nothing to do
        // in that case, and the events task will still receive `.online`
        // when start happens. If we wanted to re-subscribe on `.online`,
        // we'd chain that into the events task; for the current scope
        // Dashboard is opened while running, matching the Tauri flow.
        self.stdoutTask = Task { @concurrent [weak self] in
            guard let stream = await processService.stdoutLines(serverId: serverId) else { return }
            let extractor = TPSExtractor()
            for await line in stream {
                if let value = extractor.extract(from: line) {
                    await self?.appendTPS(value: value, timestamp: Date())
                }
            }
        }

        // events — filtered by our serverId. Terminal transitions
        // (`.offline`/`.crashed`) clear `startedAt`; `.online` sets it.
        self.eventsTask = Task { @concurrent [weak self, processService] in
            for await event in processService.events where event.serverId == serverId {
                await self?.handle(event: event)
            }
        }
    }

    /// Not `private` -- called by the events task, and exposed at
    /// package internal so `DashboardViewModelTests` can drive the
    /// `.online`/`.offline`/`.crashed` state machine directly without
    /// having to spin up a real `ServerProcessService` + child process.
    func handle(event: ServerProcessEvent) {
        self.currentStatus = event.status
        switch event.status {
        case .online:
            self.startedAt = Date()
        case .offline, .crashed:
            self.startedAt = nil
        case .starting, .stopping, .restarting:
            // Optimistic in-flight states are set by the caller-side
            // view model (`ServerListViewModel`), not the process
            // actor; the actor emits only .online/.offline/.crashed
            // (see `ServerProcessEvent`'s doc). Nothing to do here.
            break
        }
    }

    /// Not `private` for the same reason as `handle(event:)` above.
    func append(metric: ServerMetrics) {
        self.metrics.append(metric)
        self.metrics = ServerMetrics.pruneMetricWindow(self.metrics, now: metric.timestamp)
    }

    /// Not `private` for the same reason as `handle(event:)` above.
    func appendTPS(value: Double, timestamp: Date) {
        self.tpsHistory.append(TPSPoint(timestamp: timestamp, value: value))
        self.tpsHistory = Self.pruneWindow(self.tpsHistory, now: timestamp) { $0.timestamp }
    }

    /// Generic rolling-window trim used by `tpsHistory`. Extracted as a
    /// static function so `DashboardViewModelTests` can call it with a
    /// synthetic array without constructing a whole view model, and so
    /// `ServerMetrics.pruneMetricWindow` (which already has a
    /// concrete-type version for `[ServerMetrics]`) doesn't have to be
    /// generalised into `Domain` just for this one call site.
    ///
    /// A sample exactly at the boundary is retained (`<=`), matching
    /// `ServerMetrics.pruneMetricWindow`'s doc for the same reason: the
    /// chart shouldn't briefly flicker down to N-1 samples on the frame
    /// the deadline is hit.
    public nonisolated static func pruneWindow<T>(
        _ items: [T],
        now: Date,
        windowSeconds: TimeInterval = ServerMetrics.defaultWindowSeconds,
        timestamp: (T) -> Date,
    ) -> [T] {
        items.filter { now.timeIntervalSince(timestamp($0)) <= windowSeconds }
    }
}

/// Formats a seconds-of-elapsed-time interval as `HH:MM:SS`, zero-
/// padded on all three fields, matching the Tauri reference's
/// `formatUptime` (`src/renderer/components/DashboardView.tsx`).
///
/// Negative input is clamped to zero (the Date-arithmetic caller
/// upstream can produce a very small negative if a system clock skew
/// happens between `startedAt` capture and `now`); the placeholder for
/// "not currently running" is `nil`-in / `--:--:--`-out, handled at the
/// call site rather than here.
///
/// Free function rather than a static on `DashboardViewModel` so
/// `DashboardView` and the tests can both call it without importing
/// the whole view model surface. `internal` (default) so tests can see
/// it via `@testable import Core`.
func formatUptime(_ seconds: TimeInterval) -> String {
    let clamped = max(0, Int(seconds))
    let hours = clamped / 3600
    let minutes = (clamped % 3600) / 60
    let secs = clamped % 60
    return String(format: "%02d:%02d:%02d", hours, minutes, secs)
}
