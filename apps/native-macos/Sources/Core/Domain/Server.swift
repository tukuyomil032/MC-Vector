/// A running (or runnable) Minecraft server instance.
///
/// Mirrors the TypeScript `MinecraftServer` interface in
/// `src/renderer/shared/server declaration.ts` on the Tauri Classic side.
/// JSON keys match the TS property names exactly (camelCase, no
/// snake_case conversion), so `Codable` synthesis lines up automatically
/// without custom `CodingKeys`.
///
/// `createdDate` is kept as a plain ISO-8601 `String` rather than decoded
/// into `Date` — the JSON on disk stores it as a string, and introducing a
/// custom `JSONDecoder.dateDecodingStrategy` is out of scope for this task.
public struct Server: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var profileName: String?
    public var groupName: String?
    public var version: String
    public var software: String
    public var port: Int
    public var memory: Int
    public var path: String
    public var status: ServerStatus
    public var javaPath: String?
    public var autoRestartOnCrash: Bool?
    public var maxAutoRestarts: Int?
    public var autoRestartDelaySec: Int?
    public var autoBackupEnabled: Bool?
    public var autoBackupIntervalMin: Int?
    public var autoBackupScheduleType: AutoBackupScheduleType?
    public var autoBackupTime: String?
    public var autoBackupWeekday: Int?
    public var autoBackupRetainCount: Int?
    public var autoBackupRetainDays: Int?
    public var createdDate: String?
    public var jvmArgs: String?
    public var notifyOnCrash: Bool?
    public var notifyOnStart: Bool?
    public var notifyOnHighCpu: Bool?
    public var notifyHighCpuThreshold: Int?

    public init(
        id: String,
        name: String,
        profileName: String? = nil,
        groupName: String? = nil,
        version: String,
        software: String,
        port: Int,
        memory: Int,
        path: String,
        status: ServerStatus,
        javaPath: String? = nil,
        autoRestartOnCrash: Bool? = nil,
        maxAutoRestarts: Int? = nil,
        autoRestartDelaySec: Int? = nil,
        autoBackupEnabled: Bool? = nil,
        autoBackupIntervalMin: Int? = nil,
        autoBackupScheduleType: AutoBackupScheduleType? = nil,
        autoBackupTime: String? = nil,
        autoBackupWeekday: Int? = nil,
        autoBackupRetainCount: Int? = nil,
        autoBackupRetainDays: Int? = nil,
        createdDate: String? = nil,
        jvmArgs: String? = nil,
        notifyOnCrash: Bool? = nil,
        notifyOnStart: Bool? = nil,
        notifyOnHighCpu: Bool? = nil,
        notifyHighCpuThreshold: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.profileName = profileName
        self.groupName = groupName
        self.version = version
        self.software = software
        self.port = port
        self.memory = memory
        self.path = path
        self.status = status
        self.javaPath = javaPath
        self.autoRestartOnCrash = autoRestartOnCrash
        self.maxAutoRestarts = maxAutoRestarts
        self.autoRestartDelaySec = autoRestartDelaySec
        self.autoBackupEnabled = autoBackupEnabled
        self.autoBackupIntervalMin = autoBackupIntervalMin
        self.autoBackupScheduleType = autoBackupScheduleType
        self.autoBackupTime = autoBackupTime
        self.autoBackupWeekday = autoBackupWeekday
        self.autoBackupRetainCount = autoBackupRetainCount
        self.autoBackupRetainDays = autoBackupRetainDays
        self.createdDate = createdDate
        self.jvmArgs = jvmArgs
        self.notifyOnCrash = notifyOnCrash
        self.notifyOnStart = notifyOnStart
        self.notifyOnHighCpu = notifyOnHighCpu
        self.notifyHighCpuThreshold = notifyHighCpuThreshold
    }
}
