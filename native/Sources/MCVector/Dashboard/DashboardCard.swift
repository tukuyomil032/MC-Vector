// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A dashboard card: a rounded, hairline-bordered surface with an icon title.
struct DashboardCard<Content: View>: View {
    let title: String
    let symbol: String
    var tint: Color = .accentColor
    /// Shown at the trailing end of the title row (for example a hovered value).
    var accessory: AnyView?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                CardIcon(symbol: symbol, tint: tint)
                Text(title)
                    .font(.headline)
                Spacer(minLength: 8)
                if let accessory { accessory }
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(.separator, lineWidth: 1)
        }
    }
}

/// An SF Symbol on a softly tinted rounded square.
struct CardIcon: View {
    let symbol: String
    let tint: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 28, height: 28)
            .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

/// A small grey label above its value (server info fields).
struct LabeledField<Value: View>: View {
    let label: String
    @ViewBuilder var value: Value

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            value
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A big current value whose digits roll when it changes; `--` when absent.
struct AnimatedValue: View {
    let value: Double?
    let format: (Double) -> String
    let unit: String
    var tint: Color = .primary

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value.map(format) ?? "--")
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tint)
                .contentTransition(.numericText(value: value ?? 0))
            if value != nil, !unit.isEmpty {
                Text(unit)
                    .font(.system(size: 18, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .animation(Motion.value, value: value)
        .animation(Motion.standard, value: tint)
        .lineLimit(1)
    }
}
