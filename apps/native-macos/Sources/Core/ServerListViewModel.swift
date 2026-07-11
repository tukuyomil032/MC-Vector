import Foundation
import Observation

/// Drives the sidebar's server list.
///
/// Loads `Server` records from a `ServerStore`-backed JSON file and exposes
/// them for `List`/`ForEach`, along with the sidebar's current selection.
///
/// A first-run environment where `servers.json` doesn't exist on disk yet
/// is not an error from this view model's perspective: `load()` treats a
/// missing file as an empty list. Any other failure (corrupt JSON,
/// permission error, etc.) is surfaced via `error`, which `RootView`
/// presents through a real `.alert` (task 3-12 code-review fix -- see
/// `ServerListViewModelError`'s doc comment for why that's an `Identifiable`
/// wrapper rather than a plain `String?`).
@MainActor
@Observable
public final class ServerListViewModel {
    private let store: ServerStore
    /// Not `private` -- `RootView` needs the same `ServerProcessService`
    /// instance to build a `ServerLogViewModel` for the detail screen's log
    /// view (task 3-8), so log streaming reads from the same tracked
    /// process this view model started/stopped. `ServerListViewModel`
    /// itself has no log-related responsibility beyond exposing this;
    /// owning log-streaming state is `ServerLogViewModel`'s job, not this
    /// class's.
    public let processService: ServerProcessService
    /// Housekeeping handle for the background event-subscription `Task`, not
    /// UI-relevant state -- no view reads `processEventTask`, so there's no
    /// reason for it to participate in `@Observable`'s change tracking.
    /// `@ObservationIgnored` opts it out of `@ObservationTracked`'s macro
    /// expansion, which also sidesteps that macro's separate restriction on
    /// `nonisolated` mutable stored properties (irrelevant here anyway,
    /// since this property stays `@MainActor`-isolated like the rest of the
    /// class).
    ///
    /// Cancelling it from `deinit` is handled via `isolated deinit` (Swift
    /// 6.2, SE-0371) rather than making the property itself `nonisolated`:
    /// `deinit` is normally nonisolated even on a `@MainActor` class, but
    /// `isolated deinit` runs on the class's actor, so it can touch
    /// actor-isolated state (like this property) directly and safely, with
    /// no unsafe escape hatch and no cross-isolation gymnastics on the
    /// property declaration. Available here because this package's
    /// deployment target (`platforms: [.macOS(.v26)]` in `Package.swift`)
    /// is far above the feature's macOS 15.4+ minimum.
    @ObservationIgnored
    private var processEventTask: Task<Void, Never>?

    public private(set) var servers: [Server] = []
    public var selection: Server.ID?
    /// The most recent failure from `load()`, `startSelectedServer()`, or
    /// `stopSelectedServer()`, or `nil` if none is currently outstanding.
    /// `RootView` presents this via `.alert(_:isPresented:presenting:
    /// actions:message:)`, passing the snapshotted value through
    /// `presenting:` -- see `ServerListViewModelError`'s doc comment.
    public private(set) var error: ServerListViewModelError?

    /// Global, cross-server activity log for the Activity Drawer (task
    /// 3-10), newest-first (index 0 is the most recent entry). Session-only:
    /// unlike `servers` (backed by `ServerStore`/`servers.json`), this array
    /// is never persisted to disk and starts empty on every launch --
    /// activity history has a different, much simpler lifecycle than server
    /// definitions, so it doesn't need a store of its own.
    ///
    /// Populated from two places: `apply(_:)` (events delivered over
    /// `processService.events` -- a tracked process exiting cleanly
    /// (`.offline`) or crashing (`.crashed`), see `ServerProcessEvent`'s doc
    /// comment) and `startSelectedServer()`'s synchronous `.online` success
    /// path. Both funnel through the shared `appendActivity(forServerId:status:)`
    /// helper.
    ///
    /// `startSelectedServer()` logs its own `.online` entry directly rather
    /// than going through `processService.events` -- code review on task
    /// 3-10 (see git history) found that a successful start never produced
    /// an `ActivityEntry` at all, which contradicted the task spec's literal
    /// "起動/停止/バックアップ等のアクティビティ履歴を表示する" requirement.
    /// The original justification for omitting it (avoiding a second
    /// subscriber on `processService.events`) doesn't actually apply here:
    /// `startSelectedServer()` never touches that stream, so calling
    /// `appendActivity` directly from its success path adds no risk of a
    /// second consumer on the single-consumer `AsyncStream`.
    ///
    /// `stopSelectedServer()` deliberately does NOT get a matching
    /// "stop requested" entry at the point it issues the stop -- only the
    /// later `.offline`/`.crashed` entry, logged via `apply(_:)` once the
    /// process actually exits. A stop's outcome is inherently uncertain
    /// until the process really terminates (see that method's doc comment:
    /// the actor's termination monitor is the single source of truth), so
    /// logging an entry the moment the request is merely issued would be a
    /// weaker, and arguably misleading, signal than a start's -- unlike
    /// `startSelectedServer()`, where `.online` is already known for certain
    /// by the time this code runs. Double-logging "stop requested" +
    /// "stop completed" would also just clutter the drawer with two entries
    /// for one user action; the spec asks for stop activity to be visible,
    /// and the existing single offline/crashed entry already satisfies that.
    ///
    /// Bounded to `activityLogCap` entries (oldest dropped first) so a long
    /// session doesn't grow this array unboundedly -- same trim-on-overflow
    /// principle as `LogLineBuffer`, simplified to a plain array trim since
    /// process events arrive far less frequently than log lines.
    public private(set) var activityLog: [ActivityEntry] = []

    /// Maximum number of entries retained in `activityLog`. Not `static` --
    /// overridable per-instance (see `init`) so tests can exercise the
    /// trim-on-overflow path with a small cap instead of needing hundreds of
    /// real process launches.
    private let activityLogCap: Int

    /// The currently selected `Server`, resolved from `selection` against
    /// `servers`. `nil` when nothing is selected, and also `nil` when
    /// `selection` no longer matches any loaded server (e.g. it was
    /// deleted, or a stale id survived a reload) -- callers such as
    /// `RootView`'s detail pane fall back to a placeholder in both cases
    /// without needing to distinguish them.
    public var selectedServer: Server? {
        self.servers.first(where: { $0.id == self.selection })
    }

    /// Injectable initializer. Tests should use this with a `ServerStore`
    /// pointed at a temp file (see `ServerStoreTests` for the pattern) so
    /// they never touch the real Application Support directory, and
    /// (optionally) a dedicated `ServerProcessService` so process-related
    /// tests don't share state with other tests' server instances.
    public init(
        store: ServerStore,
        processService: ServerProcessService = ServerProcessService(),
        activityLogCap: Int = 200,
    ) {
        self.store = store
        self.processService = processService
        self.activityLogCap = activityLogCap
        // @MainActor is this class's inherited isolation, but nothing in
        // this task's synchronous prefix needs it -- fetching `events` is
        // itself a cross-actor call, and the loop body only touches `self`
        // after each `await`, at which point it's back on the main actor to
        // update `servers`. Per the swift-concurrency skill: nothing before
        // the first `await` needs `@MainActor`, so this task doesn't need
        // to inherit it either; it just hops back via actor-isolated `self`
        // access after each event.
        self.processEventTask = Task { @concurrent [weak self, processService] in
            for await event in processService.events {
                await self?.apply(event)
            }
        }
    }

    /// Production default: points the underlying `ServerStore` at the
    /// app's real on-disk location under Application Support.
    public convenience init() {
        self.init(store: ServerStore(fileURL: ServerStore.defaultFileURL()))
    }

    isolated deinit {
        self.processEventTask?.cancel()
    }

    /// Loads servers from disk, updating `servers`. Treats a missing file
    /// (first run, nothing saved yet) as an empty list rather than an
    /// error; any other failure is recorded in `error`.
    public func load() async {
        do {
            let file = try await self.store.load()
            self.servers = file.servers
            self.error = nil
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            self.servers = []
            self.error = nil
        } catch {
            self.error = ServerListViewModelError(message: error.localizedDescription)
        }
    }

    /// Starts the currently selected server's Java process via
    /// `ServerProcessService`.
    ///
    /// Sets `.starting` optimistically before the call so the toolbar
    /// reflects the in-flight request immediately, then `.online` once
    /// `start(server:)` returns successfully -- that's known synchronously
    /// at that point, so it doesn't need to round-trip through
    /// `processService.events`. On failure, reverts to the server's prior
    /// status and surfaces the error via `error` (e.g. a missing Java path),
    /// which `RootView` presents as a real alert.
    public func startSelectedServer() async {
        guard let server = self.selectedServer else { return }

        self.setStatus(.starting, forServerId: server.id)
        self.error = nil

        do {
            try await self.processService.start(server: server)
            self.setStatus(.online, forServerId: server.id)
            // Logged directly here, not via `processService.events` -- see
            // `activityLog`'s doc comment for why this is safe (no stream
            // contact) and why the task spec requires it (a successful
            // start is an activity, same as a stop/crash).
            self.appendActivity(forServerId: server.id, status: .online)
        } catch {
            self.setStatus(server.status, forServerId: server.id)
            self.error = ServerListViewModelError(message: error.localizedDescription)
        }
    }

    /// Stops the currently selected server's Java process via
    /// `ServerProcessService`.
    ///
    /// Sets `.stopping` optimistically before the call. The definitive
    /// outcome (`.offline` on clean exit, `.crashed` otherwise) is left to
    /// `processService.events` -- the actor's termination monitor is the
    /// single source of truth for whether the process actually exited, so
    /// this method doesn't guess at a final state itself. Only a failure to
    /// even issue the stop (e.g. it wasn't running) reverts the optimistic
    /// status here.
    public func stopSelectedServer() async {
        guard let server = self.selectedServer else { return }

        self.setStatus(.stopping, forServerId: server.id)
        self.error = nil

        do {
            try await self.processService.stop(serverId: server.id)
        } catch {
            self.setStatus(server.status, forServerId: server.id)
            self.error = ServerListViewModelError(message: error.localizedDescription)
        }
    }

    /// Clears the currently displayed `error`, if any. `RootView`'s alert
    /// calls this from its dismiss/OK action -- `error` is `private(set)`,
    /// so the view can't `nil` it out directly, matching how `servers` and
    /// `activityLog` are only ever mutated through this class's own methods.
    public func clearError() {
        self.error = nil
    }

    /// The sole subscriber to `processService.events` -- handles both jobs
    /// (status update and activity logging) for a single event delivery,
    /// per this task's constraint against adding a second
    /// `for await event in processService.events` loop: `processService.events`
    /// is single-consumer, and this `apply(_:)` method is already the one
    /// and only subscriber (see `init`'s `processEventTask`). Not the only
    /// place activity entries are appended, though -- see
    /// `appendActivity(forServerId:status:)`'s doc comment; the other caller
    /// is `startSelectedServer()`'s synchronous success path, which never
    /// touches this stream.
    ///
    /// **Skips `.online` events** (task 5-1). The actor now emits `.online`
    /// on a successful `start(server:)` for the benefit of downstream
    /// subscribers (e.g. Phase 5's `ServerPerformanceService`), but this
    /// view model already applies the `.online` transition synchronously
    /// from `startSelectedServer()`'s success path -- doing it again here
    /// would double-log an `ActivityEntry` for a single user action and
    /// re-set an already-current `.online` status. Only the terminal
    /// transitions (`.offline`/`.crashed`), which this actor is the single
    /// source of truth for (see `stop`'s doc comment), are still applied
    /// here.
    private func apply(_ event: ServerProcessEvent) {
        guard event.status != .online else { return }
        self.setStatus(event.status, forServerId: event.serverId)
        self.appendActivity(forServerId: event.serverId, status: event.status)
    }

    /// Constructs and inserts a single `ActivityEntry`, shared by both
    /// `apply(_:)` (event-driven: `.offline`/`.crashed`) and
    /// `startSelectedServer()`'s success path (direct/synchronous:
    /// `.online`) -- see `activityLog`'s doc comment for why the latter
    /// bypasses the event stream entirely rather than routing through it.
    ///
    /// Resolves `serverId` against `servers` *before* appending, so the
    /// stored `ActivityEntry.serverName` is a snapshot rather than a live
    /// lookup -- see `ActivityEntry.serverName`'s doc comment. Falls back to
    /// the raw id on a lookup miss (should not happen in practice, since
    /// `setStatus` runs against the same `servers` array moments earlier in
    /// both callers, but avoids ever losing an entry over a resolution
    /// failure).
    private func appendActivity(forServerId serverId: String, status: ServerStatus) {
        let serverName = self.servers.first(where: { $0.id == serverId })?.name ?? serverId
        let entry = ActivityEntry(
            serverId: serverId,
            serverName: serverName,
            kind: .serverStatusChange(status),
        )
        self.activityLog.insert(entry, at: 0)
        if self.activityLog.count > self.activityLogCap {
            self.activityLog.removeLast(self.activityLog.count - self.activityLogCap)
        }
    }

    private func setStatus(_ status: ServerStatus, forServerId serverId: String) {
        guard let index = self.servers.firstIndex(where: { $0.id == serverId }) else { return }
        self.servers[index].status = status
    }
}
