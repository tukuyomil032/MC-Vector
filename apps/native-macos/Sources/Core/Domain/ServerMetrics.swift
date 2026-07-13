import Foundation

/// A single 1 Hz sample of a running Minecraft server child process's CPU
/// and memory usage, as observed by `ServerPerformanceService` off the
/// macOS `proc_pid_rusage(RUSAGE_INFO_V4)` per-PID counters (task 5-2).
///
/// Sampled fields:
/// - `cpu` — percent-of-one-core CPU utilisation over the elapsed sampling
///   interval, computed as `(ri_user_time + ri_system_time)` delta divided
///   by wall-clock delta between two adjacent samples. Deliberately NOT
///   divided by CPU-core count: a multi-threaded server saturating four
///   cores reports ~400 %, matching how `top` / Activity Monitor render
///   per-process CPU on macOS, and matching the Rust reference
///   (`src-tauri/src/commands/process_stats.rs`) which likewise clamps only
///   at 0 (via `sysinfo::Process::cpu_usage()` semantics) and lets values
///   exceed 100. The plan document phrased this as "0〜100" but the design
///   intent alongside it explicitly deferred the per-core normalisation
///   decision to Tauri-parity — this file follows that decision. The
///   Dashboard UI is expected to render this as a labelled percent with a
///   >100 % legend, not to constrain the scale.
/// - `memoryBytes` — resident set size in bytes (`ri_resident_size`
///   verbatim). Not converted at capture time so downstream displays can
///   choose MiB, GiB, or whatever unit is right for the surface without
///   losing precision.
///
/// **Known limitation (single-process sampling).**
/// `proc_pid_rusage` reports only the addressed PID, not any children it
/// forks. The child process addressed here is Java itself, which almost
/// never re-forks in normal Minecraft server operation, so this is fine
/// for the intended dashboard use — but if a plugin does `Runtime.exec`
/// something CPU-heavy, that grandchild's usage will not be counted. Left
/// as-is per plan risk annotation; solving it would require walking the
/// process tree per sample, which is out of scope for task 5-2.
///
/// `id` is a per-sample `UUID` rather than the sample's index, so the
/// Dashboard's charting layer can use it directly as a stable
/// `Identifiable` key across window-trim events (see `pruneMetricWindow`)
/// without an integer counter having to be threaded through the pipeline.
public struct ServerMetrics: Sendable, Identifiable, Equatable {
    public let id: UUID
    public let cpu: Double
    public let memoryBytes: UInt64
    public let timestamp: Date

    public init(
        id: UUID = UUID(),
        cpu: Double,
        memoryBytes: UInt64,
        timestamp: Date,
    ) {
        self.id = id
        self.cpu = cpu
        self.memoryBytes = memoryBytes
        self.timestamp = timestamp
    }
}

public extension ServerMetrics {
    /// Length in seconds of the rolling window the Dashboard's chart is
    /// designed against (task 5-2 plan). Exposed as a constant so both
    /// `pruneMetricWindow` and downstream ViewModels reference the same
    /// number rather than each hard-coding `60`.
    static let defaultWindowSeconds: TimeInterval = 60

    /// Percent-of-one-core CPU utilisation from a cumulative CPU-time
    /// delta over a wall-clock interval. Extracted as a pure `static`
    /// function so `ServerPerformanceService` sampling can be unit tested
    /// with fabricated inputs without needing a real running process
    /// (which would require sudo entitlement to reliably drive
    /// `proc_pid_rusage` under CI).
    ///
    /// `cpuTimeDeltaNanos` is the change in `ri_user_time + ri_system_time`
    /// (both in nanoseconds per macOS `<sys/resource.h>`) between two
    /// adjacent samples. `intervalNanos` is the wall-clock elapsed
    /// nanoseconds between those samples, taken from `ContinuousClock`
    /// (not `Date`) so a system-clock adjustment mid-session doesn't yield
    /// a bogus % spike.
    ///
    /// - A zero or negative interval (never expected in practice, but
    ///   possible if the two samples land in the same instant of a very
    ///   fast test clock) returns `0` — a naive `deltaCpu / 0` would be
    ///   `inf`, which would then poison any downstream running average.
    /// - The result is clamped at `0` at the low end only. It is not
    ///   capped at `100`: see `ServerMetrics.cpu`'s doc for the
    ///   multi-core / Tauri-parity rationale.
    static func cpuPercent(
        cpuTimeDeltaNanos: UInt64,
        intervalNanos: Double,
    ) -> Double {
        guard intervalNanos > 0 else { return 0 }
        let percent = Double(cpuTimeDeltaNanos) / intervalNanos * 100.0
        return max(0, percent)
    }

    /// Resident-set-size bytes → megabytes (base-2 MiB, i.e. `bytes /
    /// 1024 / 1024`). Extracted as a pure `static` so the Dashboard's
    /// memory readout can be tested against known byte counts without
    /// spinning up a real process.
    static func memoryMegabytes(from bytes: UInt64) -> Double {
        Double(bytes) / 1024.0 / 1024.0
    }

    /// Retains only samples whose `timestamp` is within the last
    /// `windowSeconds` of `now`. Extracted so both the ViewModel (task
    /// 5-3, next) and its unit tests can call the same trim rule rather
    /// than re-writing the filter closure at every append site.
    ///
    /// A sample exactly at the boundary (`now.timeIntervalSince(t) ==
    /// windowSeconds`) is *retained*, not dropped: a 60 s window
    /// containing a sample from 60 s ago is the caller's intent for the
    /// live tail, and using `<=` here means the chart doesn't briefly
    /// flicker down to N-1 samples on the frame the deadline is hit.
    static func pruneMetricWindow(
        _ metrics: [ServerMetrics],
        now: Date,
        windowSeconds: TimeInterval = defaultWindowSeconds,
    ) -> [ServerMetrics] {
        metrics.filter { now.timeIntervalSince($0.timestamp) <= windowSeconds }
    }
}
