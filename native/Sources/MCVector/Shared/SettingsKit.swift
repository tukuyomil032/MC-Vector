// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorEditorKit
import SwiftUI

/// The glyph color of a settings icon: one hue, washed toward white at the
/// top and settling into the full color at the bottom, so every page gets its
/// own color while the icons still read as one family (Snapzy's tiles).
struct SettingsTint: Equatable, Sendable {
    /// Hue in degrees.
    var hue: Double
    var saturation: Double = 0.6

    static let graphite = SettingsTint(hue: 225, saturation: 0.07)
    static let blue = SettingsTint(hue: 214)
    static let indigo = SettingsTint(hue: 238)
    static let purple = SettingsTint(hue: 275)
    static let pink = SettingsTint(hue: 330)
    static let red = SettingsTint(hue: 2)
    static let orange = SettingsTint(hue: 28)
    static let yellow = SettingsTint(hue: 46)
    static let green = SettingsTint(hue: 140)
    static let teal = SettingsTint(hue: 178)
    static let brown = SettingsTint(hue: 30, saturation: 0.35)

    var gradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(hue: Self.unit(hue - 3), saturation: saturation * 0.55, brightness: 1),
                Color(hue: Self.unit(hue + 3), saturation: saturation, brightness: 0.86),
            ],
            startPoint: .top, endPoint: .bottom)
    }

    /// The plain color, for dots and accents next to an icon.
    var color: Color { Color(hue: Self.unit(hue), saturation: saturation, brightness: 0.9) }

    private static func unit(_ degrees: Double) -> Double {
        ((degrees.truncatingRemainder(dividingBy: 360)) + 360).truncatingRemainder(dividingBy: 360) / 360
    }
}

/// A settings icon: a bold rounded SF Symbol in the page's color on a
/// near-black tile; layered symbols shade their back layers lighter.
struct SettingsIconTile: View {
    let symbol: String
    let tint: SettingsTint
    var size: CGFloat = 22

    private var isLarge: Bool { size > 36 }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * (isLarge ? 0.24 : 0.28), style: .continuous)
        Image(systemName: symbol)
            .symbolRenderingMode(.hierarchical)
            .font(.system(size: size * 0.5, weight: .bold, design: .rounded))
            .foregroundStyle(tint.gradient)
            .frame(width: size, height: size)
            .background {
                shape.fill(
                    LinearGradient(
                        colors: [Color(white: 0.18), Color(white: 0.05)], startPoint: .top, endPoint: .bottom))
            }
            .overlay {
                shape.strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(isLarge ? 0.4 : 0.24), .white.opacity(0.04)],
                        startPoint: .topLeading, endPoint: .bottomTrailing),
                    lineWidth: isLarge ? size * 0.02 : 0.5)
            }
            .accessibilityHidden(true)
    }
}

// MARK: Hints

extension View {
    /// An ⓘ after the view; resting the pointer on it shows `text`.
    func infoHint(_ text: String) -> some View {
        modifier(InfoHint { HintText(text: text) })
    }

    /// An ⓘ after the view; resting the pointer on it shows `content`.
    func infoHint<Content: View>(@ViewBuilder _ content: @escaping () -> Content) -> some View {
        modifier(InfoHint(content: content))
    }
}

private struct InfoHint<Popover: View>: ViewModifier {
    let content: () -> Popover
    @State private var isHovering = false

    func body(content view: Content) -> some View {
        HStack(spacing: 6) {
            view
            Image(systemName: "info.circle.fill")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .contentShape(Circle())
                .onHover { isHovering = $0 }
                .popover(isPresented: $isHovering, arrowEdge: .bottom) { content() }
                .accessibilityLabel(L10n.t("native.settings.moreInfo"))
        }
    }
}

private struct HintText: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.callout)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: 300, alignment: .leading)
    }
}

// MARK: Rows

/// The title of the row the settings search just jumped to.
extension EnvironmentValues {
    @Entry var settingsHighlight: String?
}

/// One settings row in a grouped Form: the name, an ⓘ that shows the
/// description when the pointer rests on it, an optional line of live state
/// under the name, and the control on the right (Snapzy's SettingRow).
struct SettingsRow<Control: View>: View {
    let title: String
    /// What the setting does; shown from the ⓘ.
    var description: String?
    /// A server.properties key's documentation card; shown from the ⓘ.
    var doc: SchemaEntry?
    /// Live state under the name, e.g. a path.
    var subtitle: String?
    /// A warning under the name, e.g. "Max 65535".
    var note: String?
    var noteColor: Color = .orange
    var alignment: VerticalAlignment = .center
    @ViewBuilder var control: Control

    @Environment(\.settingsHighlight) private var highlight

    var body: some View {
        HStack(alignment: alignment, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                label
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
                if let note {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(noteColor)
                        .transition(.motionFade)
                }
            }
            .animation(Motion.snappy, value: note)
            Spacer(minLength: 8)
            control
        }
        // The title is the anchor the settings search scrolls to.
        .id(title)
        .background {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.accentColor.opacity(highlight == title ? 0.16 : 0))
                .padding(.horizontal, -6)
                .padding(.vertical, -4)
                .animation(Motion.standard, value: highlight == title)
        }
    }

    @ViewBuilder
    private var label: some View {
        if let doc {
            Text(title).infoHint { EditorDocCard(entry: doc).frame(width: 340) }
        } else if let description {
            Text(title).infoHint(description)
        } else {
            Text(title)
        }
    }
}

extension SettingsRow {
    /// A row titled by `key`, described by `native.help.<key>` when that is written.
    init(
        key: String, subtitle: String? = nil, note: String? = nil, noteColor: Color = .orange,
        alignment: VerticalAlignment = .center, @ViewBuilder control: () -> Control
    ) {
        self.init(
            title: L10n.t(key), description: L10n.help(key), subtitle: subtitle, note: note, noteColor: noteColor,
            alignment: alignment, control: control)
    }
}

/// A large square button at the top of the settings sidebar (Droppy's
/// General / Theme tiles): the page's icon over its name.
struct SettingsBigTile: View {
    let title: String
    let symbol: String
    let tint: SettingsTint
    let isSelected: Bool
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                SettingsIconTile(symbol: symbol, tint: tint, size: 26)
                Text(title)
                    .font(.system(size: 12, weight: isSelected ? .semibold : .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(9)
            .background(shape.fill(Color.primary.opacity(isSelected ? 0.09 : (isHovered ? 0.06 : 0.035))))
            .overlay(shape.strokeBorder(Color.accentColor.opacity(isSelected ? 0.9 : 0), lineWidth: 1.5))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .onHover { hovering in withAnimation(Motion.snappy) { isHovered = hovering } }
        .animation(Motion.snappy, value: isSelected)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
