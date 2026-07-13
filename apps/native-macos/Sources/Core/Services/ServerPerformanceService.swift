import Darwin
import Foundation

/// Actor-isolated 1 Hz sampler that turns a running Minecraft server's
/// PID (owned by `ServerProcessService`, task 5-1) into a stream of
/// `ServerMetrics` for the Dashboard (task 5-2).
///
/// **Why a separate actor from `ServerProcessService`.** The plan calls for
/// two actors even though both live "downstream" of the same running
/// process, for two concrete reasons:
///
/// 1. `ServerProcessService`'s executor holds actor-isolated `Process`
///    references and serialises every `start`/`stop`/`stdoutLines`/`pid`
///    lookup on the actor's serial queue. Piping a per-second sampling
///    loop through the same executor would compete with those calls for
///    executor time, and — worse — a slow sample (e.g. a signal-blocked
///    `proc_pid_rusage`) would delay the user's next `stop()` call. Owning
///    sampling in its own actor keeps that isolation cost off the process
///    actor.
/// 2. Sampling only needs one thing from the process actor: the current
///    PID, retrieved once per second via a `pid(serverId:)` cross-actor
///    call. That's the entire coupling surface, and it's already `nil`-
///    valued when the process is gone, giving the sampling loop a natural
///    termination signal without extra plumbing.
///
/// **`stream(for:processService:)` is not itself actor-isolated.**
/// Constructing an `AsyncStream` with an `onTermination` closure is a
/// pure factory step — it needs none of this actor's state, and marking
/// it `nonisolated` avoids a needless actor hop at every call site (the
/// ViewModel just wants a stream handle it can iterate). The actual
/// sampling work runs inside a `@concurrent` `Task` created by the
/// factory, per the swift-concurrency skill's guidance that long-lived
/// background loops should never inherit their spawn point's actor
/// isolation and pin its executor. That `Task` calls back into
/// `processService.pid(serverId:)` (a cross-actor `await`) once per
/// sample, and reads only local (task-scoped) state otherwise.
public actor ServerPerformanceService {
    /// Wall-clock interval between successive samples. Overridable via
    /// `init` so tests can drive a much tighter loop (e.g. 10 ms) without
    /// blocking on real seconds elapsing.
    private let samplingInterval: Duration

    public init(samplingInterval: Duration = .seconds(1)) {
        self.samplingInterval = samplingInterval
    }

    /// A live stream of `ServerMetrics` for `serverId`, terminated when
    /// either the tracked process for that id exits (its PID becomes
    /// `nil` on the next lookup) or the returned stream's consumer
    /// finishes iterating / cancels its enclosing `Task` (which cancels
    /// the underlying sampler `Task` via `onTermination`).
    ///
    /// **No sample is yielded from the very first tick.** A CPU-percent
    /// figure is a delta between two adjacent cumulative CPU-time
    /// readings — the first tick's job is to record the baseline for the
    /// *second* tick to compare against. Yielding a `cpu = 0` sample at
    /// the first tick would fake a value that isn't measurable yet, so
    /// the loop swallows that first read and starts yielding from the
    /// second sample onward. In practice at 1 Hz this means the chart
    /// starts populating ~2 s after `start(server:)`, which is well
    /// within the "server is booting" window and doesn't lose any real
    /// insight — the JVM's cold-start CPU is not meaningful anyway.
    ///
    /// If `processService.pid(serverId:)` returns `nil` on the very first
    /// tick (e.g. caller called `stream` before / after the server's
    /// lifetime), the loop exits immediately, `continuation.finish()`
    /// fires, and the returned stream ends without ever yielding.
    public nonisolated func stream(
        for serverId: String,
        processService: ServerProcessService,
    ) -> AsyncStream<ServerMetrics> {
        let samplingInterval = self.samplingInterval
        return AsyncStream { continuation in
            let task = Task<Void, Never> { @concurrent in
                await Self.runSamplingLoop(
                    serverId: serverId,
                    processService: processService,
                    samplingInterval: samplingInterval,
                    continuation: continuation,
                )
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// The @concurrent sampling loop body, factored out so the
    /// AsyncStream constructor above stays readable and so the type
    /// checker can verify its `@Sendable` capture list once, at the
    /// factory boundary, rather than per-Task.
    ///
    /// Contract: yields nothing until it has two adjacent samples to
    /// take a delta between — see `stream(for:processService:)`'s doc.
    /// Exits (returning to the caller so `continuation.finish()` can
    /// run) as soon as `pid(serverId:)` returns `nil` or the enclosing
    /// Task is cancelled.
    private static func runSamplingLoop(
        serverId: String,
        processService: ServerProcessService,
        samplingInterval: Duration,
        continuation: AsyncStream<ServerMetrics>.Continuation,
    ) async {
        let clock = ContinuousClock()
        var previousCpuNanos: UInt64?
        var previousSampleInstant: ContinuousClock.Instant?

        while !Task.isCancelled {
            guard let pid = await processService.pid(serverId: serverId) else {
                return
            }
            let sampleInstant = clock.now
            guard let sample = Self.sampleRusage(pid: pid) else {
                // A failed sample (process disappeared between the pid
                // lookup and the syscall, or the syscall was interrupted)
                // is not a hard failure — just skip this tick and let the
                // next `pid(serverId:)` decide whether to keep going.
                try? await Task.sleep(for: samplingInterval)
                continue
            }
            defer {
                previousCpuNanos = sample.cpuNanos
                previousSampleInstant = sampleInstant
            }
            if let prevCpu = previousCpuNanos, let prevInstant = previousSampleInstant {
                let intervalNanos = Self.nanoseconds(from: prevInstant, to: sampleInstant)
                let cpuDelta = sample.cpuNanos &- prevCpu
                let cpu = ServerMetrics.cpuPercent(
                    cpuTimeDeltaNanos: cpuDelta,
                    intervalNanos: intervalNanos,
                )
                let metrics = ServerMetrics(
                    cpu: cpu,
                    memoryBytes: sample.residentBytes,
                    timestamp: Date(),
                )
                continuation.yield(metrics)
            }
            try? await Task.sleep(for: samplingInterval)
        }
    }

    /// One-shot readout of `proc_pid_rusage(RUSAGE_INFO_V4)` for `pid`.
    /// Returns `nil` on any non-zero return (typically `ESRCH` — the
    /// process exited between the caller's PID lookup and this syscall).
    ///
    /// The C signature is
    /// `int proc_pid_rusage(int pid, int flavor, rusage_info_t *buffer)`
    /// where `rusage_info_t` is `typedef void *`, so the third argument
    /// at the C level is `void **`. Swift imports the typedef as an
    /// optional raw pointer, which forces the `withMemoryRebound` bridge
    /// below — a plain `withUnsafeMutablePointer(to: &info) { proc_pid_rusage(pid, flavor, $0) }`
    /// won't type-check because `UnsafeMutablePointer<rusage_info_v4>`
    /// isn't `UnsafeMutablePointer<rusage_info_t?>` (Swift's projection of
    /// `void **`). The rebind + `assumingMemoryBound`-free path here is
    /// safe because we're only aliasing the pointer's *type*, never
    /// touching its underlying bytes as `rusage_info_t` — the kernel
    /// writes back into the original `rusage_info_v4` bytes.
    static func sampleRusage(pid: pid_t) -> RusageSample? {
        var info = rusage_info_v4()
        let result = withUnsafeMutablePointer(to: &info) { infoPtr -> Int32 in
            infoPtr.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { reboundPtr in
                proc_pid_rusage(pid, Int32(RUSAGE_INFO_V4), reboundPtr)
            }
        }
        guard result == 0 else { return nil }
        return RusageSample(
            cpuNanos: info.ri_user_time &+ info.ri_system_time,
            residentBytes: info.ri_resident_size,
        )
    }

    /// Converts a `ContinuousClock` interval into an integer nanosecond
    /// count (as `Double` for direct feed into `ServerMetrics.cpuPercent`,
    /// which already divides by this). `Duration.components` returns
    /// `(seconds, attoseconds)` — attoseconds = 10⁻¹⁸ s, nanoseconds =
    /// 10⁻⁹ s, so a divide-by-10⁹ collapses attoseconds to nanoseconds.
    static func nanoseconds(from start: ContinuousClock.Instant, to end: ContinuousClock.Instant) -> Double {
        let elapsed = start.duration(to: end)
        let parts = elapsed.components
        return Double(parts.seconds) * 1_000_000_000.0 + Double(parts.attoseconds) / 1_000_000_000.0
    }

    /// Two counters lifted verbatim from a `rusage_info_v4` readout.
    /// `Sendable` (all-let of `UInt64`s) so it can cross the actor
    /// boundary trivially if a future refactor moves sampling on-actor.
    struct RusageSample: Sendable, Equatable {
        let cpuNanos: UInt64
        let residentBytes: UInt64
    }
}
