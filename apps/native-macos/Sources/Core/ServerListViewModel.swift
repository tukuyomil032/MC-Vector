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
/// permission error, etc.) is surfaced via `errorMessage` -- a full
/// error-alert UI is out of scope for this task, but the failure is at
/// least visible rather than silently swallowed.
@MainActor
@Observable
public final class ServerListViewModel {
    private let store: ServerStore
    private let processService: ServerProcessService
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
    public private(set) var errorMessage: String?

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
    public init(store: ServerStore, processService: ServerProcessService = ServerProcessService()) {
        self.store = store
        self.processService = processService
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
    /// error; any other failure is recorded in `errorMessage`.
    public func load() async {
        do {
            let file = try await self.store.load()
            self.servers = file.servers
            self.errorMessage = nil
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            self.servers = []
            self.errorMessage = nil
        } catch {
            self.errorMessage = error.localizedDescription
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
    /// status and surfaces the error via `errorMessage` (e.g. a missing
    /// Java path).
    public func startSelectedServer() async {
        guard let server = self.selectedServer else { return }

        self.setStatus(.starting, forServerId: server.id)
        self.errorMessage = nil

        do {
            try await self.processService.start(server: server)
            self.setStatus(.online, forServerId: server.id)
        } catch {
            self.setStatus(server.status, forServerId: server.id)
            self.errorMessage = error.localizedDescription
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
        self.errorMessage = nil

        do {
            try await self.processService.stop(serverId: server.id)
        } catch {
            self.setStatus(server.status, forServerId: server.id)
            self.errorMessage = error.localizedDescription
        }
    }

    private func apply(_ event: ServerProcessEvent) {
        self.setStatus(event.status, forServerId: event.serverId)
    }

    private func setStatus(_ status: ServerStatus, forServerId serverId: String) {
        guard let index = self.servers.firstIndex(where: { $0.id == serverId }) else { return }
        self.servers[index].status = status
    }
}
