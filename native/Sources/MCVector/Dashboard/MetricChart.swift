// SPDX-License-Identifier: GPL-3.0-or-later

import Charts
import SwiftUI

/// A live 60-second line chart. The x axis (seconds since startup) moves every
/// frame from the newest snapshot, so the line flows instead of jumping every
/// two seconds; the last value is carried to "now" until the next point arrives.
struct MetricChart: View {
    let title: String
    let symbol: String
    let emptyText: String
    /// (seconds since startup, value)
    let points: [(Double, Double)]
    /// Seconds since startup at the newest snapshot, and when it arrived.
    let snapshotSeconds: Double
    let receivedAt: Date?
    /// A fixed y range, or nil to fit the values.
    let yDomain: ClosedRange<Double>?
    let axisLabel: (Double) -> String
    let valueLabel: (Double) -> String
    var color: Color = .accentColor
    /// The smallest top of a fitted y axis.
    var minimumTop: Double = 1
    @State private var hoveredX: Double?

    var body: some View {
        DashboardCard(title: title, symbol: symbol, tint: color, accessory: hoverAccessory) {
            if points.isEmpty {
                Text(emptyText)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                    chart(now: now(at: context.date))
                }
                .frame(minHeight: 0, maxHeight: .infinity)
            }
        }
    }

    /// The live right edge. It stops a few seconds past the last snapshot, so a
    /// stopped feed does not keep scrolling into emptiness.
    private func now(at date: Date) -> Double {
        guard let receivedAt else { return snapshotSeconds }
        return snapshotSeconds + min(max(0, date.timeIntervalSince(receivedAt)), 4)
    }

    private var fittedDomain: ClosedRange<Double> {
        if let yDomain { return yDomain }
        let top = (points.map(\.1).max() ?? 1) * 1.2
        // A floor keeps tiny values (a stand-in process) from crowding the labels.
        return 0...Self.niceCeiling(max(top, minimumTop))
    }

    /// Rounds up to 1, 2 or 5 times a power of ten (1,500 → 2,000; 340 → 500).
    static func niceCeiling(_ value: Double) -> Double {
        let magnitude = pow(10, floor(log10(value)))
        for step in [1.0, 2.0, 2.5, 5.0, 10.0] where step * magnitude >= value {
            return step * magnitude
        }
        return 10 * magnitude
    }

    private var hoveredPoint: (Double, Double)? {
        guard let hoveredX else { return nil }
        return points.min { abs($0.0 - hoveredX) < abs($1.0 - hoveredX) }
    }

    private var hoverAccessory: AnyView? {
        guard let hoveredPoint else { return nil }
        return AnyView(
            Text("\(Int(hoveredPoint.0))s · \(valueLabel(hoveredPoint.1))")
                .font(.callout)
                .monospacedDigit()
                .foregroundStyle(.secondary)
        )
    }

    private func chart(now: Double) -> some View {
        let start = max(0, now - 60)
        // Carry the last value to the live edge so the line always reaches it.
        let series = points + (points.last.map { [(now, $0.1)] } ?? [])
        return Chart {
            ForEach(series.indices, id: \.self) { index in
                AreaMark(x: .value("s", series[index].0), y: .value("v", series[index].1))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [color.opacity(0.28), color.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                LineMark(x: .value("s", series[index].0), y: .value("v", series[index].1))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
            if let hoveredPoint {
                RuleMark(x: .value("s", hoveredPoint.0))
                    .foregroundStyle(.secondary.opacity(0.6))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                PointMark(x: .value("s", hoveredPoint.0), y: .value("v", hoveredPoint.1))
                    .foregroundStyle(color)
                    .symbolSize(50)
            }
        }
        .chartXScale(domain: start...max(now, start + 1))
        .chartYScale(domain: fittedDomain)
        .animation(Motion.standard, value: fittedDomain)
        .chartXAxis {
            AxisMarks(values: .stride(by: 10)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 3]))
                AxisValueLabel {
                    if let seconds = value.as(Double.self) { Text("\(Int(seconds))s") }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 5)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 3]))
                AxisValueLabel {
                    // A fixed label width keeps the plot areas of side-by-side charts equal.
                    if let number = value.as(Double.self) {
                        Text(axisLabel(number))
                            .frame(minWidth: 40, alignment: .trailing)
                    }
                }
            }
        }
        .chartPlotStyle { $0.clipped() }
        .chartOverlay { proxy in
            Rectangle()
                .fill(.clear)
                .contentShape(Rectangle())
                .onContinuousHover { phase in
                    switch phase {
                    case let .active(location):
                        hoveredX = proxy.value(atX: location.x, as: Double.self)
                    case .ended:
                        hoveredX = nil
                    }
                }
        }
    }
}
