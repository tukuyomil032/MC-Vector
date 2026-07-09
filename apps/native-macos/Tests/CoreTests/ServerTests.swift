import Foundation
import Testing
@testable import Core

private func makeMinimalServer() -> Server {
    Server(
        id: "srv-1",
        name: "Survival",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 4096,
        path: "/servers/survival",
        status: .online,
    )
}

private func makeFullServer() -> Server {
    Server(
        id: "srv-2",
        name: "Modded",
        profileName: "profile-a",
        groupName: "group-a",
        version: "1.20.1",
        software: "forge",
        port: 25566,
        memory: 8192,
        path: "/servers/modded",
        status: .starting,
        javaPath: "/usr/bin/java",
        autoRestartOnCrash: true,
        maxAutoRestarts: 3,
        autoRestartDelaySec: 30,
        autoBackupEnabled: true,
        autoBackupIntervalMin: 60,
        autoBackupScheduleType: .daily,
        autoBackupTime: "03:00",
        autoBackupWeekday: 1,
        autoBackupRetainCount: 5,
        autoBackupRetainDays: 14,
        createdDate: "2026-01-01T00:00:00.000Z",
        jvmArgs: "-Xmx8G -Xms8G",
        notifyOnCrash: true,
        notifyOnStart: false,
        notifyOnHighCpu: true,
        notifyHighCpuThreshold: 90,
    )
}

@Test("Server with all optional fields absent round-trips through JSON")
func serverMinimalRoundTrips() throws {
    let original = makeMinimalServer()

    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(Server.self, from: data)

    #expect(decoded == original)
    #expect(decoded.profileName == nil)
    #expect(decoded.autoBackupScheduleType == nil)
}

@Test("Server with all optional fields present round-trips through JSON")
func serverFullRoundTrips() throws {
    let original = makeFullServer()

    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(Server.self, from: data)

    #expect(decoded == original)
    #expect(decoded.autoBackupScheduleType == .daily)
}

@Test("Server decodes from JSON that omits optional keys entirely")
func serverDecodesWhenOptionalKeysAreMissing() throws {
    let json = """
    {
        "id": "srv-3",
        "name": "Bare",
        "version": "1.21.1",
        "software": "vanilla",
        "port": 25567,
        "memory": 2048,
        "path": "/servers/bare",
        "status": "offline"
    }
    """
    let decoded = try JSONDecoder().decode(Server.self, from: Data(json.utf8))

    #expect(decoded.id == "srv-3")
    #expect(decoded.javaPath == nil)
    #expect(decoded.createdDate == nil)
    #expect(decoded.notifyHighCpuThreshold == nil)
}

@Test("ServerStatus covers every raw value used by the Tauri Classic union")
func serverStatusRawValuesMatchTsUnion() {
    let expected: [String: ServerStatus] = [
        "online": .online,
        "offline": .offline,
        "starting": .starting,
        "stopping": .stopping,
        "restarting": .restarting,
        "crashed": .crashed
    ]

    for (raw, status) in expected {
        #expect(ServerStatus(rawValue: raw) == status)
    }
}
