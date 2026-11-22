// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// How much of this Mac's memory the server may take: a bar of the whole
/// memory with the server's share filled in. Past three quarters the share
/// turns orange, since macOS and other apps need the rest.
struct MemoryBar: View {
    let memoryMB: UInt64

    private static let totalMB = Double(ProcessInfo.processInfo.physicalMemory) / 1_048_576

    private var fraction: Double { min(Double(memoryMB) / max(Self.totalMB, 1), 1) }
    private var isTight: Bool { fraction > 0.75 }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(.quaternary)
                    Capsule()
                        .fill((isTight ? Color.orange : Color.accentColor).gradient)
                        .frame(width: max(proxy.size.width * fraction, 8))
                }
            }
            .frame(height: 8)
            HStack {
                Text(L10n.t("native.settings.preview.memoryServer", ["size": gigabytes(Double(memoryMB))]))
                    .contentTransition(.numericText(value: Double(memoryMB)))
                Spacer()
                Text(L10n.t("native.settings.preview.memoryMac", ["size": gigabytes(Self.totalMB)]))
            }
            .font(.caption)
            .foregroundStyle(isTight ? AnyShapeStyle(.orange) : AnyShapeStyle(.secondary))
        }
        .animation(Motion.standard, value: memoryMB)
        .accessibilityHidden(true)
    }

    private func gigabytes(_ megabytes: Double) -> String {
        (megabytes / 1024).formatted(
            .number.precision(.fractionLength(0...1)).locale(Locale(identifier: L10n.language)))
    }
}
