/// A reusable server configuration that has not been instantiated yet.
///
/// Mirrors the TypeScript `ServerTemplate` interface in
/// `src/lib/server-commands.ts` — the same shape as `Server`/
/// `MinecraftServer` minus `path` and `status`, since a template isn't a
/// running (or even provisioned) instance.
public struct ServerTemplate: Codable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var profileName: String?
    public var groupName: String?
    public var version: String
    public var software: String
    public var port: Int
    public var memory: Int
    public var javaPath: String?
    public var autoRestartOnCrash: Bool?
    public var maxAutoRestarts: Int?
    public var autoRestartDelaySec: Int?
    public var autoBackupEnabled: Bool?
    public var autoBackupIntervalMin: Int?
    public var autoBackupScheduleType: AutoBackupScheduleType?
    public var autoBackupTime: String?
    public var autoBackupWeekday: Int?

    public init(
        id: String,
        name: String,
        profileName: String? = nil,
        groupName: String? = nil,
        version: String,
        software: String,
        port: Int,
        memory: Int,
        javaPath: String? = nil,
        autoRestartOnCrash: Bool? = nil,
        maxAutoRestarts: Int? = nil,
        autoRestartDelaySec: Int? = nil,
        autoBackupEnabled: Bool? = nil,
        autoBackupIntervalMin: Int? = nil,
        autoBackupScheduleType: AutoBackupScheduleType? = nil,
        autoBackupTime: String? = nil,
        autoBackupWeekday: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.profileName = profileName
        self.groupName = groupName
        self.version = version
        self.software = software
        self.port = port
        self.memory = memory
        self.javaPath = javaPath
        self.autoRestartOnCrash = autoRestartOnCrash
        self.maxAutoRestarts = maxAutoRestarts
        self.autoRestartDelaySec = autoRestartDelaySec
        self.autoBackupEnabled = autoBackupEnabled
        self.autoBackupIntervalMin = autoBackupIntervalMin
        self.autoBackupScheduleType = autoBackupScheduleType
        self.autoBackupTime = autoBackupTime
        self.autoBackupWeekday = autoBackupWeekday
    }
}
