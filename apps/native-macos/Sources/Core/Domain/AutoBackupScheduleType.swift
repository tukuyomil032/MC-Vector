/// How an automatic backup schedule is expressed for a server.
///
/// Mirrors the TypeScript `autoBackupScheduleType` union
/// (`'interval' | 'daily' | 'weekly'`) shared by `MinecraftServer` and
/// `ServerTemplate` in `src/renderer/shared/server declaration.ts` /
/// `src/lib/server-commands.ts`.
public enum AutoBackupScheduleType: String, Codable, Sendable, Equatable, CaseIterable {
    case interval
    case daily
    case weekly
}
