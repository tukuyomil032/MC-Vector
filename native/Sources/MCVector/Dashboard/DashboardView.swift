// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// The Dashboard (React DashboardView): status and server info, the current
/// CPU, memory and TPS with rolling digits, and live 60-second CPU and memory
/// charts side by side that take the rest of the window.
struct DashboardView: View {
    let serverID: String
    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    @State private var size = CGSize(width: 1_000, height: 700)
    @State private var upperHeight: CGFloat = 300
    @State private var copied = false
    @State private var appeared = false

    private var server: ServerProfile? { app.servers.first { $0.id == serverID } }
    private var status: String { runtime.status(of: serverID) }
    private var snapshot: MetricSnapshot? { runtime.metrics[serverID] }

    /// Below this width the cards stack in one column and the page scrolls.
    private static let wideWidth: CGFloat = 760

    private static let spacing: CGFloat = 14
    private static let padding: CGFloat = 16

    /// The charts fill what the cards above leave of the visible height
    /// (never less than 220 pt; then the page scrolls).
    private var chartHeight: CGFloat {
        max(220, size.height - upperHeight - Self.spacing - Self.padding * 2)
    }

    var body: some View {
        // A ScrollView keeps the content inside the toolbar's safe area.
        ScrollView {
            VStack(spacing: Self.spacing) {
                Group {
                    if size.width >= Self.wideWidth {
                        VStack(spacing: Self.spacing) {
                            EqualColumns(spacing: Self.spacing) {
                                statusCard.staggeredAppear(index: 0, isVisible: appeared)
                                infoCard.staggeredAppear(index: 1, isVisible: appeared)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            EqualColumns(spacing: Self.spacing) { kpiCards }
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    } else {
                        VStack(spacing: Self.spacing) {
                            statusCard
                            infoCard
                            kpiCards
                        }
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { upperHeight = $0 }

                if size.width >= Self.wideWidth {
                    EqualColumns(spacing: Self.spacing) { chartCards }
                        .frame(height: chartHeight)
                } else {
                    VStack(spacing: Self.spacing) { chartCards.frame(height: 240) }
                }
            }
            .padding(Self.padding)
        }
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
        .onAppear { appeared = true }
        .task { await runtime.refreshMetrics(serverID) }
    }

    // MARK: Overview

    private var statusCard: some View {
        DashboardCard(title: L10n.t("dashboard.stats.status"), symbol: "waveform.path.ecg") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(ServerStatusStyle.color(status))
                        .frame(width: 10, height: 10)
                    Text(L10n.t(ServerStatusStyle.labelKey(status)))
                        .font(.title.weight(.bold))
                        .contentTransition(.opacity)
                }
                .animation(Motion.standard, value: status)
                // Ticks every second from the last snapshot (React keeps the same clock).
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    HStack(spacing: 6) {
                        Text(L10n.t("dashboard.stats.uptime"))
                            .foregroundStyle(.secondary)
                        Text(uptime(at: context.date))
                            .monospacedDigit()
                            .fontWeight(.medium)
                            .contentTransition(.numericText())
                    }
                    .font(.callout)
                }
            }
        }
    }

    private var infoCard: some View {
        DashboardCard(title: L10n.t("dashboard.stats.serverInfo"), symbol: "server.rack") {
            Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 14) {
                GridRow {
                    LabeledField(label: L10n.t("dashboard.stats.software")) {
                        Text(server.map { "\($0.software) \($0.version)" } ?? "–")
                    }
                    LabeledField(label: L10n.t("dashboard.stats.address")) {
                        HStack(spacing: 6) {
                            Text(address)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                            Button {
                                copyAddress()
                            } label: {
                                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                    .contentTransition(.symbolEffect(.replace))
                            }
                            .buttonStyle(.borderless)
                            .help(L10n.t("dashboard.stats.copyAddress"))
                        }
                    }
                }
                GridRow {
                    LabeledField(label: L10n.t("dashboard.stats.allocatedMemory")) {
                        Text(allocatedMemory)
                    }
                    LabeledField(label: L10n.t("dashboard.stats.javaRuntime")) {
                        Text(server?.javaPath.flatMap { $0.isEmpty ? nil : $0 } ?? L10n.t("serverSettings.javaSystemDefault"))
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            }
        }
    }

    private var address: String { "localhost:\(server?.port ?? 25_565)" }

    /// "4 GB" when the allocation is a whole number of gigabytes, else megabytes.
    private var allocatedMemory: String {
        guard let megabytes = server?.memoryMb else { return "–" }
        if megabytes >= 1_024, megabytes % 1_024 == 0 { return "\(megabytes / 1_024) GB" }
        return "\(megabytes) \(L10n.t("dashboard.units.megabytes"))"
    }

    private func copyAddress() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(address, forType: .string)
        withAnimation { copied = true }
        Task {
            try? await Task.sleep(for: .seconds(1.9))
            withAnimation { copied = false }
        }
    }

    /// `hh:mm:ss` since the process started, or `--:--:--` without a snapshot.
    private func uptime(at date: Date) -> String {
        guard status == "online", let snapshot, let received = runtime.metricsReceivedAt[serverID] else {
            return "--:--:--"
        }
        let seconds = Int(snapshot.elapsedMs / 1_000) + max(0, Int(date.timeIntervalSince(received)))
        return String(format: "%02d:%02d:%02d", seconds / 3_600, seconds / 60 % 60, seconds % 60)
    }

    // MARK: Current values

    @ViewBuilder
    private var kpiCards: some View {
        let latest = status == "online" ? snapshot?.resource.last : nil
        let tps = status == "online" ? snapshot?.tps.last.map { Double($0.tps) } : nil
        DashboardCard(title: L10n.t("dashboard.stats.currentCpu"), symbol: "cpu") {
            AnimatedValue(value: latest.map { Double($0.cpu) }, format: { String(format: "%.1f", $0) }, unit: "%")
        }
        .staggeredAppear(index: 2, isVisible: appeared)
        DashboardCard(title: L10n.t("dashboard.stats.currentMemory"), symbol: "memorychip") {
            AnimatedValue(
                value: latest.map { Double($0.memoryBytes / 1_048_576) },
                format: { String(Int($0)) },
                unit: L10n.t("dashboard.units.megabytes")
            )
        }
        .staggeredAppear(index: 3, isVisible: appeared)
        DashboardCard(
            title: L10n.t("dashboard.stats.currentTps"),
            symbol: "gauge.with.needle",
            tint: tps.map(TpsTone.color) ?? .accentColor
        ) {
            AnimatedValue(
                value: tps,
                format: { String(format: "%.2f", $0) },
                unit: "",
                tint: tps.map(TpsTone.color) ?? .primary
            )
        }
        .staggeredAppear(index: 4, isVisible: appeared)
    }

    // MARK: Charts

    @ViewBuilder
    private var chartCards: some View {
        let online = status == "online"
        let resource = online ? snapshot?.resource ?? [] : []
        let seconds = snapshot.map { Double($0.elapsedMs) / 1_000 } ?? 0
        let received = online ? runtime.metricsReceivedAt[serverID] : nil
        let megabytes = L10n.t("dashboard.units.megabytes")
        MetricChart(
            title: L10n.t("dashboard.charts.cpuLast60s"),
            symbol: "cpu",
            emptyText: L10n.t("dashboard.charts.metricsNoData"),
            points: resource.map { (Double($0.elapsedMs) / 1_000, Double($0.cpu)) },
            snapshotSeconds: seconds,
            receivedAt: received,
            yDomain: 0...100,
            axisLabel: { "\(Int($0))%" },
            valueLabel: { String(format: "%.1f%%", $0) }
        )
        .staggeredAppear(index: 5, isVisible: appeared)
        MetricChart(
            title: L10n.t("dashboard.charts.memoryLast60s"),
            symbol: "memorychip",
            emptyText: L10n.t("dashboard.charts.metricsNoData"),
            points: resource.map { (Double($0.elapsedMs) / 1_000, Double($0.memoryBytes) / 1_048_576) },
            snapshotSeconds: seconds,
            receivedAt: received,
            yDomain: nil,
            axisLabel: { $0.formatted(.number.precision(.fractionLength(0))) },
            valueLabel: { "\(Int($0)) \(megabytes)" },
            minimumTop: 64
        )
        .staggeredAppear(index: 6, isVisible: appeared)
    }
}

/// React's TPS tones: good at 18+, fair at 15+, poor below.
enum TpsTone {
    static func color(_ tps: Float) -> Color {
        color(Double(tps))
    }

    static func color(_ tps: Double) -> Color {
        if tps >= 18 { return .green }
        if tps >= 15 { return .orange }
        return .red
    }
}
