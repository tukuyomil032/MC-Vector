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

/// Awaits the first `ServerProcessEvent` for `serverId` from `service`'s
/// `events` stream. Callers should start awaiting this (via `async let`)
/// before triggering the action expected to produce the event, so no event
/// emitted in a narrow race window is missed.
private func collectFirstEvent(
    from service: ServerProcessService,
    matchingServerId serverId: String,
) async -> ServerProcessEvent? {
    for await event in await service.events where event.serverId == serverId {
        return event
    }
    return nil
}
