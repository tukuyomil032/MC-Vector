import Foundation

/// Errors thrown by `ServerProcessService`.
public enum ServerProcessError: Error, Sendable, Equatable {
    /// `Server.javaPath` was `nil` when `start(server:)` was called.
    ///
    /// This app has no Java auto-detection/configuration flow yet -- that's
    /// a planned but not-yet-built feature. Silently guessing a system path
    /// (e.g. `/usr/bin/java`) would be surprising and wrong, so this is
    /// surfaced as a typed error for the caller (the view model/UI) to show
    /// the user instead.
    case javaPathNotConfigured(serverId: String)

    /// `start(server:)` was called for a server this instance already has a
    /// tracked running process for. Not part of the original design
    /// surface, but starting twice would silently overwrite the tracked
    /// `Process` reference and leak the first (now-untracked) child.
    case alreadyRunning(serverId: String)

    /// `stop(serverId:)` was called for a server with no tracked running
    /// process (already stopped, crashed, or never started via this
    /// service instance).
    case serverNotRunning(serverId: String)
}

extension ServerProcessError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case let .javaPathNotConfigured(serverId):
            "No Java path is configured for server \(serverId). Set a Java path before starting it."
        case let .alreadyRunning(serverId):
            "Server \(serverId) is already running."
        case let .serverNotRunning(serverId):
            "Server \(serverId) is not running."
        }
    }
}

/// A status-change notification emitted by `ServerProcessService` for
/// transitions it alone can observe asynchronously -- namely a tracked
/// process exiting on its own, at a time the caller isn't actively waiting.
///
/// Transitions the caller learns synchronously (a successful `start(server:)`
/// return, or the caller's own optimistic "starting"/"stopping" UI state)
/// don't need to round-trip through this stream -- only the two outcomes
/// this actor uniquely knows about when they happen (clean exit vs. crash)
/// are published here.
public struct ServerProcessEvent: Sendable, Equatable {
    public let serverId: String
    public let status: ServerStatus

    public init(serverId: String, status: ServerStatus) {
        self.serverId = serverId
        self.status = status
    }
}

/// Actor-isolated owner of running Minecraft server child processes.
///
/// Launches and stops `Process` instances, tracking them by `Server.id`.
/// `Process` is not `Sendable`, but per the swift-concurrency skill's
/// guidance for shared mutable state ("move it behind an actor"), that's
/// fine here: every `Process` reference lives only in this actor's private
/// `runningProcesses` dictionary, all access to it is already serialized by
/// actor isolation, and no `Process` reference ever escapes across the
/// actor boundary -- only `Sendable` value types (`ServerProcessEvent`,
/// thrown `ServerProcessError`s) cross into caller code.
///
/// Launch args and the "write stop\n to stdin, no SIGTERM/SIGKILL as the
/// primary mechanism" shutdown approach mirror the existing Tauri/Rust
/// implementation (`src-tauri/src/commands/server.rs`) as a design
/// reference only -- no logic is shared or ported between the two apps,
/// per this project's standing Native/Classic independence rule.
public actor ServerProcessService {
    /// `Server` has no explicit jar-filename field yet (unlike the Rust
    /// `start_server` command, which takes an explicit `jar_file: String`
    /// argument from its caller). Until a future task adds one, this
    /// service assumes the convention that the server jar is named
    /// `server.jar` and lives directly inside `server.path`. This
    /// convention is local to this service -- `Server.swift` itself is not
    /// touched.
    private static let jarFileName = "server.jar"

    /// Bounded wait for graceful shutdown (writing `"stop\n"` to stdin)
    /// before escalating to `Process.terminate()` (SIGTERM). The Rust
    /// reference implementation has no such timeout/fallback at all -- an
    /// acknowledged gap in that reference. This is a deliberate
    /// improvement: 15s is long enough for a typical vanilla/Paper world
    /// save-on-stop, short enough that a hung server doesn't leave the
    /// caller waiting indefinitely. Overridable via `init` so tests can
    /// exercise the escalation path without a real 15s wait.
    private let gracefulStopTimeout: Duration

    private struct RunningProcess {
        let process: Process
        let stdin: FileHandle
        /// The child's stdout `Pipe`, retained explicitly (rather than only
        /// reachable via `process.standardOutput as? Pipe`) so
        /// `stdoutLines(serverId:)` has a direct, typed handle to read from
        /// -- task 3-8's job, per `start(server:)`'s doc comment below.
        let stdout: Pipe
        /// Set when `stdoutLines(serverId:)` claims a live reader; gates `handleTermination`'s salvage.
        var claimed = false
    }

    private var runningProcesses: [String: RunningProcess] = [:]

    /// Stdout `Pipe`s salvaged from `RunningProcess` entries whose process
    /// already exited (`handleTermination` removed them from
    /// `runningProcesses`), but which `stdoutLines(serverId:)` hasn't read
    /// yet. Closes a narrow race: a process that exits very quickly can be
    /// reaped by `start(server:)`'s monitoring `Task` before the caller's
    /// first `stdoutLines` call -- without this cache, `stdoutLines` would
    /// key "anything to read" on `runningProcesses` liveness alone and
    /// wrongly return `nil`, even though the OS pipe still buffers every
    /// byte written (a late-attaching reader sees EOF right after that
    /// data, not nothing) -- most importantly, a crash message from a
    /// server that dies immediately after launch. Entries are removed when
    /// `stdoutLines` claims one, or when `start(server:)` runs again for
    /// the same `serverId`.
    ///
    /// Only populated when never claimed live (`RunningProcess.claimed ==
    /// false`) at termination -- see `handleTermination`. If it *was*
    /// claimed (log view open, then `.task(id: server.status)` re-fires on
    /// stop), the live reader may still be mid-teardown, so salvaging would
    /// create a second reader splitting bytes unpredictably.
    private var terminatedStdout: [String: Pipe] = [:]

    private let eventContinuation: AsyncStream<ServerProcessEvent>.Continuation

    /// Single actor-wide stream of status-change events, not one per
    /// server -- this task's scope doesn't need per-server granularity, and
    /// it establishes the same AsyncStream-based observation pattern task
    /// 3-8 (log streaming) will also use, per its own task description.
    public let events: AsyncStream<ServerProcessEvent>

    public init(gracefulStopTimeout: Duration = .seconds(15)) {
        self.gracefulStopTimeout = gracefulStopTimeout
        var continuation: AsyncStream<ServerProcessEvent>.Continuation!
        self.events = AsyncStream { continuation = $0 }
        self.eventContinuation = continuation
    }

    /// Whether this instance currently has a tracked running process for
    /// `serverId`. `async` (even though actor-isolated methods are
    /// implicitly asynchronous to external callers regardless) to make the
    /// cross-actor call site explicit at the call site.
    public func isRunning(serverId: String) async -> Bool {
        self.runningProcesses[serverId] != nil
    }

    /// A live, line-oriented view of `serverId`'s stdout, or `nil` if this
    /// instance has never started a process for that id, or has already
    /// served (and discarded) its buffered stdout via a previous call to
    /// this method. `nil`, not a thrown error: "no live stdout right now" is
    /// an expected, steady-state outcome for a server that simply isn't
    /// running -- the log view's job is to reflect that (e.g. show nothing /
    /// a placeholder) rather than treat it as exceptional, so a typed error
    /// would just force every caller to immediately catch-and-ignore it.
    ///
    /// Checks `runningProcesses` first (marking the pipe claimed -- see
    /// `RunningProcess.claimed`), then falls back to `terminatedStdout` for
    /// an already-exited, never-claimed process's unread buffered stdout.
    ///
    /// Reads incrementally via `FileHandle.bytes` (an `AsyncSequence` of
    /// bytes), per the swift-concurrency skill's guidance for bridging
    /// callback/handle-based APIs to `AsyncStream` -- deliberately not
    /// `readToEnd()`/`readToEndCompat()` (see `JavaLaunchHarness`), which
    /// blocks until the pipe's write end closes and so cannot serve a
    /// *live* stream. Bytes accumulate into a line buffer, yielded as
    /// `String`s on each `\n`, with any trailing partial line flushed once
    /// the loop ends.
    ///
    /// The reading `Task` is spawned with `@concurrent` rather than
    /// inheriting this actor's isolation -- per the swift-concurrency
    /// skill's actor guidance, a long-lived unstructured `Task` should never
    /// pin an actor's serial executor for its whole lifetime, which reading
    /// a potentially-hours-long stream would otherwise do. `onTermination`
    /// cancels the reading `Task` when the caller stops iterating; the
    /// process exiting on its own needs no separate handling, since the
    /// child's pipe end closing produces a natural EOF that falls through
    /// to `continuation.finish()`.
    ///
    /// Single-consumer only, like any `AsyncStream`: calling this twice for
    /// the same *live* `serverId` starts two independent readers on the
    /// same pipe descriptor, splitting bytes unpredictably. Callers (today:
    /// one `ServerLogViewModel` per server) must not do that -- the
    /// `claimed` flag only protects the live-then-terminated re-entry
    /// pattern (see `terminatedStdout`), not two concurrent live callers.
    public func stdoutLines(serverId: String) async -> AsyncStream<String>? {
        let stdoutPipe: Pipe
        if let running = self.runningProcesses[serverId] {
            stdoutPipe = running.stdout
            // Mark claimed before returning: a same-race exit must not salvage this pipe out from under the reader.
            self.runningProcesses[serverId]?.claimed = true
        } else if let terminated = self.terminatedStdout.removeValue(forKey: serverId) {
            stdoutPipe = terminated
        } else {
            return nil
        }
        let handle = stdoutPipe.fileHandleForReading

        return AsyncStream { continuation in
            let task = Task<Void, Never> { @concurrent in
                var lineBuffer = Data()
                do {
                    for try await byte in handle.bytes {
                        if byte == UInt8(ascii: "\n") {
                            continuation.yield(Self.decodeLine(lineBuffer))
                            lineBuffer.removeAll(keepingCapacity: true)
                        } else {
                            lineBuffer.append(byte)
                        }
                    }
                } catch {
                    // `FileHandle.AsyncBytes` only throws for a genuine
                    // read error on the underlying descriptor (e.g. it was
                    // closed out from under us). There's nothing to retry
                    // or recover mid-stream, so this just falls through to
                    // flushing any trailing partial line and finishing --
                    // the same outcome as a clean EOF.
                }
                if !lineBuffer.isEmpty {
                    continuation.yield(Self.decodeLine(lineBuffer))
                }
                continuation.finish()
            }

            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func decodeLine(_ data: Data) -> String {
        String(bytes: data, encoding: .utf8) ?? ""
    }

    /// Launches `server`'s Java process. Sets `currentDirectoryURL` to
    /// `server.path` so the `-jar` argument can be a bare filename rather
    /// than an absolute path (matching the Rust reference's `current_dir`
    /// approach). `standardOutput` is redirected to a `Pipe` this actor
    /// retains (see `RunningProcess.stdout`) so `stdoutLines(serverId:)`
    /// can read it live -- task 3-8's job. `standardError` is redirected to
    /// its own `Pipe` too: Minecraft duplicates its console output to both
    /// stdout and stderr, and the Rust reference app likewise never surfaces
    /// stderr content, so nothing decodes or yields it -- but the pipe's
    /// read end is still drained continuously in the background. Leaving it
    /// unread would let the OS pipe buffer (~64KB on macOS) fill up under
    /// enough console spam, blocking the child's next `write()` to stderr
    /// and potentially hanging the Minecraft server itself.
    public func start(server: Server) async throws {
        guard self.runningProcesses[server.id] == nil else {
            throw ServerProcessError.alreadyRunning(serverId: server.id)
        }
        guard let javaPath = server.javaPath else {
            throw ServerProcessError.javaPathNotConfigured(serverId: server.id)
        }

        // Drop any stale, never-claimed pipe from a previous run of this
        // server id -- `stdoutLines` should serve the *new* process's
        // stdout, not a leftover reference to the old one.
        self.terminatedStdout.removeValue(forKey: server.id)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: javaPath)
        process.currentDirectoryURL = URL(fileURLWithPath: server.path, isDirectory: true)
        process.arguments = self.buildArguments(for: server)

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        try process.run()

        self.runningProcesses[server.id] = RunningProcess(
            process: process,
            stdin: stdinPipe.fileHandleForWriting,
            stdout: stdoutPipe,
        )

        Self.drainAndDiscard(stderrPipe.fileHandleForReading)

        let serverId = server.id
        Task { [weak self] in
            let terminationStatus = await Self.awaitTermination(of: process)
            let status: ServerStatus = terminationStatus == 0 ? .offline : .crashed
            await self?.handleTermination(serverId: serverId, status: status)
        }
    }

    /// Continuously reads and discards bytes from `handle` in the
    /// background, purely to keep its OS pipe buffer from filling up and
    /// blocking the writer -- see the note on `standardError` above. Not
    /// tied to this actor's isolation (`@concurrent`, like
    /// `stdoutLines(serverId:)`'s reader) since it lives for the whole
    /// process lifetime and reads nothing actor-relevant. Ends naturally
    /// when the pipe's write end closes (process exit), same as
    /// `stdoutLines`'s reader.
    private static func drainAndDiscard(_ handle: FileHandle) {
        Task<Void, Never> { @concurrent in
            do {
                for try await _ in handle.bytes {}
            } catch {
                // Same rationale as `stdoutLines(serverId:)`: a read error
                // here just means the descriptor closed out from under us,
                // which is an ordinary way for this loop to end.
            }
        }
    }

    /// Stops the tracked process for `serverId`. Primary mechanism: write
    /// `"stop\n"` to the process's stdin, letting Minecraft's own console
    /// command handler shut down gracefully (matching the Rust reference --
    /// no SIGTERM/SIGKILL as the first resort). If the process hasn't
    /// exited within `gracefulStopTimeout`, escalates to
    /// `Process.terminate()` (SIGTERM).
    ///
    /// Returns once either the process has exited or the escalation has
    /// been issued -- the resulting `.offline`/`.crashed` status is
    /// reported asynchronously via `events` once the monitoring task set up
    /// in `start(server:)` observes the actual termination, since that's
    /// this actor's single source of truth for "did it actually exit."
    public func stop(serverId: String) async throws {
        guard let running = self.runningProcesses[serverId] else {
            throw ServerProcessError.serverNotRunning(serverId: serverId)
        }

        // Writing can fail if the process already exited and closed its
        // stdin between our lookup above and this write; that's not a hard
        // failure here -- the goal ("process no longer running") may
        // already be achieved, so fall through to the wait/escalation
        // below rather than propagating this as an error.
        try? running.stdin.write(contentsOf: Data("stop\n".utf8))

        let deadline = ContinuousClock.now.advanced(by: self.gracefulStopTimeout)
        while self.runningProcesses[serverId] != nil, ContinuousClock.now < deadline {
            try? await Task.sleep(for: .milliseconds(100))
        }

        if let stillRunning = self.runningProcesses[serverId] {
            stillRunning.process.terminate()
        }
    }

    /// Builds the JVM launch arguments: `-Xmx{memory}M -Xms{memory}M
    /// [extra JVM args] -jar server.jar nogui`, matching the Rust
    /// reference's argument shape.
    ///
    /// `Server.jvmArgs` is a single optional raw `String` (unlike Rust's
    /// already-tokenized, shell-metacharacter-validated `Vec<String>`).
    /// Since `Process` never goes through a shell here (same as Rust's
    /// `Command::new().args()`), classic shell-injection isn't the threat
    /// model -- a light touch (split on whitespace, drop empty tokens, pass
    /// each as a separate argument) is enough; a validation/sanitization
    /// subsystem is out of this task's scope.
    private func buildArguments(for server: Server) -> [String] {
        var arguments = [
            "-Xmx\(server.memory)M",
            "-Xms\(server.memory)M"
        ]
        if let jvmArgs = server.jvmArgs {
            arguments.append(contentsOf: jvmArgs.split(whereSeparator: \.isWhitespace).map(String.init))
        }
        arguments.append(contentsOf: ["-jar", Self.jarFileName, "nogui"])
        return arguments
    }

    /// Bridges `Process.terminationHandler` (a system-driven callback fired
    /// on an arbitrary queue, not a blocking wait) to `async`/`await`.
    ///
    /// Deliberately not `waitUntilExit()`: that call blocks the calling
    /// thread for as long as the child runs, which -- if driven from
    /// within this actor's isolation -- would hold this actor's executor
    /// hostage for the server's entire runtime, making `stop`/`isRunning`
    /// uncallable until it exits. Using a continuation resumed by
    /// `terminationHandler` is a true suspension instead: the `Task` in
    /// `start(server:)` that awaits this can inherit the actor's isolation
    /// safely, because suspending here releases the actor's executor for
    /// other work rather than blocking it.
    private static func awaitTermination(of process: Process) async -> Int32 {
        await withCheckedContinuation { continuation in
            process.terminationHandler = { terminatedProcess in
                continuation.resume(returning: terminatedProcess.terminationStatus)
            }
        }
    }

    private func handleTermination(serverId: String, status: ServerStatus) {
        if let running = self.runningProcesses.removeValue(forKey: serverId) {
            try? running.stdin.close()
            // Only salvage an unclaimed pipe -- see `terminatedStdout`'s doc.
            if !running.claimed {
                self.terminatedStdout[serverId] = running.stdout
            }
        }
        self.eventContinuation.yield(ServerProcessEvent(serverId: serverId, status: status))
    }
}
