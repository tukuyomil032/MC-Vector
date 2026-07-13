import SwiftUI

/// Live dashboard for a single running server (task 5-4). Renders three
/// stacked sections against `DashboardViewModel`'s `@Observable` state:
///
/// 1. A header card with the server name, software + version, and a
///    coloured status pill.
/// 2. A 6-tile `LazyVGrid` of KPI cards -- Status / Current TPS /
///    Current CPU / Current Memory / Software / Uptime -- with the
///    Uptime tile driven by a `TimelineView(.periodic:by:)` so it
///    re-renders once per second without threading a timer into the
///    view model.
/// 3. Three Swift Charts panels defined in
///    `DashboardChartPanels.swift`: CPU (cyan), Memory (green), TPS
///    (green, empty-state fallback via `ContentUnavailableView`).
///
/// **Chart y-scales.** CPU and Memory are dynamic (`0...max(observed,
/// baseline)`) rather than fixed. See `ServerMetrics.cpu`'s doc for the
/// multi-core rationale that specifically forbids a hard `0...100` cap.
/// TPS is fixed to `0...22` -- Minecraft's tick target is 20 with a
/// small headroom for the odd log line reporting >20; anything else is
/// a bug in the parser.
///
/// **Colour tokens.** The six status colours (`online`, `offline`,
/// `starting`, `stopping`, `restarting`, `crashed`) are pinned to the
/// same hex values the Tauri Classic shell uses -- see
/// `src/renderer/components/DashboardView.tsx`'s `STATUS_COLORS` map --
/// so a user switching between shells doesn't see the same status in a
/// different colour. Exposed as `ServerStatus.displayColor` (in this
/// file, `internal`) so `DashboardViewModelTests` can unit-test the
/// mapping directly.
///
/// **Card styling — no Liquid Glass.** Per the Phase 3-A spike results
/// (`spec/phase3a-spike-results.md`), `.glassEffect()` is reserved for
/// functional overlay layers; solid `.regularMaterial` on data-dense
/// cards reads cleaner and avoids competing with the background.
struct DashboardView: View {
    let server: Server
    @State private var viewModel: DashboardViewModel

    init(
        server: Server,
        processService: ServerProcessService,
        performanceService: ServerPerformanceService,
    ) {
        self.server = server
        self._viewModel = State(
            initialValue: DashboardViewModel(
                server: server,
                processService: processService,
                performanceService: performanceService,
            ),
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                self.headerCard
                self.kpiGrid
                self.chartsSection
            }
            .padding(20)
        }
        .navigationTitle("Dashboard — \(self.server.name)")
    }

    // MARK: - Header

    private var headerCard: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(self.server.name)
                    .font(.title2.weight(.semibold))
                Text("\(self.server.software) \(self.server.version)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            self.statusPill(for: self.viewModel.currentStatus)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.dashboardCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: - KPI Grid

    private var kpiGrid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12,
        ) {
            KPICard(
                title: "Status",
                value: self.viewModel.currentStatus.rawValue.capitalized,
                meta: "Software: \(self.server.software)",
                accentColor: self.viewModel.currentStatus.displayColor,
            )
            KPICard(
                title: "Current TPS",
                value: self.viewModel.currentTPS.map { String(format: "%.2f", $0) } ?? "--",
                meta: nil,
                accentColor: tpsColor(for: self.viewModel.currentTPS),
            )
            KPICard(
                title: "Current CPU",
                value: self.viewModel.currentCPU.map { String(format: "%.1f%%", $0) } ?? "--",
                meta: nil,
                accentColor: nil,
            )
            KPICard(
                title: "Current Memory",
                value: self.viewModel.currentMemoryBytes
                    .map { "\(Int(ServerMetrics.memoryMegabytes(from: $0).rounded())) MB" } ?? "--",
                meta: nil,
                accentColor: nil,
            )
            KPICard(
                title: "Software",
                value: self.server.software,
                meta: self.server.version,
                accentColor: nil,
            )
            self.uptimeCard
        }
    }

    /// The `TimelineView(.periodic(from:by:))` re-invokes its builder on
    /// every scheduled tick, giving us a per-second re-read of
    /// `viewModel.uptime` without any timer state living in the view
    /// model. The view model itself is untouched by the tick -- only
    /// the computed `uptime` getter is called again, which is what
    /// keeps the KPI monotonically advancing.
    private var uptimeCard: some View {
        TimelineView(.periodic(from: .now, by: 1.0)) { _ in
            KPICard(
                title: "Uptime",
                value: self.viewModel.uptime.map(formatUptime) ?? "--:--:--",
                meta: nil,
                accentColor: nil,
            )
        }
    }

    // MARK: - Charts

    private var chartsSection: some View {
        VStack(spacing: 16) {
            CPUChartPanel(metrics: self.viewModel.metrics)
            MemoryChartPanel(metrics: self.viewModel.metrics)
            TPSChartPanel(points: self.viewModel.tpsHistory)
        }
    }

    // MARK: - Status pill

    private func statusPill(for status: ServerStatus) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(status.displayColor)
                .frame(width: 8, height: 8)
            Text(status.rawValue.capitalized)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(status.displayColor)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(status.displayColor.opacity(0.15), in: Capsule())
    }
}

// MARK: - KPI card

/// Reusable card used by every tile in `DashboardView.kpiGrid`. Kept
/// inside this file (not a separate type in `Sources/Core/`) because
/// it has no reuse story beyond the Dashboard today; if a second
/// screen wants the same look, promote it then.
private struct KPICard: View {
    let title: String
    let value: String
    let meta: String?
    let accentColor: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(self.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(self.value)
                .font(.title3.weight(.semibold))
                .foregroundStyle(self.accentColor ?? .primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let meta = self.meta {
                Text(meta)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text(" ")
                    .font(.caption2)
                    .hidden()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.dashboardCardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// Chart panels, `dashboardTimeAxisMarks()`, `ServerStatus.displayColor`,
// `tpsColor`, and the `Color` palette live in
// `DashboardChartPanels.swift` -- split off purely so this file stays
// under SwiftLint's 400-line cap.
