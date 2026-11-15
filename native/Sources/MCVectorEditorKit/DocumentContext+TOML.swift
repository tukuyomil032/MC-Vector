// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension DocumentContext {
    static func currentTOMLTable(_ source: NSString, before lineStart: Int) -> [String] {
        var probe = lineStart
        while let previous = previousLine(source, before: probe) {
            probe = previous.range.location
            let range = trimmedRange(source, uncommentedRange(source, previous.range, mode: .toml))
            guard range.length > 0 else { continue }
            let value = string(source, range)
            guard value.hasPrefix("["), value.hasSuffix("]") else { continue }
            let array = value.hasPrefix("[[")
            let body = String(value.dropFirst(array ? 2 : 1).dropLast(array ? 2 : 1))
            let parts = dottedParts(body)
            return array ? parts + ["[]"] : parts
        }
        return []
    }

    static func tomlLastSegmentRange(_ source: NSString, _ range: NSRange) -> NSRange {
        var quote: unichar = 0
        var escaped = false
        var lastDot: Int?
        for index in range.location..<NSMaxRange(range) {
            let unit = source.character(at: index)
            if escaped {
                escaped = false
                continue
            }
            if quote == 0 {
                if unit == 0x22 || unit == 0x27 { quote = unit } else if unit == 0x2E { lastDot = index }
            } else if quote == 0x22, unit == 0x5C {
                escaped = true
            } else if unit == quote {
                quote = 0
            }
        }
        let start = (lastDot.map { $0 + 1 }) ?? range.location
        return trimmedRange(source, NSRange(location: start, length: max(0, NSMaxRange(range) - start)))
    }

    static func dottedParts(_ value: String) -> [String] {
        var parts: [String] = []
        var current = ""
        var quote: Character?
        var escaped = false
        for character in value {
            if escaped {
                current.append(character)
                escaped = false
                continue
            }
            if character == "\\", quote == "\"" {
                current.append(character)
                escaped = true
                continue
            }
            if let activeQuote = quote {
                current.append(character)
                if character == activeQuote { quote = nil }
                continue
            }
            if character == "\"" || character == "'" {
                quote = character
                current.append(character)
            } else if character == "." {
                let part = stripQuotes(current.trimmingCharacters(in: .whitespaces))
                if !part.isEmpty { parts.append(part) }
                current.removeAll(keepingCapacity: true)
            } else {
                current.append(character)
            }
        }
        let tail = stripQuotes(current.trimmingCharacters(in: .whitespaces))
        if !tail.isEmpty { parts.append(tail) }
        return parts
    }

}
