import Foundation
import SwiftUI
import Testing
@testable import Core

// Task 5-4 tests for `DashboardViewModel` + `DashboardView`'s pure
// helpers. Integration coverage of the three background Tasks is left
// to visual smoke via `swift run` (per the task's own acceptance
// wording); this file focuses on the deterministic, timing-free
// pieces:
//
// - `DashboardViewModel.pruneWindow` windowing behaviour.
// - `ServerMetrics.pruneMetricWindow` for the metrics side (same
//   rule, kept in `Domain` since task 5-2).
// - `formatUptime` seconds -> HH:MM:SS formatting.
// - `ServerStatus.displayColor` mapping for all six statuses.
// - `DashboardViewModel.handle(event:)` state machine:
//   .online sets `startedAt` + status, .offline / .crashed reset both.
// - `CPUChartPanel.cpuYUpperBound` dynamic-scale rounding.
// - `MemoryChartPanel.memoryYUpperBound` dynamic-scale rounding.
// - `tpsColor` accent thresholds.

// MARK: - Windowing

@Test("pruneWindow drops samples strictly older than the window")
func pruneWindowDropsOldSamples() {
    let now = Date()
    let points = [
        TPSPoint(timestamp: now.addingTimeInterval(-90), value: 15),
        TPSPoint(timestamp: now.addingTimeInterval(-61), value: 16),
        TPSPoint(timestamp: now.addingTimeInterval(-59), value: 17),
        TPSPoint(timestamp: now, value: 20)
    ]

    let trimmed = DashboardViewModel.pruneWindow(points, now: now, windowSeconds: 60) { $0.timestamp }

    #expect(trimmed.map(\.value) == [17, 20])
}

@Test("pruneWindow retains a sample exactly on the window boundary")
func pruneWindowRetainsBoundarySample() {
    let now = Date()
    let points = [
        TPSPoint(timestamp: now.addingTimeInterval(-60), value: 19),
        TPSPoint(timestamp: now, value: 20)
    ]

    let trimmed = DashboardViewModel.pruneWindow(points, now: now, windowSeconds: 60) { $0.timestamp }

    #expect(trimmed.count == 2)
}

@Test("ServerMetrics.pruneMetricWindow drops samples older than the 60 s window")
func metricsPruneWindowDropsOldSamples() {
    let now = Date()
    let metrics = [
        ServerMetrics(cpu: 5, memoryBytes: 100, timestamp: now.addingTimeInterval(-90)),
        ServerMetrics(cpu: 10, memoryBytes: 200, timestamp: now.addingTimeInterval(-30)),
        ServerMetrics(cpu: 15, memoryBytes: 300, timestamp: now)
    ]

    let trimmed = ServerMetrics.pruneMetricWindow(metrics, now: now)

    #expect(trimmed.map(\.cpu) == [10, 15])
}

// MARK: - Uptime formatting

@Test("formatUptime formats seconds as zero-padded HH:MM:SS")
func formatUptimeFormatsHours() {
    // 3661s = 1h1m1s -- exercises the boundary between minutes and
    // hours, catching any modulo mishap.
    #expect(formatUptime(3661) == "01:01:01")
}

@Test("formatUptime pads short intervals with leading zeros")
func formatUptimeFormatsShort() {
    #expect(formatUptime(5) == "00:00:05")
    #expect(formatUptime(75) == "00:01:15")
}

@Test("formatUptime clamps negative input to zero")
func formatUptimeClampsNegative() {
    // Very small negative deltas are possible if `Date` is skewed
    // between `startedAt` capture and `now` -- clamping avoids
    // rendering something like `-00:00:01`.
    #expect(formatUptime(-5) == "00:00:00")
}

// MARK: - Status colour mapping

@Test("ServerStatus.displayColor uses the Tauri-parity palette for every documented status")
func statusDisplayColorMatchesTauri() {
    // Expected hex values from `src/renderer/components/DashboardView.tsx`
    // `STATUS_COLORS`. Kept literal here (not a computed derivation of
    // the enum) so a change to the palette forces a matching update to
    // this test rather than silently going out of sync.
    let expected: [ServerStatus: Color] = [
        .online: Color(hex: 0x10B981),
        .offline: Color(hex: 0xEF4444),
        .starting: Color(hex: 0xEAB308),
        .stopping: Color(hex: 0xF97316),
        .restarting: Color(hex: 0x3B82F6),
        .crashed: Color(hex: 0xF43F5E)
    ]

    for status in ServerStatus.allCases {
        #expect(status.displayColor == expected[status])
    }
}

// MARK: - Event handling

@MainActor
@Test("handle(event:) sets startedAt on .online and clears it on .offline / .crashed")
func handleEventStateMachine() throws {
    let processService = ServerProcessService()
    let performanceService = ServerPerformanceService(samplingInterval: .milliseconds(50))
    let server = Server(
        id: "srv-1",
        name: "Test",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 1024,
        path: FileManager.default.temporaryDirectory.path,
        status: .offline,
    )

    let viewModel = DashboardViewModel(
        server: server,
        processService: processService,
        performanceService: performanceService,
    )

    // Baseline: not running.
    #expect(viewModel.startedAt == nil)
    #expect(viewModel.currentStatus == .offline)

    viewModel.handle(event: ServerProcessEvent(serverId: "srv-1", status: .online))
    #expect(viewModel.currentStatus == .online)
    let startedAt = try #require(viewModel.startedAt)
    #expect(Date().timeIntervalSince(startedAt) < 1)

    viewModel.handle(event: ServerProcessEvent(serverId: "srv-1", status: .offline))
    #expect(viewModel.currentStatus == .offline)
    #expect(viewModel.startedAt == nil)

    // A subsequent .online sets a fresh startedAt again.
    viewModel.handle(event: ServerProcessEvent(serverId: "srv-1", status: .online))
    #expect(viewModel.startedAt != nil)

    // .crashed clears too, matching .offline.
    viewModel.handle(event: ServerProcessEvent(serverId: "srv-1", status: .crashed))
    #expect(viewModel.currentStatus == .crashed)
    #expect(viewModel.startedAt == nil)
}

@MainActor
@Test("init seeds startedAt when the passed-in server is already .online")
func initSeedsStartedAtForOnlineServer() throws {
    let processService = ServerProcessService()
    let performanceService = ServerPerformanceService(samplingInterval: .milliseconds(50))
    let server = Server(
        id: "srv-1",
        name: "Test",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 1024,
        path: FileManager.default.temporaryDirectory.path,
        status: .online,
    )

    let viewModel = DashboardViewModel(
        server: server,
        processService: processService,
        performanceService: performanceService,
    )

    #expect(viewModel.currentStatus == .online)
    // Mirrors the Tauri reference: opening the Dashboard on a
    // running server can't recover the historical start time, so
    // uptime counts from "now" (view opened).
    let startedAt = try #require(viewModel.startedAt)
    #expect(Date().timeIntervalSince(startedAt) < 1)
}

// MARK: - Append helpers

@MainActor
@Test("append(metric:) trims to the 60 s window on every append")
func appendMetricTrimsOldSamples() {
    let processService = ServerProcessService()
    let performanceService = ServerPerformanceService(samplingInterval: .milliseconds(50))
    let server = Server(
        id: "srv-1",
        name: "Test",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 1024,
        path: FileManager.default.temporaryDirectory.path,
        status: .offline,
    )

    let viewModel = DashboardViewModel(
        server: server,
        processService: processService,
        performanceService: performanceService,
    )

    let now = Date()
    // Seed an old sample and a fresh one.
    viewModel.append(metric: ServerMetrics(cpu: 1, memoryBytes: 10, timestamp: now.addingTimeInterval(-90)))
    #expect(viewModel.metrics.count == 1)

    // A newer append with a `now` timestamp should trim the -90 s
    // sample out via the window rule.
    viewModel.append(metric: ServerMetrics(cpu: 2, memoryBytes: 20, timestamp: now))
    #expect(viewModel.metrics.map(\.cpu) == [2])
}

@MainActor
@Test("appendTPS(value:timestamp:) accumulates within the window and drops old points")
func appendTPSTrimsOldPoints() {
    let processService = ServerProcessService()
    let performanceService = ServerPerformanceService(samplingInterval: .milliseconds(50))
    let server = Server(
        id: "srv-1",
        name: "Test",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 1024,
        path: FileManager.default.temporaryDirectory.path,
        status: .offline,
    )

    let viewModel = DashboardViewModel(
        server: server,
        processService: processService,
        performanceService: performanceService,
    )

    let now = Date()
    viewModel.appendTPS(value: 19, timestamp: now.addingTimeInterval(-90))
    viewModel.appendTPS(value: 20, timestamp: now)

    #expect(viewModel.tpsHistory.map(\.value) == [20])
}

// MARK: - Chart y-scale helpers

@Test("cpuYUpperBound floors at 100 and rounds observed max up to the next 20")
func cpuYUpperBoundRoundsUp() {
    // Empty metrics: default floor.
    #expect(CPUChartPanel.cpuYUpperBound(for: []) == 100)

    // A well-under-100 series still gets the 100 floor so the chart
    // doesn't render as a full-height line on a low idle.
    let idle = [ServerMetrics(cpu: 3.5, memoryBytes: 0, timestamp: Date())]
    #expect(CPUChartPanel.cpuYUpperBound(for: idle) == 100)

    // A multi-core saturating server (see `ServerMetrics.cpu`'s doc)
    // extends the ceiling to the next 20.
    let saturating = [ServerMetrics(cpu: 385, memoryBytes: 0, timestamp: Date())]
    #expect(CPUChartPanel.cpuYUpperBound(for: saturating) == 400)
}

@Test("memoryYUpperBound floors at 256 MB and rounds observed max up to the next 512 MB")
func memoryYUpperBoundRoundsUp() {
    #expect(MemoryChartPanel.memoryYUpperBound(for: []) == 512)

    // A small idle server sees the 256 MB floor rounded up to 512.
    let idle = [ServerMetrics(cpu: 0, memoryBytes: 128 * 1024 * 1024, timestamp: Date())]
    #expect(MemoryChartPanel.memoryYUpperBound(for: idle) == 512)

    // A ~2.3 GB server rounds up to the next 512 MB boundary (2560 MB).
    let busy = [ServerMetrics(cpu: 0, memoryBytes: UInt64(2300 * 1024 * 1024), timestamp: Date())]
    #expect(MemoryChartPanel.memoryYUpperBound(for: busy) == 2560)
}

// MARK: - TPS accent colour

@Test("tpsColor returns green >=18, yellow >=15, red below, and grey when nil")
func tpsColorThresholds() {
    #expect(tpsColor(for: nil) == Color(hex: 0xA1A1AA))
    #expect(tpsColor(for: 20) == Color(hex: 0x22C55E))
    #expect(tpsColor(for: 18) == Color(hex: 0x22C55E))
    #expect(tpsColor(for: 17) == Color(hex: 0xEAB308))
    #expect(tpsColor(for: 15) == Color(hex: 0xEAB308))
    #expect(tpsColor(for: 14.99) == Color(hex: 0xEF4444))
    #expect(tpsColor(for: 5) == Color(hex: 0xEF4444))
}
