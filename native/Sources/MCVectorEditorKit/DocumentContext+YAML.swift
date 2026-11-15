// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension DocumentContext {
    static func yamlSiblingNames(text: String, cursor: Int, candidates: Set<String>) -> Set<String> {
        guard !candidates.isEmpty else { return [] }
        let source = text as NSString
        let offset = min(max(0, cursor), source.length)
        let currentLine = sourceLine(source, at: offset)
        let indent = indentationWidth(source, currentLine.range)
        let ancestors = yamlAncestors(source, before: currentLine.range.location, indentation: indent)
        let regionEnd = yamlSiblingRegionEnd(
            text, source: source, after: currentLine, indentation: indent)
        let regionStart = min(ancestors.blockStart, currentLine.range.location)
        guard regionStart < regionEnd else { return [] }
        let region = NSRange(location: regionStart, length: regionEnd - regionStart)
        var result = Set<String>()
        guard let pattern = yamlSiblingPattern(candidates, indentation: indent),
            let expression = try? NSRegularExpression(pattern: pattern)
        else { return result }
        expression.enumerateMatches(in: text, range: region) { match, _, stop in
            guard let match else { return }
            let matchedLine = sourceLine(source, at: match.range.location)
            guard matchedLine.range.location != currentLine.range.location,
                indentationWidth(source, matchedLine.range) == indent
            else { return }
            let content = uncommentedRange(source, matchedLine.range, mode: .yaml)
            guard let separator = yamlSeparator(source, in: content) else { return }
            let keyRange = trimmedRange(
                source,
                NSRange(
                    location: matchedLine.range.location + indent,
                    length: max(0, separator - matchedLine.range.location - indent)))
            let key = stripQuotes(string(source, keyRange))
            guard candidates.contains(key) else { return }
            result.insert(key)
            if result.count == candidates.count { stop.pointee = true }
        }
        return result
    }

    static func yamlSiblingRegionEnd(
        _ text: String, source: NSString, after line: SourceLine, indentation: Int
    ) -> Int {
        let next = NSMaxRange(line.range)
        guard indentation > 0, next < source.length,
            let boundary = try? NSRegularExpression(pattern: "(?m)^[ ]{0,\(indentation - 1)}(?=[^\\s#!])"),
            let match = boundary.firstMatch(
                in: text, range: NSRange(location: next, length: source.length - next))
        else { return source.length }
        return match.range.location
    }

    static func yamlSiblingPattern(_ candidates: Set<String>, indentation: Int) -> String? {
        let alternatives = candidates.sorted().map { candidate in
            let plain = NSRegularExpression.escapedPattern(for: candidate)
            let doubleContent =
                candidate
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
                .replacingOccurrences(of: "\t", with: "\\t")
            let doubleQuoted = NSRegularExpression.escapedPattern(for: "\"\(doubleContent)\"")
            let singleContent = candidate.replacingOccurrences(of: "'", with: "''")
            let singleQuoted = NSRegularExpression.escapedPattern(for: "'\(singleContent)'")
            return "(?:\(plain)|\(doubleQuoted)|\(singleQuoted))"
        }
        guard !alternatives.isEmpty else { return nil }
        return "(?:\(alternatives.joined(separator: "|")))"
    }

    static func indentationWidth(_ source: NSString, _ range: NSRange) -> Int {
        var result = 0
        while range.location + result < NSMaxRange(range), isWhitespace(source.character(at: range.location + result)),
            source.character(at: range.location + result) != 0x0A, source.character(at: range.location + result) != 0x0D
        {
            result += 1
        }
        return result
    }

    struct YAMLAncestors {
        var names: [String]
        var blockStart: Int
    }

    struct YAMLAncestor {
        let name: String
        let lineStart: Int
    }

    static func yamlAncestors(_ source: NSString, before lineStart: Int, indentation: Int) -> YAMLAncestors {
        guard indentation > 0 else { return YAMLAncestors(names: [], blockStart: 0) }
        var found: [YAMLAncestor] = []
        var limit = indentation
        var probe = lineStart
        while let previous = previousLine(source, before: probe) {
            probe = previous.range.location
            let content = uncommentedRange(source, previous.range, mode: .yaml)
            let trimmed = trimmedRange(source, content)
            guard trimmed.length > 0 else { continue }
            let indent = indentationWidth(source, previous.range)
            guard indent < limit, let separator = yamlSeparator(source, in: content) else { continue }
            let value = trimmedRange(
                source, NSRange(location: separator + 1, length: max(0, NSMaxRange(content) - separator - 1)))
            guard value.length == 0 else { continue }
            let keyRange = trimmedRange(
                source,
                NSRange(
                    location: previous.range.location + indent,
                    length: max(0, separator - previous.range.location - indent)))
            let key = stripQuotes(string(source, keyRange))
            guard !key.isEmpty else { continue }
            found.append(YAMLAncestor(name: key, lineStart: previous.range.location))
            limit = indent
            if limit == 0 { break }
        }
        let names = found.reversed().map(\.name)
        let start = found.first?.lineStart ?? 0
        return YAMLAncestors(names: names, blockStart: start)
    }

    static func yamlBlockScalarContainsCursor(_ source: NSString, before lineStart: Int, indentation: Int)
        -> Bool
    {
        guard indentation > 0 else { return false }
        var probe = lineStart
        var minimumIndent = indentation
        while let previous = previousLine(source, before: probe) {
            probe = previous.range.location
            let content = uncommentedRange(source, previous.range, mode: .yaml)
            let trimmed = trimmedRange(source, content)
            guard trimmed.length > 0 else { continue }
            let indent = indentationWidth(source, previous.range)
            if let separator = yamlSeparator(source, in: content) {
                let value = string(
                    source,
                    trimmedRange(
                        source,
                        NSRange(
                            location: separator + 1,
                            length: max(0, NSMaxRange(content) - separator - 1)))
                )
                .trimmingCharacters(in: .whitespaces)
                if isYAMLBlockMarker(value) { return minimumIndent > indent }
            }
            minimumIndent = min(minimumIndent, indent)
            if minimumIndent == 0 { return false }
        }
        return false
    }

    static func isYAMLBlockMarker(_ value: String) -> Bool {
        guard let first = value.first, first == "|" || first == ">" else { return false }
        return value.dropFirst().allSatisfy { "+-123456789".contains($0) }
    }

}
