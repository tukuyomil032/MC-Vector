// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// Minecraft's legacy formatted text: `§` codes for colors (`§0`–`§f`) and
/// styles (`§l` bold, `§o` italic, `§n` underline, `§m` strikethrough, `§r`
/// reset), as written in server.properties' `motd`.
public enum MinecraftText {
    /// One stretch of text with a single format.
    public struct Run: Equatable, Sendable {
        public var text: String
        /// The color as 0xRRGGBB; nil is the default (gray in the server list).
        public var color: UInt32?
        public var bold = false
        public var italic = false
        public var underline = false
        public var strikethrough = false

        public init(
            text: String, color: UInt32? = nil, bold: Bool = false, italic: Bool = false,
            underline: Bool = false, strikethrough: Bool = false
        ) {
            self.text = text
            self.color = color
            self.bold = bold
            self.italic = italic
            self.underline = underline
            self.strikethrough = strikethrough
        }

        func hasSameFormat(as other: Run) -> Bool {
            color == other.color && bold == other.bold && italic == other.italic && underline == other.underline
                && strikethrough == other.strikethrough
        }
    }

    /// The 16 legacy colors by code.
    public static let colors: [Character: UInt32] = [
        "0": 0x000000, "1": 0x0000AA, "2": 0x00AA00, "3": 0x00AAAA,
        "4": 0xAA0000, "5": 0xAA00AA, "6": 0xFFAA00, "7": 0xAAAAAA,
        "8": 0x555555, "9": 0x5555FF, "a": 0x55FF55, "b": 0x55FFFF,
        "c": 0xFF5555, "d": 0xFF55FF, "e": 0xFFFF55, "f": 0xFFFFFF,
    ]

    /// Splits `raw` into lines of runs. The file may hold `§` itself or the
    /// Java escapes for the section sign and for line breaks, read the way the server reads them.
    /// A color code resets the styles, as in the game.
    public static func lines(_ raw: String) -> [[Run]] {
        let text = unescape(raw)
        var lines: [[Run]] = [[]]
        var format = Run(text: "")
        let characters = Array(text)
        var index = 0

        func flush() {
            guard !format.text.isEmpty else { return }
            let line = lines.count - 1
            // A code that changes nothing (§k, unknown ones) does not split the text.
            if var last = lines[line].last, last.hasSameFormat(as: format) {
                last.text += format.text
                lines[line][lines[line].count - 1] = last
            } else {
                lines[line].append(format)
            }
            format.text = ""
        }

        while index < characters.count {
            let character = characters[index]
            if character == "\n" {
                flush()
                lines.append([])
            } else if character == "§", index + 1 < characters.count {
                flush()
                let code = Character(characters[index + 1].lowercased())
                if let color = colors[code] {
                    format = Run(text: "", color: color)
                } else {
                    switch code {
                    case "l": format.bold = true
                    case "o": format.italic = true
                    case "n": format.underline = true
                    case "m": format.strikethrough = true
                    case "r": format = Run(text: "")
                    default: break  // §k (obfuscated) and unknown codes are dropped.
                    }
                }
                index += 1
            } else {
                format.text.append(character)
            }
            index += 1
        }
        flush()
        return lines
    }

    /// The escaped section sign → `§` (any case), and `\n` → a line break.
    static func unescape(_ raw: String) -> String {
        raw.replacingOccurrences(of: "\\u00A7", with: "§", options: .caseInsensitive)
            .replacingOccurrences(of: "\\n", with: "\n")
    }
}
