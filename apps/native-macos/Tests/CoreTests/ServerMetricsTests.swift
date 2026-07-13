import Foundation
import Testing
@testable import Core

// Task 5-2 pure-function coverage for the `ServerMetrics` domain type:
// unit conversions (`cpuPercent`, `memoryMegabytes`) and the rolling-window
// filter (`pruneMetricWindow`). Kept independent of any real running
// process so this runs green under CI without the `proc_pid_rusage`
// syscall or elevated privileges — the integration side is covered
// indirectly by the ViewModel tests coming in task 5-3.

@Test("cpuPercent turns 1s of CPU time over a 1s wall-clock interval into 100%")
func cpuPercentBaseCase() {
    let percent = ServerMetrics.cpuPercent(
        cpuTimeDeltaNanos: 1_000_000_000,
        intervalNanos: 1_000_000_000,
    )
    #expect(percent == 100.0)
}

@Test("cpuPercent reports >100% for multi-core saturation, matching Tauri parity")
func cpuPercentAllowsMultiCoreSaturation() {
    // Four cores fully busy for 1s wall-clock — cumulative CPU time is 4s.
    let percent = ServerMetrics.cpuPercent(
        cpuTimeDeltaNanos: 4_000_000_000,
        intervalNanos: 1_000_000_000,
    )
    #expect(percent == 400.0)
}

@Test("cpuPercent returns 0 for a zero or negative interval instead of dividing by zero")
func cpuPercentGuardsZeroInterval() {
    #expect(ServerMetrics.cpuPercent(cpuTimeDeltaNanos: 500_000_000, intervalNanos: 0) == 0)
    #expect(ServerMetrics.cpuPercent(cpuTimeDeltaNanos: 500_000_000, intervalNanos: -1) == 0)
}

@Test("cpuPercent clamps at 0 on the low end")
func cpuPercentClampsAtZero() {
    // `cpuTimeDeltaNanos` is `UInt64`, so a "negative delta" isn't
    // representable in the input signature -- clamping matters only if the
    // caller ever passes a garbage-small positive delta, which just yields
    // a small positive number. Verify the >= 0 postcondition explicitly.
    let percent = ServerMetrics.cpuPercent(
        cpuTimeDeltaNanos: 1,
        intervalNanos: 1_000_000_000,
    )
    #expect(percent >= 0)
}

@Test("memoryMegabytes converts bytes to base-2 MiB")
func memoryMegabytesConvertsBytesToMiB() {
    #expect(ServerMetrics.memoryMegabytes(from: 0) == 0)
    #expect(ServerMetrics.memoryMegabytes(from: 1024 * 1024) == 1)
    #expect(ServerMetrics.memoryMegabytes(from: 512 * 1024 * 1024) == 512)
    #expect(ServerMetrics.memoryMegabytes(from: 2 * 1024 * 1024 * 1024) == 2048)
}

@Test("pruneMetricWindow retains samples inside the last 60s and drops older ones")
func pruneMetricWindowRetainsRecentSamples() {
    let now = Date(timeIntervalSince1970: 10000)
    let samples = [
        ServerMetrics(cpu: 10, memoryBytes: 1000, timestamp: now.addingTimeInterval(-120)),
        ServerMetrics(cpu: 20, memoryBytes: 2000, timestamp: now.addingTimeInterval(-59)),
        ServerMetrics(cpu: 30, memoryBytes: 3000, timestamp: now.addingTimeInterval(-10)),
        ServerMetrics(cpu: 40, memoryBytes: 4000, timestamp: now)
    ]
    let pruned = ServerMetrics.pruneMetricWindow(samples, now: now)
    #expect(pruned.map(\.cpu) == [20, 30, 40])
}

@Test("pruneMetricWindow keeps a sample exactly at the window boundary")
func pruneMetricWindowKeepsBoundarySample() {
    let now = Date(timeIntervalSince1970: 20000)
    let samples = [
        ServerMetrics(cpu: 1, memoryBytes: 1, timestamp: now.addingTimeInterval(-60)),
        ServerMetrics(cpu: 2, memoryBytes: 2, timestamp: now.addingTimeInterval(-60.0001))
    ]
    let pruned = ServerMetrics.pruneMetricWindow(samples, now: now)
    // The sample at exactly -60s stays; the one just past it drops.
    #expect(pruned.map(\.cpu) == [1])
}

@Test("pruneMetricWindow accepts a custom window length")
func pruneMetricWindowUsesCustomWindow() {
    let now = Date(timeIntervalSince1970: 30000)
    let samples = [
        ServerMetrics(cpu: 1, memoryBytes: 1, timestamp: now.addingTimeInterval(-20)),
        ServerMetrics(cpu: 2, memoryBytes: 2, timestamp: now.addingTimeInterval(-5))
    ]
    let pruned = ServerMetrics.pruneMetricWindow(samples, now: now, windowSeconds: 10)
    #expect(pruned.map(\.cpu) == [2])
}

@Test("ServerMetrics is Identifiable with a unique id per instance by default")
func serverMetricsHasUniqueIdByDefault() {
    let one = ServerMetrics(cpu: 10, memoryBytes: 100, timestamp: Date())
    let two = ServerMetrics(cpu: 10, memoryBytes: 100, timestamp: one.timestamp)
    #expect(one.id != two.id)
}
