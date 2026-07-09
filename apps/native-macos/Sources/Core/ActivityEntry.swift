import Foundation

/// A single entry in `ServerListViewModel.activityLog` -- a lightweight,
/// display-only record of something that happened to a tracked server.
///
/// Unlike `Server` (which mirrors a TypeScript domain type over a JSON wire
/// format, and so constrains dates to ISO8601 `String`s -- see
/// `Server.createdDate`), `ActivityEntry` has no cross-language contract and
/// is never persisted (see `ServerListViewModel.activityLog`'s doc comment
/// for why): a plain `Date` is the right, simple choice for `timestamp`.
public struct ActivityEntry: Sendable, Identifiable, Equatable {
    /// What kind of thing happened. Currently only tracks process status
    /// changes -- both those observed via `ServerProcessService.events`
    /// (`.offline`/`.crashed`, applied by `ServerListViewModel.apply(_:)`)
    /// and the synchronous `.online` transition `ServerListViewModel
    /// .startSelectedServer()` logs directly on a successful start. Both
    /// paths construct entries through `ServerListViewModel
    /// .appendActivity(forServerId:status:)`.
    ///
    /// Deliberately an enum rather than folding `ServerStatus` directly into
    /// `ActivityEntry` -- this app has no backup feature/service implemented
    /// anywhere yet (`Server.autoBackup*` fields exist on the domain model,
    /// but nothing schedules or runs a backup), so there is nothing to log
    /// for it today. `Kind` exists so a future case such as
    /// `.backupCompleted` can be added later without reshaping
    /// `ActivityEntry` itself or this file's callers.
    public enum Kind: Sendable, Equatable {
        case serverStatusChange(ServerStatus)
    }

    public let id: UUID
    public let serverId: String
    /// Resolved from `ServerListViewModel.servers` at append time (not
    /// looked up lazily when the drawer renders) so a server later removed
    /// from `servers` can't leave this entry with a dangling reference --
    /// the drawer can always render a name for a historical entry, even for
    /// a server that no longer exists.
    public let serverName: String
    public let kind: Kind
    public let timestamp: Date

    public init(
        id: UUID = UUID(),
        serverId: String,
        serverName: String,
        kind: Kind,
        timestamp: Date = Date(),
    ) {
        self.id = id
        self.serverId = serverId
        self.serverName = serverName
        self.kind = kind
        self.timestamp = timestamp
    }
}
