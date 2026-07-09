/// Top-level shape of the on-disk `servers.json` document.
///
/// Matches the object the Tauri Classic app persists via
/// `@tauri-apps/plugin-store`: `{ "servers": [...], "serverTemplates": [...] }`.
public struct ServersFile: Codable, Sendable, Equatable {
    public var servers: [Server]
    public var serverTemplates: [ServerTemplate]

    public init(servers: [Server] = [], serverTemplates: [ServerTemplate] = []) {
        self.servers = servers
        self.serverTemplates = serverTemplates
    }
}
