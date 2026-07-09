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
    /// they never touch the real Application Support directory.
    public init(store: ServerStore) {
        self.store = store
    }

    /// Production default: points the underlying `ServerStore` at the
    /// app's real on-disk location under Application Support.
    public convenience init() {
        self.init(store: ServerStore(fileURL: ServerStore.defaultFileURL()))
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
}
