import Foundation
import Testing
@testable import Core

private func makeMinimalTemplate() -> ServerTemplate {
    ServerTemplate(
        id: "tpl-1",
        name: "Default Paper",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 4096,
    )
}

private func makeFullTemplate() -> ServerTemplate {
    ServerTemplate(
        id: "tpl-2",
        name: "Weekly Backup Modpack",
        profileName: "profile-b",
        groupName: "group-b",
        version: "1.20.1",
        software: "forge",
        port: 25566,
        memory: 8192,
        javaPath: "/usr/bin/java",
        autoRestartOnCrash: false,
        maxAutoRestarts: 1,
        autoRestartDelaySec: 10,
        autoBackupEnabled: true,
        autoBackupIntervalMin: 120,
        autoBackupScheduleType: .weekly,
        autoBackupTime: "02:30",
        autoBackupWeekday: 0,
    )
}

@Test("ServerTemplate with all optional fields absent round-trips through JSON")
func serverTemplateMinimalRoundTrips() throws {
    let original = makeMinimalTemplate()

    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(ServerTemplate.self, from: data)

    #expect(decoded == original)
    #expect(decoded.autoBackupScheduleType == nil)
}

@Test("ServerTemplate with all optional fields present round-trips through JSON")
func serverTemplateFullRoundTrips() throws {
    let original = makeFullTemplate()

    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(ServerTemplate.self, from: data)

    #expect(decoded == original)
    #expect(decoded.autoBackupScheduleType == .weekly)
}

@Test("ServerTemplate has no path or status fields")
func serverTemplateDecodesFromMinimalJson() throws {
    let json = """
    {
        "id": "tpl-3",
        "name": "Bare",
        "version": "1.21.1",
        "software": "vanilla",
        "port": 25568,
        "memory": 1024
    }
    """
    let decoded = try JSONDecoder().decode(ServerTemplate.self, from: Data(json.utf8))

    #expect(decoded.id == "tpl-3")
    #expect(decoded.javaPath == nil)
}
