import Foundation

/// Stdout broadcaster fan-out for `ServerProcessService` (task 5-1). Split
/// off from `ServerProcessService.swift` purely for SwiftLint's
/// `file_length` cap -- everything here is `fileprivate` or actor-
/// isolated and belongs to the same actor's private surface. The public
/// entry point is `ServerProcessService.stdoutLines(serverId:)`, kept
/// here beside its supporting methods so the multi-consumer contract
/// documented on it lives next to the reader/broadcast machinery it
/// depends on.
extension ServerProcessService {
    /// Actor-private per-serverId stdout fan-out coordinator. Introduced
    /// in task 5-1 to let multiple observers (log view + `TPSExtractor`
    /// on the Dashboard) both read the same stdout without either
    /// doubling the pipe reader or being forced to serialize behind each
    /// other. A single `readerTask` iterates the OS pipe once and yields
    /// each decoded line to every currently-registered continuation.
    ///
    /// Class rather than a struct because the reader `Task` needs a
    /// stable reference to mutate `isFinished` after the actor hop back
    /// at EOF, and because subscribers are added/removed as identity
    /// operations (`UUID` -> continuation), not value replacements. Not
    /// `Sendable` and never crosses the actor boundary -- lives only in
    /// `stdoutBroadcasters`, mutated only under actor isolation.
    final class StdoutBroadcaster {
        var subscribers: [UUID: AsyncStream<String>.Continuation] = [:]
        /// Set once by the reader Task after it has drained the pipe to
        /// EOF (or hit an unrecoverable read error) and finished all live
        /// subscribers. Late `stdoutLines` callers see this as "already
        /// done, nothing more coming" and receive `nil`, matching the
        /// pre-broadcaster single-consumer contract for
        /// already-exited-then-drained servers.
        var isFinished = false
        var readerTask: Task<Void, Never>?
    }

    /// A live, line-oriented view of `serverId`'s stdout, or `nil` if
    /// this instance has never started a process for that id, or has
    /// already served and finished its stream via a previous call.
    /// `nil`, not a thrown error: "no live stdout right now" is an
    /// expected, steady-state outcome for a server that simply isn't
    /// running -- the log view's job is to reflect that (e.g. show
    /// nothing / a placeholder) rather than treat it as exceptional, so
    /// a typed error would just force every caller to immediately
    /// catch-and-ignore it.
    ///
    /// **Multi-consumer safe (task 5-1).** Internally backed by a per-
    /// `serverId` `StdoutBroadcaster`: a single reader `Task` iterates
    /// the underlying OS pipe exactly once, decoding lines, and fans
    /// each one out to every currently-registered subscriber's
    /// `AsyncStream.Continuation`. Callers can therefore invoke this
    /// method concurrently for the same live `serverId` (today:
    /// `ServerLogViewModel` for the log view *and* the Dashboard's
    /// `TPSExtractor` on the same running server) and each receives the
    /// same lines in the same order, without doubling up the pipe
    /// reader or splitting bytes between two competing readers. New
    /// subscribers see lines from their subscription point onward --
    /// there is no per-line replay buffer.
    ///
    /// Lookup / creation order for the broadcaster:
    /// 1. A broadcaster already exists and hasn't finished → add a new
    ///    subscriber and return its stream.
    /// 2. A broadcaster already exists but has finished (EOF or read
    ///    error happened) → return `nil`, matching the pre-broadcaster
    ///    "already-drained" behavior for consistency.
    /// 3. `runningProcesses` has an entry → create a fresh broadcaster
    ///    from the live process's stdout pipe.
    /// 4. `terminatedStdout` has a salvaged pipe (see its doc for the
    ///    exit-before-first-read race) → create a fresh broadcaster
    ///    from that.
    /// 5. None of the above → `nil`.
    ///
    /// Reads incrementally via `FileHandle.bytes` (an `AsyncSequence`
    /// of bytes), per the swift-concurrency skill's guidance for
    /// bridging callback/handle-based APIs to `AsyncStream` --
    /// deliberately not `readToEnd()`/`readToEndCompat()` (see
    /// `JavaLaunchHarness`), which blocks until the pipe's write end
    /// closes and so cannot serve a *live* stream. Bytes accumulate
    /// into a line buffer, decoded and broadcast as `String`s on each
    /// `\n`, with any trailing partial line flushed once the loop ends.
    ///
    /// The reader `Task` runs `@concurrent` rather than inheriting this
    /// actor's isolation -- per the swift-concurrency skill's actor
    /// guidance, a long-lived unstructured `Task` should never pin an
    /// actor's serial executor for its whole lifetime, which reading a
    /// potentially-hours-long stream would otherwise do. It hops back
    /// to this actor to broadcast each line (via `deliver(_:for:)`) and
    /// to finalize (`finishBroadcaster(for:)`), keeping subscribers-
    /// dictionary mutations serialized under actor isolation.
    ///
    /// Subscriber teardown: each returned stream's `onTermination`
    /// removes only that subscriber's continuation. The reader `Task`
    /// is *not* cancelled when one subscriber drops out -- other
    /// subscribers may still be reading, and even with zero subscribers
    /// the pipe must continue being drained so the child process's
    /// stdout writes don't block on a full kernel buffer (same
    /// rationale as `drainAndDiscard(_:)` for stderr).
    public func stdoutLines(serverId: String) async -> AsyncStream<String>? {
        if let existing = self.stdoutBroadcasters[serverId] {
            if existing.isFinished {
                return nil
            }
            return self.subscribe(to: existing, serverId: serverId)
        }

        let stdoutPipe: Pipe
        if let running = self.runningProcesses[serverId] {
            stdoutPipe = running.stdout
        } else if let terminated = self.terminatedStdout.removeValue(forKey: serverId) {
            stdoutPipe = terminated
        } else {
            return nil
        }

        let broadcaster = StdoutBroadcaster()
        self.stdoutBroadcasters[serverId] = broadcaster
        broadcaster.readerTask = self.spawnReader(handle: stdoutPipe.fileHandleForReading, serverId: serverId)
        return self.subscribe(to: broadcaster, serverId: serverId)
    }

    /// Registers a new continuation on `broadcaster` and returns its
    /// stream. Actor-isolated so subscriber-dict mutation is serialized
    /// with the reader Task's fan-out and its EOF finalization.
    private func subscribe(to broadcaster: StdoutBroadcaster, serverId: String) -> AsyncStream<String> {
        let subscriberId = UUID()
        return AsyncStream { continuation in
            broadcaster.subscribers[subscriberId] = continuation
            continuation.onTermination = { [weak self] _ in
                // `onTermination` is `@Sendable` and fires from an
                // arbitrary context (the consumer's cancellation, EOF,
                // or `continuation.finish()` in `finishBroadcaster`).
                // Hop back to actor isolation via `Task { await ... }`
                // so the shared `subscribers` dict is only ever mutated
                // on the actor.
                Task { await self?.removeSubscriber(subscriberId, from: serverId) }
            }
        }
    }

    private func removeSubscriber(_ subscriberId: UUID, from serverId: String) {
        // Deliberately does not cancel the reader Task when subscribers
        // reach zero: the child process's stdout still needs draining
        // (see `stdoutLines`'s class-level comment), and another
        // subscriber may attach later while the process is still
        // running.
        self.stdoutBroadcasters[serverId]?.subscribers.removeValue(forKey: subscriberId)
    }

    private func spawnReader(handle: FileHandle, serverId: String) -> Task<Void, Never> {
        Task<Void, Never> { @concurrent [weak self] in
            var lineBuffer = Data()
            do {
                for try await byte in handle.bytes {
                    if byte == UInt8(ascii: "\n") {
                        let line = Self.decodeLine(lineBuffer)
                        await self?.deliver(line, for: serverId)
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
                await self?.deliver(Self.decodeLine(lineBuffer), for: serverId)
            }
            await self?.finishBroadcaster(for: serverId)
        }
    }

    private func deliver(_ line: String, for serverId: String) {
        guard let broadcaster = self.stdoutBroadcasters[serverId] else { return }
        for (_, continuation) in broadcaster.subscribers {
            continuation.yield(line)
        }
    }

    private func finishBroadcaster(for serverId: String) {
        guard let broadcaster = self.stdoutBroadcasters.removeValue(forKey: serverId) else { return }
        broadcaster.isFinished = true
        for (_, continuation) in broadcaster.subscribers {
            continuation.finish()
        }
        broadcaster.subscribers.removeAll()
        // Broadcaster is removed from the map on finalize so a
        // subsequent `stdoutLines` call for this `serverId` falls
        // through the "no entry" path and correctly returns `nil` (once
        // the underlying pipe's data has been drained, there's nothing
        // more to serve). If `start(server:)` runs again for the same
        // id, a fresh broadcaster is created lazily on the next
        // `stdoutLines` call.
    }

    static func decodeLine(_ data: Data) -> String {
        String(bytes: data, encoding: .utf8) ?? ""
    }
}
