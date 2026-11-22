// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Settings › Editor: the syntax theme (cards drawn with each theme's own
/// colors), text size, wrapping, invisible characters and suggestions.
struct EditorSettingsPane: View {
    @Bindable private var settings = EditorSettings.shared

    var body: some View {
        Form {
            Section {
                ThemeGrid(selection: $settings.themeID)
                    .id(L10n.t("native.settings.editor.theme"))
            } header: {
                Text(L10n.t("native.settings.editor.theme"))
                    .infoHint(L10n.help("native.settings.editor.theme") ?? "")
            }

            Section(L10n.t("native.settings.editor.text")) {
                SettingsRow(key: "native.settings.editor.fontSize") {
                    HStack(spacing: 10) {
                        Slider(value: $settings.fontSize, in: EditorSettings.fontSizes, step: 1)
                            .frame(width: 180)
                        Text("\(Int(settings.fontSize)) pt")
                            .monospacedDigit()
                            .contentTransition(.numericText(value: settings.fontSize))
                            .animation(Motion.snappy, value: settings.fontSize)
                            .frame(width: 48, alignment: .trailing)
                    }
                }
                toggleRow("native.settings.editor.wrapLines", $settings.wrapLines)
                toggleRow("native.settings.editor.showInvisibles", $settings.showInvisibles)
            }

            Section(L10n.t("native.settings.editor.suggestions")) {
                toggleRow("native.settings.editor.suggestWhileTyping", $settings.suggestWhileTyping)
                toggleRow("native.settings.editor.inlineSuggestions", $settings.inlineSuggestions)
            }
        }
        .formStyle(.grouped)
    }

    private func toggleRow(_ key: String, _ isOn: Binding<Bool>) -> some View {
        SettingsRow(key: key) {
            Toggle(L10n.t(key), isOn: isOn).toggleStyle(.switch).labelsHidden()
        }
    }
}

/// Theme cards in a grid; the selected one gets an accent ring.
private struct ThemeGrid: View {
    @Binding var selection: String

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 220), spacing: 12)], spacing: 14) {
            ForEach(EditorThemes.all) { theme in
                ThemeCard(theme: theme, isSelected: theme.id == selection)
                    .onTapGesture {
                        withAnimation(Motion.snappy) { selection = theme.id }
                    }
                    .accessibilityAddTraits(theme.id == selection ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct ThemeCard: View {
    let theme: EditorTheme
    let isSelected: Bool
    @Environment(\.colorScheme) private var colorScheme
    @State private var isHovered = false

    var body: some View {
        let palette = theme.palette(dark: colorScheme == .dark)
        VStack(alignment: .leading, spacing: 6) {
            ThemeSample(palette: palette)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(palette.background.color, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .strokeBorder(
                            isSelected ? Color.accentColor : Color.primary.opacity(0.12),
                            lineWidth: isSelected ? 2.5 : 1)
                }
                .scaleEffect(isHovered && !isSelected ? 1.02 : 1)
                .shadow(color: .black.opacity(isHovered ? 0.18 : 0.08), radius: isHovered ? 6 : 2, y: 1)
            HStack(spacing: 4) {
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.accentColor)
                        .transition(.motionPop)
                }
                Text(theme.name)
                    .fontWeight(isSelected ? .semibold : .regular)
                if theme.isAutomatic {
                    Text(L10n.t("native.settings.editor.automatic"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(.quaternary, in: Capsule())
                }
            }
            .font(.callout)
        }
        .contentShape(Rectangle())
        .onHover { hovering in withAnimation(Motion.snappy) { isHovered = hovering } }
        .animation(Motion.snappy, value: isSelected)
    }
}

/// A few lines of a server config, colored like the editor would.
struct ThemeSample: View {
    let palette: EditorTheme.Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            line([("# Paper global config", "comment")])
            line([("chunk-loading", "property"), (":", "punctuation")])
            line([("  max-rate", "property"), (": ", "punctuation"), ("100.0", "number")])
            line([("  enabled", "property"), (": ", "punctuation"), ("true", "boolean")])
            line([("motd", "property"), (": ", "punctuation"), ("\"Hello\"", "string")])
        }
        .font(.system(size: 10.5, design: .monospaced))
        .lineLimit(1)
    }

    private func line(_ parts: [(String, String)]) -> Text {
        parts.reduce(Text("")) { text, part in
            let color = palette.color(forToken: part.1).map { Color(nsColor: $0) } ?? palette.foreground.color
            return text + Text(part.0).foregroundStyle(color)
        }
    }
}
