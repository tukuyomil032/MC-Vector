import Foundation
import Testing
@testable import Core

// Task 5-2 tests for `ServerPerformanceService`. Real end-to-end sampling
// against a live `Process` PID is deferred to task 5-3's ViewModel tests
// (per the plan's own acceptance-note wording: "統合テストは Task 5-3 の
// ViewModel テストで代替可"). This file covers the pieces we can validate
// without spinning up a real Java-launch-style child:
//
// - `sampleRusage(pid:)` against a real, low-cost, live PID (this test
//   process's own PID) — proves the Darwin bridge type-checks and the
//   syscall returns a sane readout.
// - `nanoseconds(from:to:)` for the `ContinuousClock`-based interval math.
// - `stream(for:processService:)`'s termination-on-nil-pid contract, so
//   the loop provably exits when the process disappears — using a
//   `ServerProcessService` instance with no `start()` call, `pid()` is
//   `nil` on the first tick and the stream finishes immediately.

@Test("sampleRusage returns a non-zero CPU/memory readout for a live PID (this test process)")
func sampleRusageReturnsSaneReadoutForCurrentProcess() throws {
    let sample = try #require(ServerPerformanceService.sampleRusage(pid: getpid()))
    // This test process has been running for at least a few ms and has an
    // address space -- both counters must be positive. A zero here would
    // mean the pointer-rebind bridge silently handed the kernel a stale /
    // misaligned buffer.
    #expect(sample.cpuNanos > 0)
    #expect(sample.residentBytes > 0)
}

@Test("sampleRusage returns nil for a definitely-dead PID")
func sampleRusageReturnsNilForDeadPid() {
    // PID 0 is reserved by the kernel scheduler and never available to
    // `proc_pid_rusage` from userspace -- calling with it returns non-zero
    // (typically ESRCH). Any other choice of "definitely dead PID" would
    // race a legitimate future process being assigned the id.
    let sample = ServerPerformanceService.sampleRusage(pid: 0)
    #expect(sample == nil)
}

@Test("nanoseconds returns roughly the elapsed wall clock between two ContinuousClock instants")
func nanosecondsReflectsElapsedInterval() async throws {
    let clock = ContinuousClock()
    let start = clock.now
    try await Task.sleep(for: .milliseconds(50))
    let end = clock.now
    let nanos = ServerPerformanceService.nanoseconds(from: start, to: end)
    // 50 ms == 5 * 10^7 ns. Allow a wide upper bound: CI schedulers can
    // slip a Task.sleep by 10s of ms without indicating a bug, but must
    // never come back with *less* than the sleep interval.
    #expect(nanos >= 50_000_000)
    #expect(nanos < 1_000_000_000)
}

@Test("stream terminates immediately when the server has no tracked PID")
func streamTerminatesWhenPidUnavailable() async {
    let processService = ServerProcessService()
    let performanceService = ServerPerformanceService(samplingInterval: .milliseconds(10))

    let stream = performanceService.stream(
        for: "no-such-server",
        processService: processService,
    )

    // No `start()` was ever called for this id, so `pid()` returns nil on
    // the first tick and the sampler loop should exit and finish the
    // stream. Iterating to completion here proves both that the loop
    // doesn't spin forever and that `continuation.finish()` is called.
    var samples: [ServerMetrics] = []
    for await metrics in stream {
        samples.append(metrics)
    }
    #expect(samples.isEmpty)
}
