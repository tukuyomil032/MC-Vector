// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// The server as Minecraft's multiplayer screen lists it: the pack icon, the
/// name, the MOTD with its `§` colors, the player count and the signal bars.
/// It follows `motd` and `max-players` as they are edited.
struct ServerListPreview: View {
    let name: String
    let motd: String
    let maxPlayers: String

    private static let canvas = CGSize(width: 600, height: 128)

    var body: some View {
        SettingsPreviewCanvas(size: Self.canvas) {
            ZStack {
                DirtBackdrop()
                entry
                    .padding(.horizontal, 40)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var entry: some View {
        HStack(alignment: .top, spacing: 10) {
            GrassBlockIcon()
                .frame(width: 64, height: 64)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(name)
                        .foregroundStyle(.white)
                    Spacer(minLength: 8)
                    Text(verbatim: "0/\(Int(maxPlayers) ?? 20)")
                        .foregroundStyle(Color(white: 0.67))
                        .contentTransition(.numericText(value: Double(Int(maxPlayers) ?? 20)))
                    SignalBars()
                }
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    line.lineLimit(1)
                }
            }
            .font(.system(size: 15, weight: .medium, design: .monospaced))
            .shadow(color: .black.opacity(0.6), radius: 0, x: 1.5, y: 1.5)
        }
        .padding(4)
        .overlay { Rectangle().strokeBorder(Color(white: 0.55), lineWidth: 2) }
        .background(Color.black.opacity(0.5))
        .animation(Motion.snappy, value: maxPlayers)
    }

    /// At most the two lines the game shows; the default color is gray.
    private var lines: [Text] {
        MinecraftText.lines(motd.isEmpty ? "A Minecraft Server" : motd).prefix(2).map { runs in
            runs.reduce(Text("")) { result, run in
                var text = Text(run.text).foregroundStyle(Color(hex: run.color ?? 0xAAAAAA))
                if run.bold { text = text.bold() }
                if run.italic { text = text.italic() }
                if run.underline { text = text.underline() }
                if run.strikethrough { text = text.strikethrough() }
                return result + text
            }
        }
    }
}

/// The darkened dirt texture behind Minecraft's menus, as 16 px blocks of
/// slightly varied browns.
private struct DirtBackdrop: View {
    var body: some View {
        Canvas { context, size in
            let block: CGFloat = 8
            var seed: UInt32 = 7
            for row in 0..<Int(size.height / block) + 1 {
                for column in 0..<Int(size.width / block) + 1 {
                    seed = seed &* 1_103_515_245 &+ 12345
                    let shade = Double((seed >> 16) % 5) / 100
                    context.fill(
                        Path(CGRect(x: CGFloat(column) * block, y: CGFloat(row) * block, width: block, height: block)),
                        with: .color(Color(red: 0.17 + shade, green: 0.12 + shade, blue: 0.09 + shade * 0.6)))
                }
            }
        }
    }
}

/// The default pack icon: a grass block drawn in 8×8 pixels.
private struct GrassBlockIcon: View {
    var body: some View {
        Canvas { context, size in
            let pixel = size.width / 8
            var seed: UInt32 = 3
            for row in 0..<8 {
                for column in 0..<8 {
                    seed = seed &* 1_103_515_245 &+ 12345
                    let jitter = Double((seed >> 16) % 4) / 30
                    let grassDepth = row < 2 || (row == 2 && (seed >> 20) % 2 == 0)
                    let color =
                        grassDepth
                        ? Color(red: 0.33 + jitter, green: 0.6 + jitter, blue: 0.24)
                        : Color(red: 0.5 + jitter, green: 0.35 + jitter, blue: 0.22)
                    context.fill(
                        Path(CGRect(x: CGFloat(column) * pixel, y: CGFloat(row) * pixel, width: pixel, height: pixel)),
                        with: .color(color))
                }
            }
        }
    }
}

/// Five green bars of rising height: full signal.
private struct SignalBars: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: 1.5) {
            ForEach(1...5, id: \.self) { level in
                Rectangle()
                    .fill(Color(red: 0.33, green: 1, blue: 0.33))
                    .frame(width: 3, height: CGFloat(level) * 2.6)
            }
        }
        .padding(.leading, 6)
    }
}

extension Color {
    /// A color from 0xRRGGBB.
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}
