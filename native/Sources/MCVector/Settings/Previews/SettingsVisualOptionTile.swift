// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// One selectable option drawn as a small picture with its name under it
/// (Snapzy's visual option tile). The ring sits just outside the picture with
/// a hairline gap, and the name turns bold when picked, so the choice reads
/// from the shape, not only from color.
struct SettingsVisualOptionTile<Thumbnail: View>: View {
    let title: String
    let isSelected: Bool
    var size = CGSize(width: 84, height: 58)
    let action: () -> Void
    @ViewBuilder let thumbnail: () -> Thumbnail

    @Environment(\.colorScheme) private var colorScheme
    @State private var isHovering = false

    private static var ringInset: CGFloat { 3.5 }
    private static var radius: CGFloat { 8 }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                thumbnail()
                    .frame(width: size.width, height: size.height)
                    .clipShape(RoundedRectangle(cornerRadius: Self.radius, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: Self.radius, style: .continuous)
                            .strokeBorder(hairline, lineWidth: 0.5)
                    }
                    .shadow(color: .black.opacity(0.18), radius: 2, y: 1)
                    .brightness(isHovering && !isSelected ? 0.04 : 0)
                    .padding(Self.ringInset)
                    .overlay {
                        RoundedRectangle(cornerRadius: Self.radius + Self.ringInset, style: .continuous)
                            .strokeBorder(Color.accentColor, lineWidth: 2.5)
                            .opacity(isSelected ? 1 : 0)
                    }
                Text(title)
                    .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? .primary : .secondary)
                    .lineLimit(1)
                    // Names may be wider than the picture.
                    .fixedSize()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(Motion.snappy, value: isSelected)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var hairline: Color {
        colorScheme == .dark ? .white.opacity(0.1) : .black.opacity(0.08)
    }
}

/// A row of visual option tiles bound to a selection.
struct SettingsVisualPicker<Value: Hashable, Thumbnail: View>: View {
    let options: [Value]
    @Binding var selection: Value
    var size = CGSize(width: 84, height: 58)
    let title: (Value) -> String
    @ViewBuilder let thumbnail: (Value) -> Thumbnail

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ForEach(options, id: \.self) { option in
                SettingsVisualOptionTile(title: title(option), isSelected: selection == option, size: size) {
                    withAnimation(Motion.snappy) { selection = option }
                } thumbnail: {
                    thumbnail(option)
                }
            }
        }
    }
}
