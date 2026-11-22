// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A small Minecraft landscape (sky, grass, dirt) that game mode and
/// difficulty tiles draw their sign on.
private struct LandscapeBackdrop: View {
    var dusk = false

    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(
                colors: dusk
                    ? [Color(red: 0.35, green: 0.12, blue: 0.2), Color(red: 0.75, green: 0.32, blue: 0.25)]
                    : [Color(red: 0.36, green: 0.6, blue: 0.95), Color(red: 0.62, green: 0.8, blue: 1)],
                startPoint: .top, endPoint: .bottom)
            Rectangle().fill(Color(red: 0.36, green: 0.62, blue: 0.26)).frame(height: 7)
            Rectangle().fill(Color(red: 0.52, green: 0.37, blue: 0.24)).frame(height: 12)
        }
    }
}

/// The picture of a `gamemode` value.
struct GameModeThumbnail: View {
    let mode: String

    var body: some View {
        ZStack {
            LandscapeBackdrop()
            switch mode {
            case "creative": hotbar
            case "adventure": sign("map.fill", Color(red: 0.95, green: 0.78, blue: 0.35))
            case "spectator":
                Color.black.opacity(0.45)
                sign("eye.fill", .white)
            default: hearts
            }
        }
    }

    /// Hearts and food over the ground, like the survival HUD.
    private var hearts: some View {
        HStack(spacing: 2) {
            ForEach(0..<3, id: \.self) { _ in
                Image(systemName: "heart.fill").foregroundStyle(Color(red: 0.9, green: 0.15, blue: 0.15))
            }
        }
        .font(.system(size: 10, weight: .bold))
        .shadow(color: .black.opacity(0.4), radius: 0, x: 1, y: 1)
        .offset(y: -6)
    }

    /// A hotbar full of colorful blocks.
    private var hotbar: some View {
        HStack(spacing: 1.5) {
            ForEach([Color.red, .orange, .yellow, .green, .blue, .purple], id: \.self) { color in
                RoundedRectangle(cornerRadius: 1).fill(color.opacity(0.9)).frame(width: 8, height: 8)
            }
        }
        .padding(2)
        .background(Color.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 2))
        .offset(y: -6)
    }

    private func sign(_ symbol: String, _ color: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(color)
            .shadow(color: .black.opacity(0.4), radius: 0, x: 1, y: 1)
            .offset(y: -6)
    }
}

/// The picture of a `difficulty` value: more creepers the harder it gets,
/// and a red sky at hard.
struct DifficultyThumbnail: View {
    let difficulty: String

    private var creepers: Int {
        switch difficulty {
        case "easy": 1
        case "normal": 2
        case "hard": 3
        default: 0
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            LandscapeBackdrop(dusk: difficulty == "hard")
            if creepers == 0 {
                Image(systemName: "sun.max.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color(red: 1, green: 0.85, blue: 0.3))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(6)
            } else {
                HStack(alignment: .bottom, spacing: 5) {
                    ForEach(0..<creepers, id: \.self) { _ in CreeperFigure() }
                }
                .padding(.bottom, 19)
            }
        }
    }
}

/// A creeper in a few blocks: a green body with its face.
private struct CreeperFigure: View {
    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Rectangle().fill(Color(red: 0.36, green: 0.72, blue: 0.3))
                Canvas { context, size in
                    let pixel = size.width / 4
                    let face = [(0, 1), (3, 1), (1, 2), (2, 2), (1, 3), (2, 3)]
                    for (column, row) in face {
                        context.fill(
                            Path(
                                CGRect(
                                    x: CGFloat(column) * pixel, y: CGFloat(row) * pixel - pixel / 2, width: pixel,
                                    height: pixel)),
                            with: .color(.black.opacity(0.75)))
                    }
                }
            }
            .frame(width: 10, height: 10)
            Rectangle().fill(Color(red: 0.3, green: 0.6, blue: 0.26)).frame(width: 6, height: 12)
        }
    }
}
