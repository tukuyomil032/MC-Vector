import Foundation
import Testing
@testable import Core

/// Writes an executable shell script fixture to a temp file and returns its
/// URL. Mirrors `ServerProcessServiceTests`'/`ServerListViewModelProcessTests`'
/// fixture-script pattern -- duplicated here rather than shared because the
/// originals are file-private to their respective test files.
private func makeScriptFixture(_ contents: String) throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-log-vm-fixture-\(UUID().uuidString)", isDirectory: false)
        .appendingPathExtension("sh")
    try Data(contents.utf8).write(to: url)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    return url
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

/// Echoes five known lines to stdout, then exits cleanly. `streamLogs()`
/// completing (its `for await` reaching EOF) is what makes these tests
/// deterministic rather than timing-based: every assertion below runs only
/// after the script has already exited and the view model's final flush
/// has already happened, so there's no flush-interval race to wait out.
private let echoesFiveLinesScript = """
#!/bin/sh
echo "one"
echo "two"
echo "three"
echo "four"
echo "five"
exit 0
"""

@MainActor
@Test("streamLogs() populates lines with every line the process wrote to stdout, in order")
func streamLogsPopulatesLinesInOrder() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesFiveLinesScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)
    try await service.start(server: server)

    let viewModel = ServerLogViewModel(serverId: server.id, processService: service)
    await viewModel.streamLogs()

    #expect(viewModel.lines.map(\.text) == ["one", "two", "three", "four", "five"])
}

@MainActor
@Test("streamLogs() trims down to retainedLineCount, keeping the newest lines, once overshoot is exceeded")
func streamLogsAppliesLogLineBufferTrimming() async throws {
    let service = ServerProcessService()
    let scriptURL = try makeScriptFixture(echoesFiveLinesScript)
    defer { try? FileManager.default.removeItem(at: scriptURL) }

    let server = makeServer(javaPath: scriptURL.path)
    try await service.start(server: server)

    // A small buffer (well under the 5 lines the fixture writes) exercises
    // `LogLineBuffer`'s hysteresis trim end-to-end through this view
    // model's batching/flush glue -- not `LogLineBuffer` itself (already
    // covered by `LogLineBufferTests`), but that this view model actually
    // routes every arriving line through `buffer.append` (one call per
    // line, matching `LogLineBufferTests`' own trim semantics) rather
    // than, say, only applying the last flushed batch.
    //
    // With `retainedLineCount: 2, trimOvershoot: 1` (trim threshold: 3),
    // appending "one".."four" crosses the threshold on "four" (count 4 > 3)
    // and trims to the newest 2 (["three", "four"]); appending "five" then
    // brings the count back to 3, which is at, not over, the threshold, so
    // no further trim fires -- this is the same hysteresis behavior
    // `LogLineBufferTests` exercises directly, just reached here via real
    // stdout lines instead of synthetic ones.
    let viewModel = ServerLogViewModel(
        serverId: server.id,
        processService: service,
        retainedLineCount: 2,
        trimOvershoot: 1,
    )
    await viewModel.streamLogs()

    #expect(viewModel.lines.map(\.text) == ["three", "four", "five"])
}

@MainActor
@Test("streamLogs() returns without changing lines when the server has no tracked running process")
func streamLogsIsNoOpWhenServerIsNotRunning() async {
    let service = ServerProcessService()
    let viewModel = ServerLogViewModel(serverId: "srv-never-started", processService: service)

    await viewModel.streamLogs()

    #expect(viewModel.lines.isEmpty)
}
