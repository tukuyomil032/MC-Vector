// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorEditorKit
import SwiftUI

/// A syntax highlighting theme, loaded from Contents/Resources/EditorThemes/<id>.json.
/// A theme has a light variant, a dark variant, or both; with both it follows
/// the system appearance ("automatic").
struct EditorTheme: Identifiable, Hashable, Decodable {
    let id: String
    let name: String
    let light: Palette?
    let dark: Palette?

    /// Themes with only one variant keep it in both appearances.
    func palette(dark isDark: Bool) -> Palette {
        if isDark { dark ?? light ?? .fallback } else { light ?? dark ?? .fallback }
    }

    var isAutomatic: Bool { light != nil && dark != nil }

    static func == (lhs: EditorTheme, rhs: EditorTheme) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// Colors of one variant. Every color is `#RRGGBB`, `#RRGGBBAA` or
    /// `system:<NSColor name>` (for example `system:systemPink`).
    struct Palette: Decodable, Sendable {
        let background: ThemeColor
        let foreground: ThemeColor
        let selection: ThemeColor
        let currentLine: ThemeColor
        let lineNumber: ThemeColor
        let cursor: ThemeColor
        /// Inline suggestions and invisible characters.
        let faint: ThemeColor
        let tokens: [String: ThemeColor]

        static let fallback = Palette(
            background: .system("textBackgroundColor"), foreground: .system("textColor"),
            selection: .system("selectedTextBackgroundColor"),
            currentLine: .system("unemphasizedSelectedContentBackgroundColor"),
            lineNumber: .system("secondaryLabelColor"), cursor: .system("textInsertionPointColor"),
            faint: .system("tertiaryLabelColor"), tokens: [:]
        )

        /// The color for a tree-sitter capture such as `string.special.key`:
        /// the longest matching prefix in `tokens` wins (`string.special.key`,
        /// then `string.special`, then `string`).
        func color(forToken token: String) -> NSColor? {
            var name = token.lowercased()
            while true {
                if let color = tokens[name] { return color.nsColor }
                guard let dot = name.lastIndex(of: ".") else { return nil }
                name = String(name[..<dot])
            }
        }
    }
}

/// One color from a theme file.
enum ThemeColor: Decodable, Sendable {
    case rgb(red: Double, green: Double, blue: Double, alpha: Double)
    case system(String)

    init(from decoder: any Decoder) throws {
        let text = try decoder.singleValueContainer().decode(String.self)
        if text.hasPrefix("system:") {
            self = .system(String(text.dropFirst("system:".count)))
            return
        }
        guard text.hasPrefix("#"), let value = UInt64(text.dropFirst(), radix: 16) else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Bad color \(text)"))
        }
        switch text.count {
        case 7:
            self = .rgb(
                red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
                blue: Double(value & 0xFF) / 255, alpha: 1)
        case 9:
            self = .rgb(
                red: Double((value >> 24) & 0xFF) / 255, green: Double((value >> 16) & 0xFF) / 255,
                blue: Double((value >> 8) & 0xFF) / 255, alpha: Double(value & 0xFF) / 255)
        default:
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Bad color \(text)"))
        }
    }

    var nsColor: NSColor {
        switch self {
        case .rgb(let red, let green, let blue, let alpha):
            NSColor(srgbRed: red, green: green, blue: blue, alpha: alpha)
        case .system(let name):
            (NSColor.value(forKey: name) as? NSColor) ?? .textColor
        }
    }

    var color: Color { Color(nsColor: nsColor) }
}

/// Every bundled theme, in the order the settings show them.
@MainActor
enum EditorThemes {
    static let defaultID = "xcode"

    static let all: [EditorTheme] = {
        guard let folder = Bundle.main.resourceURL?.appendingPathComponent("EditorThemes"),
            let urls = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        else { return [] }
        let decoder = JSONDecoder()
        let themes = urls.filter { $0.pathExtension == "json" }.compactMap { url -> EditorTheme? in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? decoder.decode(EditorTheme.self, from: data)
        }
        // The default first, then by name.
        return themes.sorted { lhs, rhs in
            if lhs.id == defaultID { return true }
            if rhs.id == defaultID { return false }
            return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        }
    }()

    static func theme(id: String) -> EditorTheme? {
        all.first { $0.id == id } ?? all.first { $0.id == defaultID } ?? all.first
    }
}

/// The bundled server config schemas (Contents/Resources/ConfigSchemas).
enum ConfigSchemas {
    static let store: SchemaStore? = {
        guard let folder = Bundle.main.resourceURL?.appendingPathComponent("ConfigSchemas") else { return nil }
        return try? SchemaStore(directory: folder)
    }()
}
