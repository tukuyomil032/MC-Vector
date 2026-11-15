// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorEditorKit
import TreeSitterResource

/// The editor mode of a file, picked from its lowercased last extension
/// (requirement FILE-002, React `detectLanguage`).
struct EditorLanguage: Equatable {
    /// Shown in the status bar.
    let displayName: String
    let highlighting: Highlighting

    /// The config format for completion and validation, when the mode has one.
    var format: ConfigFormat? {
        switch displayName {
        case "JSON": .json
        case "YAML": .yaml
        case "TOML": .toml
        case "INI": .properties
        default: nil
        }
    }

    enum Highlighting: Equatable {
        /// A tree-sitter grammar bundled with STTextView-Plugin-Neon; `queries`
        /// names its folder in Contents/Resources/TreeSitterQueries.
        case treeSitter(TreeSitterLanguage, queries: String)
        /// key=value files, colored by `IniHighlightPlugin`.
        case ini
        /// No grammar ships for the mode; the text is shown plain.
        case none
    }

    static func detect(fileName: String) -> EditorLanguage {
        let ext = (fileName as NSString).pathExtension.lowercased()
        switch ext {
        case "json", "mcmeta": return .init("JSON", .treeSitter(.json, queries: "JSON"))
        case "yml", "yaml": return .init("YAML", .treeSitter(.yaml, queries: "YAML"))
        case "properties", "conf", "cfg": return .init("INI", .ini)
        case "ts", "tsx": return .init("TypeScript", .treeSitter(.typescript, queries: "TypeScript"))
        case "js", "jsx": return .init("JavaScript", .treeSitter(.javascript, queries: "JavaScript"))
        case "rs": return .init("Rust", .treeSitter(.rust, queries: "Rust"))
        case "sh", "bash": return .init("Shell", .treeSitter(.bash, queries: "Bash"))
        case "toml": return .init("TOML", .treeSitter(.toml, queries: "TOML"))
        case "xml": return .init("XML", .none)
        case "md": return .init("Markdown", .treeSitter(.markdown, queries: "Markdown"))
        case "bat", "cmd": return .init("BAT", .none)
        case "py": return .init("Python", .treeSitter(.python, queries: "Python"))
        case "lua": return .init("Lua", .none)
        case "sql": return .init("SQL", .treeSitter(.sql, queries: "SQL"))
        case "css": return .init("CSS", .treeSitter(.css, queries: "CSS"))
        case "html", "htm": return .init("HTML", .treeSitter(.html, queries: "HTML"))
        default: return .init(L10n.t("files.editor.plainText"), .none)
        }
    }

    private init(_ displayName: String, _ highlighting: Highlighting) {
        self.displayName = displayName
        self.highlighting = highlighting
    }
}
