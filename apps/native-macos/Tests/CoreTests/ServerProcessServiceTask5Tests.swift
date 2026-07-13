import Foundation
import Testing
@testable import Core

// Task 5-1 coverage for `ServerProcessService` -- kept in its own file to
// stay under SwiftLint's `file_length` cap (the sibling
// `ServerProcessServiceTests.swift` is already close to the limit).
// Duplicates the shell-script fixture helpers rather than sharing them,
// following the same pattern `ServerListViewModelProcessTests.swift` uses
// to keep its file-private originals private.

private func makeScriptFixture(_ contents: String) throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-process-task5-fixture-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("sh")
    try Data(contents.utf8).write(to: url)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    return url
}

/// Reads stdin lines forever, exiting 0 the moment it reads a line equal
/// to "stop" -- see `ServerProcessServiceTests.stopOnStdinScript` for the
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

/// Echoes three known lines to stdout with small delays between them,
/// then exits cleanly -- see `ServerProcessServiceTests.echoesThreeLinesScript`
/// for the original.
private let echoesThreeLinesScript = """
#!/bin/sh
echo "line one"
sleep 0.05
echo "line two"
sleep 0.05
echo "line three"
exit 0
"""

private func makeServer(
    id: String = "srv-task5",
    javaPath: String?,
) -> Server {
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

@Test("pid() returns the launched process's PID while running and nil after it stops")
func pidReflectsTrackedProcessLifecycle() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(stopOnStdinScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    // Not started yet -- no tracked process, so no PID.
    #expect(await service.pid(serverId: server.id) == nil)

    try await service.start(server: server)

    // Live tracked process: PID should be > 0 (macOS process IDs are
    // positive; a returned 0 would mean `Process.processIdentifier` was
    // never assigned, which shouldn't happen after `run()` succeeded).
    let livePID = try #require(await service.pid(serverId: server.id))
    #expect(livePID > 0)

    // Independently verify the reported PID is real by asking the kernel
    // via `kill(pid, 0)` -- signal 0 doesn't send a signal, it only tests
    // whether the pid is deliverable to (i.e. the process exists and this
    // user can signal it). No dependency on `/bin/ps` or process listing.
    #expect(kill(livePID, 0) == 0)

    async let terminationEvent = collectFirstTerminalEvent(from: service, matchingServerId: server.id)
    try await service.stop(serverId: server.id)
    _ = await terminationEvent

    // Stopped -- tracked process gone, so no PID again.
    #expect(await service.pid(serverId: server.id) == nil)
}

@Test("start() emits an .online ServerProcessEvent on success")
func startEmitsOnlineEventOnSuccess() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(stopOnStdinScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    // Start awaiting the `.online` event *before* calling `start(server:)`
    // so no event is missed if the emission and subscription race.
    async let onlineEvent = collectFirstOnlineEvent(from: service, matchingServerId: server.id)

    try await service.start(server: server)

    let event = try #require(await onlineEvent)
    #expect(event.status == .online)
    #expect(event.serverId == server.id)

    // Clean up: stop the real child process so the test doesn't leak it.
    try await service.stop(serverId: server.id)
}

/// Two concurrent `stdoutLines(serverId:)` subscribers on the same live
/// server both receive the same stdout lines in order -- the broadcaster
/// fan-out contract introduced in task 5-1. Prior to that change,
/// `stdoutLines` was documented single-consumer only ("calling this twice
/// for the same *live* `serverId` starts two independent readers on the
/// same pipe descriptor, splitting bytes unpredictably"), which blocked
/// the Dashboard's `TPSExtractor` from tapping the log stream at the same
/// time as `ServerLogViewModel`.
@Test("stdoutLines fans out the same lines to two concurrent subscribers on the same live server")
func stdoutLinesBroadcastsToMultipleConcurrentSubscribers() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesThreeLinesScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)
    try await service.start(server: server)

    // Attach both subscribers before iterating either -- both need to be
    // registered on the broadcaster before the reader Task delivers its
    // first line, otherwise the second subscriber could miss early bytes.
    // Since `stdoutLines(serverId:)` is actor-isolated, sequential await
    // calls are serialized: the reader is spawned in the first call and
    // yields lines only via subsequent actor hops, so once we return to
    // the caller with the first stream, the second call still completes
    // (attaching subscriber #2) before any yield hop can run.
    let firstStream = try #require(await service.stdoutLines(serverId: server.id))
    let secondStream = try #require(await service.stdoutLines(serverId: server.id))

    async let firstLines = collectAllLines(from: firstStream)
    async let secondLines = collectAllLines(from: secondStream)

    let (first, second) = await (firstLines, secondLines)
    #expect(first == ["line one", "line two", "line three"])
    #expect(second == ["line one", "line two", "line three"])
}

private func collectAllLines(from stream: AsyncStream<String>) async -> [String] {
    var lines: [String] = []
    for await line in stream {
        lines.append(line)
    }
    return lines
}

/// Awaits the first `.online` event for `serverId`. Duplicated here rather
/// than shared with `ServerProcessServiceTests.collectFirstEvent` (which
/// deliberately filters `.online` out to keep termination-outcome tests
/// unchanged) since this file's tests need the *opposite* filter.
private func collectFirstOnlineEvent(
    from service: ServerProcessService,
    matchingServerId serverId: String,
) async -> ServerProcessEvent? {
    for await event in await service.events where event.serverId == serverId && event.status == .online {
        return event
    }
    return nil
}

/// Terminal-event helper for this file, mirroring
/// `ServerProcessServiceTests.collectFirstEvent`. Duplicated for the same
/// file-private-visibility reason.
private func collectFirstTerminalEvent(
    from service: ServerProcessService,
    matchingServerId serverId: String,
) async -> ServerProcessEvent? {
    for await event in await service.events where event.serverId == serverId && event.status != .online {
        return event
    }
    return nil
}
