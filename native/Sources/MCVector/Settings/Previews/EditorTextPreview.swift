// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A few lines of server.properties drawn the way the editor would show them
/// now: the theme's colors, the text size, wrapping and invisible characters.
struct EditorTextPreview: View {
    let settings: EditorSettings
    @Environment(\.colorScheme) private var scheme

    /// (key, value); the last line is long, to show wrapping.
    private static let lines: [(String, String)] = [
        ("motd", "A Minecraft Server"),
        ("max-players", "20"),
        ("online-mode", "true"),
        ("resource-pack-prompt", "Download our pack for custom textures, sounds and menus"),
    ]

    var body: some View {
        let palette = (EditorThemes.theme(id: settings.themeID) ?? EditorThemes.all.first)?
            .palette(dark: scheme == .dark)
        VStack(alignment: .leading, spacing: settings.fontSize * 0.3) {
            ForEach(Array(Self.lines.enumerated()), id: \.offset) { number, line in
                HStack(alignment: .firstTextBaseline, spacing: settings.fontSize * 0.8) {
                    Text("\(number + 1)")
                        .foregroundStyle(palette.map { $0.lineNumber.color } ?? .secondary)
                        .frame(minWidth: settings.fontSize, alignment: .trailing)
                    text(line, palette: palette)
                        .lineLimit(settings.wrapLines ? nil : 1)
                        .truncationMode(.tail)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .font(.system(size: settings.fontSize, design: .monospaced))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(palette.map { $0.background.color } ?? Color(nsColor: .textBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .animation(Motion.snappy, value: settings.fontSize)
        .animation(Motion.standard, value: settings.wrapLines)
        .accessibilityHidden(true)
    }

    private func text(_ line: (String, String), palette: EditorTheme.Palette?) -> Text {
        let invisibles = settings.showInvisibles
        let faint = palette.map { $0.faint.color } ?? .secondary
        func colored(_ value: String, _ token: String) -> Text {
            let color =
                palette?.color(forToken: token).map { Color(nsColor: $0) }
                ?? palette?.foreground.color ?? .primary
            guard invisibles else { return Text(value).foregroundStyle(color) }
            // Spaces show as faint middle dots.
            return value.split(separator: " ", omittingEmptySubsequences: false).enumerated()
                .reduce(Text("")) { result, part in
                    (part.offset == 0 ? result : result + Text("·").foregroundStyle(faint))
                        + Text(String(part.element)).foregroundStyle(color)
                }
        }
        let token = line.1 == "true" ? "boolean" : (Int(line.1) != nil ? "number" : "string")
        let result = colored(line.0, "property") + colored("=", "punctuation") + colored(line.1, token)
        return invisibles ? result + Text("¬").foregroundStyle(faint) : result
    }
}
