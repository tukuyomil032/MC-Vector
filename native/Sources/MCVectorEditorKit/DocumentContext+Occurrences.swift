// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension DocumentContext {
    static func propertyOccurrences(_ source: NSString) -> [EditorOccurrence] {
        var output: [EditorOccurrence] = []
        forEachLine(source) { line in
            let content = uncommentedRange(source, line.range, mode: .properties)
            let trimmed = trimmedRange(source, content)
            guard trimmed.length > 0, let separator = assignmentSeparator(source, in: content, allowed: [0x3D, 0x3A])
            else { return }
            let keyRange = trimmedRange(
                source, NSRange(location: content.location, length: separator - content.location))
            let valueRange = trimmedRange(
                source, NSRange(location: separator + 1, length: max(0, NSMaxRange(content) - separator - 1)))
            let key = string(source, keyRange)
            guard !key.isEmpty else { return }
            output.append(
                EditorOccurrence(
                    path: [key], keyRange: keyRange, valueRange: valueRange,
                    rawValue: string(source, valueRange), line: line.number))
        }
        return output
    }

    static func yamlOccurrences(_ source: NSString) -> [EditorOccurrence] {
        var output: [EditorOccurrence] = []
        var ancestors: [(indent: Int, key: String)] = []
        var blockIndent: Int?
        forEachLine(source) { line in
            let content = uncommentedRange(source, line.range, mode: .yaml)
            let trimmed = trimmedRange(source, content)
            guard trimmed.length > 0 else { return }
            let indentation = indentationWidth(source, line.range)
            if let active = blockIndent {
                if indentation > active { return }
                blockIndent = nil
            }
            while let last = ancestors.last, last.indent >= indentation { ancestors.removeLast() }
            guard let separator = yamlSeparator(source, in: content) else { return }
            let keyRange = trimmedRange(
                source,
                NSRange(
                    location: line.range.location + indentation,
                    length: max(0, separator - line.range.location - indentation)))
            let key = stripQuotes(string(source, keyRange))
            guard !key.isEmpty else { return }
            let valueRange = trimmedRange(
                source,
                NSRange(
                    location: separator + 1,
                    length: max(0, NSMaxRange(content) - separator - 1)))
            let rawValue = string(source, valueRange)
            if valueRange.length > 0 {
                output.append(
                    EditorOccurrence(
                        path: ancestors.map(\.key) + [key], keyRange: keyRange,
                        valueRange: valueRange, rawValue: rawValue, line: line.number))
                if isYAMLBlockMarker(rawValue.trimmingCharacters(in: .whitespaces)) { blockIndent = indentation }
            } else {
                output.append(
                    EditorOccurrence(
                        path: ancestors.map(\.key) + [key], keyRange: keyRange,
                        valueRange: valueRange, rawValue: "", line: line.number))
                ancestors.append((indentation, key))
            }
        }
        return output
    }

    static func tomlOccurrences(_ source: NSString) -> [EditorOccurrence] {
        var output: [EditorOccurrence] = []
        var table: [String] = []
        forEachLine(source) { line in
            let content = uncommentedRange(source, line.range, mode: .toml)
            let trimmed = trimmedRange(source, content)
            guard trimmed.length > 0 else { return }
            let text = string(source, trimmed)
            if text.hasPrefix("["), text.hasSuffix("]") {
                let array = text.hasPrefix("[[")
                let body = String(text.dropFirst(array ? 2 : 1).dropLast(array ? 2 : 1))
                table = dottedParts(body) + (array ? ["[]"] : [])
                return
            }
            guard let separator = assignmentSeparator(source, in: content, allowed: [0x3D]) else { return }
            let keyRange = trimmedRange(
                source, NSRange(location: content.location, length: separator - content.location))
            let valueRange = trimmedRange(
                source, NSRange(location: separator + 1, length: max(0, NSMaxRange(content) - separator - 1)))
            let parts = dottedParts(string(source, keyRange))
            guard !parts.isEmpty else { return }
            output.append(
                EditorOccurrence(
                    path: table + parts, keyRange: keyRange, valueRange: valueRange,
                    rawValue: string(source, valueRange), line: line.number))
        }
        return output
    }

}
