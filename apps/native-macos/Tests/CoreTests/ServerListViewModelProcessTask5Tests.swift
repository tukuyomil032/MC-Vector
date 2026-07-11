import Foundation
import Testing
@testable import Core

// Task 5-1 coverage at the `ServerListViewModel` layer, exercising the
// interaction between `ServerProcessService`'s new `.online` event and
// this ViewModel's existing synchronous `.online` handling. Kept in its
// own file for SwiftLint's `file_length` cap and to keep the sibling
// `ServerListViewModelProcessTests.swift` scoped to the pre-task 5-1
// behavior.

private func makeScriptFixture(_ contents: String) throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-vm-task5-fixture-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("sh")
    try Data(contents.utf8).write(to: url)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    return url
}

private let stopOnStdinScript = """
#!/bin/sh
while IFS= read -r line; do
  if [ "$line" = "stop" ]; then
    exit 0
  fi
done
exit 0
"""

private func makeTempFileURL() -> URL {
    FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-servers-vm-task5-test-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("json")
}

private func makeServer(id: String = "srv-task5-vm", javaPath: String?) -> Server {
    Server(
        id: id,
        name: "Test Server",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 512,
        path: FileManager.default.temporaryDirectory.path,
        status: .offline,
        javaPath: javaPath,
    )
}

/// Regression for task 5-1: `ServerProcessService.start(server:)` now emits
/// an `.online` `ServerProcessEvent` on successful launch, but
/// `ServerListViewModel` already applies the `.online` transition
/// synchronously from `startSelectedServer()`'s success path. If
/// `apply(_:)` didn't skip `.online` events, the actor's event would drive
/// a second `appendActivity` call for the same start, doubling every
/// start's log entry once the background subscriber Task caught up. This
/// test waits long enough for the actor's event to definitely have been
/// delivered and re-asserts the entry count -- unlike the sibling file's
/// `startAppendsOnlineActivityEntry`, which checks synchronously
/// immediately after `startSelectedServer()` returns and so wouldn't catch
/// a slow duplicate append.
@MainActor
@Test("a successful start does not double-log its activity entry even after the .online event propagates")
func startDoesNotDoubleLogAfterOnlineEventPropagates() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }
    let scriptURL = try makeScriptFixture(stopOnStdinScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [makeServer(javaPath: scriptURL.path)]))

    let viewModel = ServerListViewModel(store: store, processService: ServerProcessService())
    await viewModel.load()
    viewModel.selection = viewModel.servers.first?.id

    await viewModel.startSelectedServer()
    #expect(viewModel.activityLog.count == 1)

    // Give the background subscriber Task ample time to observe and
    // process the actor's `.online` event -- if `apply(_:)` failed to
    // guard against `.online`, `activityLog.count` would climb to 2
    // within a few milliseconds of the event's emission (measured
    // against the ViewModel's existing `.offline`/`.crashed` propagation
    // timings in the sibling file's tests).
    try? await Task.sleep(for: .milliseconds(200))

    #expect(viewModel.activityLog.count == 1)
    #expect(viewModel.activityLog.first?.kind == .serverStatusChange(.online))

    // Clean up: stop the real child process so the test doesn't leak it.
    await viewModel.stopSelectedServer()
}
