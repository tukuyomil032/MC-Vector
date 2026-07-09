/// Lifecycle state of a Minecraft server instance.
///
/// Mirrors the TypeScript `ServerStatus` union in
/// `src/renderer/shared/server declaration.ts` on the Tauri Classic side.
/// The raw string values are the JSON wire format and must stay in sync
/// with that union.
public enum ServerStatus: String, Codable, Sendable, Equatable, CaseIterable {
    case online
    case offline
    case starting
    case stopping
    case restarting
    case crashed
}
