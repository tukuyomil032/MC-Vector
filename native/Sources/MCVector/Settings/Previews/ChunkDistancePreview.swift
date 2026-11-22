// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A chunk map around one player: the chunks players see (view distance) and,
/// inside them, the chunks that keep running (simulation distance). Both
/// follow the fields as they are edited.
struct ChunkDistancePreview: View {
    let viewDistance: Int
    let simulationDistance: Int
    let viewLabel: String
    let simulationLabel: String

    @Environment(\.colorScheme) private var scheme

    private static let canvas = CGSize(width: 560, height: 210)
    private static let viewColor = Color(red: 0.35, green: 0.6, blue: 1)
    private static let simulationColor = Color(red: 0.35, green: 0.85, blue: 0.45)

    /// The map shows a little beyond the larger distance, at most 32 chunks out.
    private var radius: Int { min(max(viewDistance, simulationDistance, 2) + 1, 33) }

    var body: some View {
        SettingsPreviewCanvas(size: Self.canvas) {
            HStack(spacing: 28) {
                map
                    .frame(width: 190, height: 190)
                VStack(alignment: .leading, spacing: 14) {
                    legend(Self.viewColor, viewLabel, viewDistance)
                    legend(Self.simulationColor, simulationLabel, simulationDistance)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
        }
        .animation(Motion.standard, value: viewDistance)
        .animation(Motion.standard, value: simulationDistance)
    }

    private var map: some View {
        Canvas { context, size in
            let count = radius * 2 + 1
            let cell = size.width / CGFloat(count)
            let gap = cell > 6 ? 1.0 : 0
            for row in 0..<count {
                for column in 0..<count {
                    let distance = max(abs(row - radius), abs(column - radius))
                    let color: Color =
                        distance <= simulationDistance
                        ? Self.simulationColor.opacity(0.85)
                        : distance <= viewDistance ? Self.viewColor.opacity(0.55) : PreviewPalette.faint(scheme)
                    context.fill(
                        Path(
                            roundedRect: CGRect(
                                x: CGFloat(column) * cell + gap / 2, y: CGFloat(row) * cell + gap / 2,
                                width: cell - gap, height: cell - gap),
                            cornerRadius: min(cell * 0.2, 2)),
                        with: .color(color))
                }
            }
            // The player in the middle chunk.
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let dot = max(cell * 0.9, 7)
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - dot / 2, y: center.y - dot / 2, width: dot, height: dot)),
                with: .color(.white))
            context.stroke(
                Path(ellipseIn: CGRect(x: center.x - dot / 2, y: center.y - dot / 2, width: dot, height: dot)),
                with: .color(.black.opacity(0.5)), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func legend(_ color: Color, _ label: String, _ chunks: Int) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 14, height: 14)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.system(size: 14, weight: .semibold))
                Text(L10n.t("native.settings.preview.chunks", ["chunks": chunks, "blocks": chunks * 16]))
                    .font(.system(size: 12.5))
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText(value: Double(chunks)))
            }
        }
    }
}
