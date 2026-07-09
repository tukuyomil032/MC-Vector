import Foundation
import Testing
@testable import Core

private func makeTempFileURL() -> URL {
    FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-servers-vm-test-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("json")
}

private func makeServer(id: String = "srv-1", name: String = "Survival") -> Server {
    Server(
        id: id,
        name: name,
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 4096,
        path: "/servers/\(id)",
        status: .online,
    )
}

@MainActor
@Test("load() populates servers from an existing servers.json file")
func loadPopulatesServersFromExistingFile() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [makeServer(id: "srv-1"), makeServer(id: "srv-2", name: "Modded")]))

    let viewModel = ServerListViewModel(store: store)
    #expect(viewModel.servers.isEmpty)

    await viewModel.load()

    #expect(viewModel.servers.count == 2)
    #expect(viewModel.servers.map(\.id) == ["srv-1", "srv-2"])
    #expect(viewModel.errorMessage == nil)
}

@MainActor
@Test("load() treats a missing servers.json as an empty list, not an error")
func loadTreatsMissingFileAsEmptyList() async {
    let fileURL = makeTempFileURL()
    let store = ServerStore(fileURL: fileURL)

    let viewModel = ServerListViewModel(store: store)
    await viewModel.load()

    #expect(viewModel.servers.isEmpty)
    #expect(viewModel.errorMessage == nil)
}

@MainActor
@Test("load() surfaces unexpected decode failures via errorMessage instead of crashing")
func loadSurfacesUnexpectedErrorsViaErrorMessage() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    // Malformed JSON -- not a "missing file" case, so this should surface
    // as errorMessage rather than being swallowed as an empty list.
    try Data("not valid json".utf8).write(to: fileURL)

    let store = ServerStore(fileURL: fileURL)
    let viewModel = ServerListViewModel(store: store)

    await viewModel.load()

    #expect(viewModel.servers.isEmpty)
    #expect(viewModel.errorMessage != nil)
}

@MainActor
@Test("selection starts nil and can be set to a loaded server's id")
func selectionStartsNilAndCanBeSet() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [makeServer(id: "srv-1")]))

    let viewModel = ServerListViewModel(store: store)
    #expect(viewModel.selection == nil)

    await viewModel.load()
    viewModel.selection = viewModel.servers.first?.id

    #expect(viewModel.selection == "srv-1")
}

@MainActor
@Test("selectedServer is nil when selection is nil")
func selectedServerIsNilWhenSelectionIsNil() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [makeServer(id: "srv-1")]))

    let viewModel = ServerListViewModel(store: store)
    await viewModel.load()

    #expect(viewModel.selection == nil)
    #expect(viewModel.selectedServer == nil)
}

@MainActor
@Test("selectedServer resolves the matching Server when selection is a loaded id")
func selectedServerResolvesMatchingServer() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [
        makeServer(id: "srv-1", name: "Survival"),
        makeServer(id: "srv-2", name: "Modded")
    ]))

    let viewModel = ServerListViewModel(store: store)
    await viewModel.load()
    viewModel.selection = "srv-2"

    #expect(viewModel.selectedServer?.id == "srv-2")
    #expect(viewModel.selectedServer?.name == "Modded")
}

@MainActor
@Test("selectedServer is nil when selection doesn't match any loaded server")
func selectedServerIsNilWhenSelectionDoesNotMatch() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [makeServer(id: "srv-1")]))

    let viewModel = ServerListViewModel(store: store)
    await viewModel.load()
    viewModel.selection = "srv-does-not-exist"

    #expect(viewModel.selectedServer == nil)
}
