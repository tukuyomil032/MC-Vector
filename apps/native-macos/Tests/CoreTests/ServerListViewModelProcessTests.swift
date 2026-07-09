import Foundation
import Testing
@testable import Core

/// Writes an executable shell script fixture to a temp file and returns its
/// URL. Mirrors `ServerProcessServiceTests`' fixture-script pattern (real,
/// tiny, purpose-built shell scripts standing in for a long-running
/// Minecraft server process, rather than mocking `Process`) -- duplicated
/// here rather than shared because the originals are file-private to
/// `ServerProcessServiceTests.swift`.
///
/// Unlike `ServerProcessServiceTests`, these tests go through
/// `ServerListViewModel` -- a real `ServerProcessService` is injected via
/// `ServerListViewModel`'s injectable initializer, so both the actor's own
/// logic (already covered by `ServerProcessServiceTests`) *and* the
/// ViewModel's `@concurrent` event-subscription `Task` that wraps it get
/// exercised end-to-end.
private func makeScriptFixture(_ contents: String) throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-vm-process-fixture-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("sh")
    try Data(contents.utf8).write(to: url)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    return url
}

/// Reads stdin lines forever, exiting 0 the moment it reads a line equal to
/// "stop" -- see `ServerProcessServiceTests.stopOnStdinScript` for the
/// original.
private let stopOnStdinScript = """
#!/bin/sh
while IFS= read -r line; do
  if [ "$line" = "stop" ]; then
    exit 0
  fi
done
exit 0
"""

/// Exits non-zero shortly after launch, simulating a server crashing on its
/// own without ever being asked to stop -- see
/// `ServerProcessServiceTests.crashesShortlyScript` for the original.
private let crashesShortlyScript = """
#!/bin/sh
sleep 0.2
exit 7
"""

private func makeTempFileURL() -> URL {
    FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-servers-vm-process-test-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("json")
}

private func makeServer(id: String = "srv-1", javaPath: String) -> Server {
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

/// Polls `condition` until it returns `true` or `timeout` elapses, sleeping
/// `pollInterval` between checks.
///
/// Used instead of a single fixed-duration `Task.sleep` guess to wait on
/// asynchronous status propagation from `ServerListViewModel`'s background
/// event-subscription `Task` (see that class's `init`): a fixed sleep would
/// either race a slow CI machine (flaky) or pad every run with dead time
/// long enough to always be safe (slow). `@MainActor` because every caller
/// inspects `viewModel` state, which is `@MainActor`-isolated.
@MainActor
private func waitUntil(
    timeout: Duration = .seconds(2),
    pollInterval: Duration = .milliseconds(20),
    _ condition: () -> Bool,
) async {
    let deadline = ContinuousClock.now.advanced(by: timeout)
    while !condition(), ContinuousClock.now < deadline {
        try? await Task.sleep(for: pollInterval)
    }
}

@MainActor
@Test("startSelectedServer() sets status to .online synchronously on success")
func startSelectedServerSetsStatusToOnlineOnSuccess() async throws {
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

    // This is the synchronous-success path: `startSelectedServer()` sets
    // `.online` itself once `processService.start(server:)` returns, with
    // no need to round-trip through the event stream. See
    // `crashPropagatesToViewModelStatusViaEventStream` below for the
    // complementary case that *does* require the event stream.
    #expect(viewModel.selectedServer?.status == .online)
    #expect(viewModel.errorMessage == nil)

    // Clean up: stop the real child process so the test doesn't leak it.
    await viewModel.stopSelectedServer()
}

@MainActor
@Test(
    "a process that crashes on its own transitions the ViewModel's status to .crashed via the event-subscription Task",
)
func crashPropagatesToViewModelStatusViaEventStream() async throws {
    let fileURL = makeTempFileURL()
    defer { try? FileManager.default.removeItem(at: fileURL) }
    let scriptURL = try makeScriptFixture(crashesShortlyScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let store = ServerStore(fileURL: fileURL)
    try await store.save(ServersFile(servers: [makeServer(javaPath: scriptURL.path)]))

    let viewModel = ServerListViewModel(store: store, processService: ServerProcessService())
    await viewModel.load()
    viewModel.selection = viewModel.servers.first?.id

    await viewModel.startSelectedServer()
    // `startSelectedServer()`'s synchronous-success path (exercised above
    // in `startSelectedServerSetsStatusToOnlineOnSuccess`) has no code path
    // that ever sets `.crashed` -- only the actor's termination monitor
    // (via `processService.events`) and this ViewModel's `@concurrent`
    // event-subscription `Task` set up in `init` can observe and apply
    // that. The fixture script exits non-zero ~0.2s after launch, well
    // after `start(server:)` (and therefore this line) returns, so this is
    // still the synchronous `.online` state.
    #expect(viewModel.selectedServer?.status == .online)

    // Deliberately does NOT call `stopSelectedServer()` -- the crash must
    // be observed purely through the event stream / `@concurrent`
    // subscription Task, not any code path reachable from
    // `stopSelectedServer()`. If that subscription Task were dead (e.g. the
    // `@concurrent` regression this test guards against, where a missing
    // `@concurrent` silently made the `await` inside it a no-op), this poll
    // would time out and the final `#expect` below would fail on `.online`
    // rather than observing `.crashed`.
    await waitUntil { viewModel.selectedServer?.status == .crashed }

    #expect(viewModel.selectedServer?.status == .crashed)
}

@MainActor
@Test("stopSelectedServer() eventually sets status to .offline via the event-subscription Task")
func stopSelectedServerEventuallySetsStatusToOfflineViaEventStream() async throws {
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
    #expect(viewModel.selectedServer?.status == .online)

    // `stopSelectedServer()` sets `.stopping` optimistically and returns
    // once the actor's `stop(serverId:)` returns, but the definitive
    // `.offline` (vs. `.crashed`) outcome is -- by design (see
    // `ServerProcessService.stop`'s doc comment) -- only ever reported via
    // `processService.events`, so it still requires the ViewModel's
    // subscription Task to apply it.
    await viewModel.stopSelectedServer()

    await waitUntil { viewModel.selectedServer?.status == .offline }

    #expect(viewModel.selectedServer?.status == .offline)
}
