import Foundation
import Observation

/// Bridges a running server's live stdout (`ServerProcessService.stdoutLines(serverId:)`)
/// into the 3-3 spike's confirmed-fastest rendering pipeline: a
/// `LogLineBuffer` (hysteresis-trim, avoids per-line `Array.removeFirst`
/// cost) fed through a `LogBatcher` (avoids one `@Observable` state mutation
/// per incoming line, which is what made `List`'s ARC/diffing cost dominate
/// in the 3-3 trace). Neither `LogLineBuffer` nor `LogBatcher` is
/// reimplemented here -- both are reused exactly as validated by that spike;
/// see `spec/phase3a-spike-results.md` §3-3.
///
/// `LogLine.id` is a monotonic `Int` assigned by this view model as lines
/// arrive, and `LogLine.timestamp` is a `ContinuousClock.Instant` taken at
/// arrival time. Neither needs adjustment from the spike's shape for real
/// stdout: `id` only needs to be stable per line for `Identifiable` (not
/// meaningful), and `timestamp` is only ever consumed internally by
/// `LogBatcher`'s interval-window grouping (relative elapsed time, never
/// rendered to the user as wall-clock time) -- `ContinuousClock.Instant` is
/// actually the *better* fit there than a wall-clock `Date`, since it can't
/// be skewed by a system clock adjustment mid-session.
@MainActor
@Observable
public final class ServerLogViewModel {
    private var buffer: LogLineBuffer
    private let batcher: LogBatcher
    private let flushInterval: Duration
    private let processService: ServerProcessService
    private let serverId: String

    /// Lines pulled off the stdout stream since the last periodic flush.
    /// Plain accumulation only -- not `@Observable`-tracked, since no view
    /// reads it directly; only `flush()`'s contribution to `buffer` (via
    /// `lines`) is meant to drive view updates.
    @ObservationIgnored
    private var pendingLines: [LogLine] = []
    @ObservationIgnored
    private var nextLineId = 0
    @ObservationIgnored
    private let clock = ContinuousClock()

    /// The lines currently retained for display, per `LogLineBuffer`'s
    /// hysteresis-trim policy. Reading this from a view registers an
    /// `@Observable` dependency on the underlying `buffer` storage.
    public var lines: [LogLine] {
        self.buffer.lines
    }

    /// - Parameters:
    ///   - flushInterval: How often accumulated stdout lines are applied to
    ///     `buffer` as a single batch of `@Observable` mutations, rather
    ///     than one mutation per line. `50ms` keeps the UI feeling live
    ///     (well under human perception of "instant") while still
    ///     collapsing bursts -- matching the interval the 3-3 spike's
    ///     `LogBatcher` was designed to group by.
    public init(
        serverId: String,
        processService: ServerProcessService,
        retainedLineCount: Int = 5000,
        trimOvershoot: Int = 500,
        flushInterval: Duration = .milliseconds(50),
    ) {
        self.serverId = serverId
        self.processService = processService
        self.buffer = LogLineBuffer(retainedLineCount: retainedLineCount, trimOvershoot: trimOvershoot)
        self.batcher = LogBatcher(interval: flushInterval)
        self.flushInterval = flushInterval
    }

    /// Streams `serverId`'s live stdout into `lines` until either the
    /// stream ends (the process exited -- its write end of the pipe closes,
    /// so `ServerProcessService`'s reader hits EOF and finishes the stream
    /// naturally) or the calling `Task` is cancelled.
    ///
    /// Intended to be awaited directly from a SwiftUI `.task`/`.task(id:)`
    /// modifier so cancellation is structured at the call site -- when that
    /// task is cancelled (view disappears, `.task(id:)`'s id changes),
    /// cancellation propagates into the `for await` loop below (per the
    /// async-sequences skill: streams cancel when the enclosing task does)
    /// and this method returns, with no separately-stored `Task` for a
    /// caller to remember to cancel.
    ///
    /// Internally, a second `Task` (`flushTicker`) runs alongside the read
    /// loop purely to guarantee periodic flushing even during a quiet
    /// stretch with no new lines arriving -- without it, a burst of lines
    /// followed by silence (the common shape of Minecraft's own startup
    /// log, then nothing until a player acts) would leave the last burst
    /// sitting unflushed in `pendingLines` indefinitely, since flushing
    /// otherwise only happens as a side effect of a line arriving. Its
    /// lifetime is scoped to this function via `defer`, not stored as
    /// instance state, so it can never outlive a single `streamLogs()`
    /// call. (An earlier version used `withTaskGroup` with two `@MainActor`
    /// child tasks for this instead; that hit a Swift 6.2 region-based
    /// isolation checker limitation -- "pattern that the region based
    /// isolation checker does not understand how to check" -- so this
    /// simpler `defer`-scoped `Task` is used instead, per the
    /// swift-concurrency skill's smallest-safe-fix guidance.)
    ///
    /// If `serverId` has no tracked running process (`stdoutLines` returns
    /// `nil` -- not started yet, already stopped/crashed), this returns
    /// immediately without touching `buffer`. Callers key their `.task(id:)`
    /// on the server's status (e.g. `.online`) so this re-runs and picks up
    /// the live stream once the process actually starts.
    public func streamLogs() async {
        guard let stream = await self.processService.stdoutLines(serverId: self.serverId) else { return }

        // Inherits this method's @MainActor isolation (no `@concurrent`):
        // its entire body -- the sleep aside -- needs `self.flush()` to run
        // on the main actor, and there's no off-actor work worth hopping
        // away for.
        let flushTicker = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: self.flushInterval)
                self.flush()
            }
        }
        defer { flushTicker.cancel() }

        for await text in stream {
            self.nextLineId += 1
            self.pendingLines.append(LogLine(id: self.nextLineId, timestamp: self.clock.now, text: text))
        }

        // Final flush: the loop above ended (stream EOF or cancellation)
        // with lines possibly still sitting in `pendingLines` from less
        // than `flushInterval` ago.
        self.flush()
    }

    /// Applies everything accumulated in `pendingLines` to `buffer` as a
    /// single synchronous burst of `LogLineBuffer.append` calls -- no
    /// `await` in between, so SwiftUI observes one state change per flush
    /// rather than one per line. `LogBatcher.batch` re-groups the flushed
    /// slice by its own interval windows first: if a flush was ever delayed
    /// past multiple windows' worth of backlog, this keeps that backlog's
    /// internal structure rather than flattening it into one giant
    /// undifferentiated group -- consistent with reusing `LogBatcher`
    /// exactly as the 3-3 spike validated it, not reinventing its grouping.
    private func flush() {
        guard !self.pendingLines.isEmpty else { return }
        let toFlush = self.pendingLines
        self.pendingLines.removeAll(keepingCapacity: true)

        for group in self.batcher.batch(toFlush) {
            for line in group {
                self.buffer.append(line)
            }
        }
    }
}
