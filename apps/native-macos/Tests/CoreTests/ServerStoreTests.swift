import Foundation
import Testing
@testable import Core

private func makeTempFileURL() -> URL {
    FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-servers-test-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("json")
}

@Test("ServersFile round-trips through JSON with both collections populated")
func serversFileRoundTrips() throws {
    let original = ServersFile(
        servers: [
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
        ],
        serverTemplates: [
            ServerTemplate(
                id: "tpl-1",
                name: "Default Paper",
                version: "1.21.1",
                software: "paper",
                port: 25565,
                memory: 4096,
            )
        ],
    )

    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(ServersFile.self, from: data)

    #expect(decoded == original)
}

@Test("ServersFile decodes from JSON with empty arrays")
func serversFileDecodesEmptyArrays() throws {
    let json = #"{"servers": [], "serverTemplates": []}"#
    let decoded = try JSONDecoder().decode(ServersFile.self, from: Data(json.utf8))

    #expect(decoded.servers.isEmpty)
    #expect(decoded.serverTemplates.isEmpty)
}

@Test("ServerStore writes and reads back a real file on disk")
func serverStoreWritesAndReadsRealFile() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let store = ServerStore(fileURL: fileURL)
    let original = ServersFile(
        servers: [
            Server(
                id: "srv-1",
                name: "Survival",
                version: "1.21.1",
                software: "paper",
                port: 25565,
                memory: 4096,
                path: "/servers/survival",
                status: .online,
                autoBackupScheduleType: .interval,
            )
        ],
        serverTemplates: [
            ServerTemplate(
                id: "tpl-1",
                name: "Default Paper",
                version: "1.21.1",
                software: "paper",
                port: 25565,
                memory: 4096,
            )
        ],
    )

    try await store.save(original)

    #expect(FileManager.default.fileExists(atPath: fileURL.path))

    let loaded = try await store.load()
    #expect(loaded == original)
}

@Test("ServerStore load throws when the file does not exist")
func serverStoreLoadThrowsForMissingFile() async {
    let fileURL = makeTempFileURL()
    let store = ServerStore(fileURL: fileURL)

    await #expect(throws: (any Error).self) {
        _ = try await store.load()
    }
}
