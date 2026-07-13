import Charts
import SwiftUI

// Swift Charts panels + palette split off from `DashboardView.swift`
// purely so that file stays under SwiftLint's 400-line cap. Every
// symbol here has no reuse story outside `DashboardView` today; if a
// second consumer appears, promote to a shared location then.

// MARK: - Chart panels

struct CPUChartPanel: View {
    let metrics: [ServerMetrics]

    var body: some View {
        ChartPanel(title: "CPU (last 60s)") {
            Chart(self.metrics) { sample in
                AreaMark(
                    x: .value("Time", sample.timestamp),
                    y: .value("CPU", sample.cpu),
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color.cpuChartAccent.opacity(0.7), Color.cpuChartAccent.opacity(0.05)],
                        startPoint: .top,
                        endPoint: .bottom,
                    ),
                )
                LineMark(
                    x: .value("Time", sample.timestamp),
                    y: .value("CPU", sample.cpu),
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Color.cpuChartAccent)
            }
            .chartYScale(domain: 0 ... Self.cpuYUpperBound(for: self.metrics))
            .chartXAxis { dashboardTimeAxisMarks() }
        }
    }

    /// Dynamic ceiling for the CPU y-axis. `ServerMetrics.cpu` can
    /// exceed 100 on a multi-core saturating JVM (see that field's doc
    /// for the deliberate no-clamp decision), so the scale grows to fit
    /// the observed max while still guaranteeing at least `0...100` so
    /// a mostly-idle server doesn't render as a jittery line at the top
    /// of a `0...5` scale. Rounded up to the next 20 so axis marks land
    /// on visually clean numbers rather than the exact peak.
    nonisolated static func cpuYUpperBound(for metrics: [ServerMetrics]) -> Double {
        let observedMax = metrics.map(\.cpu).max() ?? 0
        let ceiling = max(100, observedMax)
        return (ceiling / 20).rounded(.up) * 20
    }
}

struct MemoryChartPanel: View {
    let metrics: [ServerMetrics]

    var body: some View {
        ChartPanel(title: "Memory (last 60s)") {
            Chart(self.metrics) { sample in
                AreaMark(
                    x: .value("Time", sample.timestamp),
                    y: .value("Memory", ServerMetrics.memoryMegabytes(from: sample.memoryBytes)),
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color.memoryChartAccent.opacity(0.7), Color.memoryChartAccent.opacity(0.05)],
                        startPoint: .top,
                        endPoint: .bottom,
                    ),
                )
                LineMark(
                    x: .value("Time", sample.timestamp),
                    y: .value("Memory", ServerMetrics.memoryMegabytes(from: sample.memoryBytes)),
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(Color.memoryChartAccent)
            }
            .chartYScale(domain: 0 ... Self.memoryYUpperBound(for: self.metrics))
            .chartXAxis { dashboardTimeAxisMarks() }
        }
    }

    /// Dynamic memory ceiling in MB. Rounded up to the next 512 MB so
    /// the y-axis lands on friendly numbers rather than a jagged
    /// observed peak, with a `256` floor so a very small idle server
    /// still renders on a stable scale rather than one that keeps
    /// snapping.
    nonisolated static func memoryYUpperBound(for metrics: [ServerMetrics]) -> Double {
        let observedMax = metrics
            .map { ServerMetrics.memoryMegabytes(from: $0.memoryBytes) }
            .max() ?? 0
        let ceiling = max(256, observedMax)
        return (ceiling / 512).rounded(.up) * 512
    }
}

struct TPSChartPanel: View {
    let points: [TPSPoint]

    var body: some View {
        ChartPanel(title: "TPS (last 60s)") {
            if self.points.isEmpty {
                ContentUnavailableView(
                    "No TPS data",
                    systemImage: "waveform.path.ecg",
                    description: Text("TPS data will appear once the server logs a TPS reading."),
                )
                .frame(maxWidth: .infinity, minHeight: 180)
            } else {
                Chart(self.points) { point in
                    AreaMark(
                        x: .value("Time", point.timestamp),
                        y: .value("TPS", point.value),
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.tpsChartAccent.opacity(0.7), Color.tpsChartAccent.opacity(0.05)],
                            startPoint: .top,
                            endPoint: .bottom,
                        ),
                    )
                    LineMark(
                        x: .value("Time", point.timestamp),
                        y: .value("TPS", point.value),
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(Color.tpsChartAccent)
                }
                .chartYScale(domain: 0 ... 22)
                .chartXAxis { dashboardTimeAxisMarks() }
            }
        }
    }
}

/// Shared chrome for the three chart panels: title + fixed-height
/// frame + rounded card background. Keeping this as its own view lets
/// each chart panel focus solely on its data expression above.
struct ChartPanel<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(self.title)
                .font(.headline)
            self.content()
                .frame(height: 200)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.dashboardCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Shared x-axis mark builder: minute:second labels in caption size, so
/// the three panels stay visually aligned without repeating the block.
@AxisContentBuilder
func dashboardTimeAxisMarks() -> some AxisContent {
    AxisMarks(values: .automatic) { _ in
        AxisGridLine()
        AxisTick()
        AxisValueLabel(format: .dateTime.minute().second())
            .foregroundStyle(.secondary)
            .font(.caption2)
    }
}

// MARK: - Colour mapping

/// Colour tokens for the six documented server statuses, matching the
/// Tauri shell so a user switching between the two doesn't see the
/// same status in a different colour. `internal` so
/// `DashboardViewModelTests` can assert the mapping directly.
extension ServerStatus {
    var displayColor: Color {
        switch self {
        case .online: Color(hex: 0x10B981)
        case .offline: Color(hex: 0xEF4444)
        case .starting: Color(hex: 0xEAB308)
        case .stopping: Color(hex: 0xF97316)
        case .restarting: Color(hex: 0x3B82F6)
        case .crashed: Color(hex: 0xF43F5E)
        }
    }
}

/// TPS to accent colour, matching the Tauri `getTpsColor`:
/// ≥18 green, ≥15 yellow, <15 red, `nil` grey.
func tpsColor(for tps: Double?) -> Color {
    guard let tps else { return Color(hex: 0xA1A1AA) }
    if tps >= 18 {
        return Color(hex: 0x22C55E)
    }
    if tps >= 15 {
        return Color(hex: 0xEAB308)
    }
    return Color(hex: 0xEF4444)
}

extension Color {
    /// Compact hex literal init used by the Dashboard palette. Only the
    /// low 24 bits are consumed (RGB). Kept close to its only caller in
    /// this file rather than promoted to `Sources/Core/` -- if a second
    /// caller shows up, migrate it then.
    init(hex: UInt32) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self = Color(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }

    /// Card fill token shared by the Dashboard's header/KPI/chart
    /// panels. macOS-only, so `NSColor.controlBackgroundColor` is fine
    /// as the underlying source of truth -- follows the system's
    /// light/dark automatically without a custom asset catalogue.
    static var dashboardCardBackground: Color {
        Color(nsColor: .controlBackgroundColor)
    }

    static var cpuChartAccent: Color {
        Color(hex: 0x38BDF8)
    }

    static var memoryChartAccent: Color {
        Color(hex: 0x34D399)
    }

    static var tpsChartAccent: Color {
        Color(hex: 0x22C55E)
    }
}
