import Foundation
import Testing
@testable import Core

/// Writes an executable shell script fixture to a temp file and returns its
/// URL. Following `JavaLaunchHarnessTests`' precedent of exercising real
/// system executables (`/bin/echo`, `/usr/bin/false`) rather than mocking
/// `Process` -- here that means real, tiny, purpose-built shell scripts
/// standing in for a long-running Minecraft server process, since none of
/// the system executables used by that precedent stay alive to read stdin.
///
/// Each fixture is used as the `javaPath` itself (not invoked via `sh
/// <script>`) so the JVM-style arguments `ServerProcessService` always
/// appends (`-Xmx512M -Xms512M -jar server.jar nogui`) never need to be
/// parsed by anything -- the script ignores its arguments entirely, which
/// sidesteps `/bin/sh` otherwise treating `-Xmx512M` as an (invalid) shell
/// option rather than a script argument.
private func makeScriptFixture(_ contents: String) throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-process-fixture-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("sh")
    try Data(contents.utf8).write(to: url)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    return url
}

/// Reads stdin lines forever, exiting 0 the moment it reads a line equal to
/// "stop" -- a minimal stand-in for Minecraft's own console command handler
/// reacting to the "stop" command written to its stdin.
private let stopOnStdinScript = """
#!/bin/sh
while IFS= read -r line; do
  if [ "$line" = "stop" ]; then
    exit 0
  fi
done
exit 0
"""

/// Ignores everything written to stdin (never exits on "stop"), so tests
/// can exercise the timeout -> terminate() escalation path in `stop()`.
/// Does not trap SIGTERM, so `Process.terminate()` should still kill it.
private let ignoresStopScript = """
#!/bin/sh
while IFS= read -r line; do
  :
done
"""

/// Exits non-zero shortly after launch, simulating a server crashing on
/// its own without ever being asked to stop.
private let crashesShortlyScript = """
#!/bin/sh
sleep 0.2
exit 7
"""

/// Echoes one line, then behaves like `stopOnStdinScript` -- lets a test
/// claim a live `stdoutLines` reader, then trigger exit separately.
private let echoesLineThenStopsOnStdinScript = """
#!/bin/sh
echo "hello"
while IFS= read -r line; do
  if [ "$line" = "stop" ]; then
    exit 0
  fi
done
exit 0
"""

/// Echoes three known lines to stdout with small delays between them (so a
/// test can assert lines are delivered incrementally, not only bulk-read
/// after the process exits), then exits cleanly.
private let echoesThreeLinesScript = """
#!/bin/sh
echo "line one"
sleep 0.05
echo "line two"
sleep 0.05
echo "line three"
exit 0
"""

/// Writes a final line with no trailing newline before exiting, so a test
/// can assert `stdoutLines` flushes a trailing partial line at EOF instead
/// of silently dropping it.
private let echoesUnterminatedLineScript = """
#!/bin/sh
echo "complete line"
printf "no trailing newline"
exit 0
"""

/// Echoes five known lines to stdout with no delay between them, then exits
/// immediately -- deliberately not `echoesThreeLinesScript`'s `sleep`-spaced
/// variant, so this process is the kind that can complete and be reaped by
/// `start(server:)`'s monitoring `Task` before a caller's first
/// `stdoutLines(serverId:)` call reaches it under real-world CPU contention.
/// `stdoutLinesDeliversBufferedLinesAfterProcessAlreadyReaped` below doesn't
/// rely on that timing accident, though -- it explicitly waits for the
/// termination event before calling `stdoutLines`, which reproduces the
/// same race deterministically instead of only probabilistically.
private let echoesFiveLinesScript = """
#!/bin/sh
echo "one"
echo "two"
echo "three"
echo "four"
echo "five"
exit 0
"""

private func makeServer(
    id: String = "srv-1",
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

@Test("start() throws javaPathNotConfigured when Server.javaPath is nil")
func startThrowsWhenJavaPathIsNil() async throws {
    let service = ServerProcessService()
    let server = makeServer(javaPath: nil)

    await #expect(throws: ServerProcessError.javaPathNotConfigured(serverId: server.id)) {
        try await service.start(server: server)
    }
}

@Test("start() launches the process and isRunning reflects true")
func startLaunchesProcessAndIsRunningReflectsTrue() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(stopOnStdinScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    #expect(await service.isRunning(serverId: server.id) == false)

    try await service.start(server: server)
    #expect(await service.isRunning(serverId: server.id) == true)

    // Clean up: stop it so the test doesn't leak a live child process.
    try await service.stop(serverId: server.id)
}

@Test("stop() via stdin causes a clean exit and reports .offline")
func stopViaStdinCausesCleanExitAndReportsOffline() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(stopOnStdinScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    try await service.start(server: server)
    #expect(await service.isRunning(serverId: server.id) == true)

    async let event = collectFirstEvent(from: service, matchingServerId: server.id)

    try await service.stop(serverId: server.id)

    #expect(await event?.status == .offline)
    #expect(await service.isRunning(serverId: server.id) == false)
}

@Test("a process that exits non-zero on its own is detected as .crashed")
func processThatExitsNonZeroIsDetectedAsCrashed() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(crashesShortlyScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    async let event = collectFirstEvent(from: service, matchingServerId: server.id)

    try await service.start(server: server)

    #expect(await event?.status == .crashed)
    #expect(await service.isRunning(serverId: server.id) == false)
}

@Test("stop() escalates to terminate() when the process doesn't exit within the timeout")
func stopEscalatesToTerminateOnTimeout() async throws {
    // A short, test-only timeout keeps this bounded and non-flaky: the
    // fixture script never reacts to "stop", so `stop()` is guaranteed to
    // hit the escalation path every run rather than racing a real 15s
    // production timeout.
    let service = ServerProcessService(gracefulStopTimeout: .milliseconds(300))
    let scriptURL = try makeScriptFixture(ignoresStopScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    try await service.start(server: server)
    #expect(await service.isRunning(serverId: server.id) == true)

    async let event = collectFirstEvent(from: service, matchingServerId: server.id)

    // stop() blocks for the graceful-timeout window, then issues
    // terminate() -- by the time it returns, escalation has happened.
    try await service.stop(serverId: server.id)

    // SIGTERM without a trap kills the un-cooperative script, so the
    // monitoring task observes a non-zero/abnormal termination.
    #expect(await event?.status == .crashed)
    #expect(await service.isRunning(serverId: server.id) == false)
}

@Test("stop() throws serverNotRunning for an id with no tracked process")
func stopThrowsServerNotRunningForUntrackedId() async throws {
    let service = ServerProcessService()

    await #expect(throws: ServerProcessError.serverNotRunning(serverId: "no-such-server")) {
        try await service.stop(serverId: "no-such-server")
    }
}

@Test("stdoutLines returns nil for a server with no tracked running process")
func stdoutLinesReturnsNilForUntrackedServer() async {
    let service = ServerProcessService()

    let stream = await service.stdoutLines(serverId: "no-such-server")
    #expect(stream == nil)
}

@Test("stdoutLines delivers lines written to the process's live stdout, in arrival order")
func stdoutLinesDeliversLinesInOrder() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesThreeLinesScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)
    try await service.start(server: server)

    let stream = try #require(await service.stdoutLines(serverId: server.id))

    // The fixture script echoes exactly three lines (with delays between
    // them) and then exits -- its write end of the pipe closing at exit is
    // what lets this `for await` complete on its own via EOF, rather than
    // needing a manual iteration-count cutoff.
    var received: [String] = []
    for await line in stream {
        received.append(line)
    }

    #expect(received == ["line one", "line two", "line three"])
}

@Test("stdoutLines flushes a trailing line with no terminating newline at EOF")
func stdoutLinesFlushesTrailingUnterminatedLine() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesUnterminatedLineScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)
    try await service.start(server: server)

    let stream = try #require(await service.stdoutLines(serverId: server.id))

    var received: [String] = []
    for await line in stream {
        received.append(line)
    }

    #expect(received == ["complete line", "no trailing newline"])
}

/// Regression test for the "exit-before-first-read" race: a process that
/// writes its stdout and exits fast enough that `start(server:)`'s
/// monitoring `Task` detects the exit and runs `handleTermination` --
/// removing the `runningProcesses` entry `stdoutLines(serverId:)` used to
/// key its "is there anything to read" check on -- before the caller's
/// first `stdoutLines(serverId:)` call. Rather than trying to *provoke*
/// that ordering via timing (inherently flaky, even with a fast-exiting
/// fixture), this test *forces* it deterministically: it awaits the
/// process's termination event via `collectFirstEvent` -- which, per
/// `handleTermination`'s implementation, cannot fire until after the
/// `runningProcesses` entry has already been removed -- before calling
/// `stdoutLines`, then asserts the pre-written lines are still delivered
/// via the `terminatedStdout` salvage path.
@Test("stdoutLines still delivers buffered lines for a process already reaped before the first read")
func stdoutLinesDeliversBufferedLinesAfterProcessAlreadyReaped() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesFiveLinesScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    async let event = collectFirstEvent(from: service, matchingServerId: server.id)
    try await service.start(server: server)

    // By the time this resolves, `handleTermination` has already run and
    // removed `server.id` from `runningProcesses` -- confirmed below --
    // reproducing the race deterministically rather than hoping the fixture
    // script happens to finish before the next line runs.
    _ = await event
    #expect(await service.isRunning(serverId: server.id) == false)

    let stream = try #require(await service.stdoutLines(serverId: server.id))
    var received: [String] = []
    for await line in stream {
        received.append(line)
    }

    #expect(received == ["one", "two", "three", "four", "five"])
}

/// Companion to the reproduction above: once `stdoutLines(serverId:)` has
/// claimed the salvaged pipe for an already-exited process, it's gone --
/// calling `stdoutLines` again for the same id (with no new `start()`)
/// should return `nil`, matching this method's single-consumer contract
/// rather than silently handing out a second reader onto an already-drained
/// stream.
@Test("stdoutLines returns nil on a second call for an already-exited, already-drained server")
func stdoutLinesReturnsNilOnSecondCallAfterDraining() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesFiveLinesScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)

    async let event = collectFirstEvent(from: service, matchingServerId: server.id)
    try await service.start(server: server)
    _ = await event

    let firstStream = try #require(await service.stdoutLines(serverId: server.id))
    for await _ in firstStream {}

    let secondStream = await service.stdoutLines(serverId: server.id)
    #expect(secondStream == nil)
}

/// Regression test for the review finding on `12d7805`: unconditional salvage in `handleTermination`
/// reintroduced a race. `ServerDetailView` re-invokes `stdoutLines(serverId:)` on every `server.status`
/// transition via `.task(id:)`, so in the ordinary case (log view open while `.online`, then it stops/crashes)
/// it's legitimately called twice: once live (claiming the pipe), again after the status flips and `.task(id:)`
/// re-fires. Unconditional salvage would hand the same pipe out a second time -- the "two readers split bytes
/// unpredictably" hazard `stdoutLines` itself warns against, here triggered by the app's own re-entry.
///
/// Claims the live pipe first (mirrors `.online`), drains it concurrently, stops the process (mirrors
/// `.offline`), then asserts a second `stdoutLines` call returns `nil` -- not salvaged, matching pre-`12d7805`
/// behavior for this case.
@Test("stdoutLines returns nil after termination when the live pipe was already claimed while running")
func stdoutLinesReturnsNilAfterClaimedLivePipeTerminates() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesLineThenStopsOnStdinScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)
    try await service.start(server: server)

    // Claim the live pipe while running -- mirrors `.task(id:)` calling `streamLogs()` while `.online`.
    let firstStream = try #require(await service.stdoutLines(serverId: server.id))

    // Drain concurrently -- the script blocks on stdin until "stop" below, so a sequential drain would deadlock.
    let drainTask = Task { () async -> [String] in
        var lines: [String] = []
        for await line in firstStream {
            lines.append(line)
        }
        return lines
    }

    async let event = collectFirstEvent(from: service, matchingServerId: server.id)
    try await service.stop(serverId: server.id)
    #expect(await event?.status == .offline)

    #expect(await drainTask.value == ["hello"])

    // Unconditional salvage would re-serve this pipe as a second reader here instead of `nil`.
    let secondStream = await service.stdoutLines(serverId: server.id)
    #expect(secondStream == nil)
}

/// Awaits the first *terminal* `ServerProcessEvent` for `serverId`
/// (`.offline` or `.crashed`), filtering out the `.online` that
/// `start(server:)` now also emits (task 5-1). Every caller here uses
/// this helper to observe a termination, so the filter is baked in.
/// Start awaiting via `async let` before triggering the action expected
/// to produce the event, so no event in a narrow race window is missed.
private func collectFirstEvent(
    from service: ServerProcessService,
    matchingServerId serverId: String,
) async -> ServerProcessEvent? {
    for await event in await service.events where event.serverId == serverId && event.status != .online {
        return event
    }
    return nil
}
