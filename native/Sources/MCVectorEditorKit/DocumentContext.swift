// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

struct EditorCursorContext: Sendable {
    let path: [String]
    let range: NSRange
    let isValue: Bool
    let prefix: String
    let rawValue: String?
    let siblings: Set<String>
    let isHeader: Bool
    let isBlockScalar: Bool
    let line: Int
    var isComment = false
}

struct EditorOccurrence: Sendable {
    let path: [String]
    let keyRange: NSRange
    let valueRange: NSRange
    let rawValue: String
    let line: Int
    var isDuplicate = false
}

enum DocumentContext {
    static func at(text: String, cursor: Int, format: ConfigFormat) -> EditorCursorContext? {
        let source = text as NSString
        let offset = min(max(0, cursor), source.length)
        let line = sourceLine(source, at: offset)
        if format != .json, cursorInComment(source, line: line, cursor: offset, format: format) {
            return EditorCursorContext(
                path: [], range: NSRange(location: offset, length: 0), isValue: false,
                prefix: "", rawValue: nil, siblings: [], isHeader: false,
                isBlockScalar: false, line: 0, isComment: true)
        }
        switch format {
        case .properties: return propertiesContext(source, line: line, cursor: offset)
        case .yaml: return yamlContext(source, line: line, cursor: offset)
        case .toml: return tomlContext(source, line: line, cursor: offset)
        case .json:
            var parser = JSONCursorParser(source: source, cursor: offset)
            return parser.context()
        }
    }

    static func occurrences(text: String, format: ConfigFormat) -> [EditorOccurrence] {
        let source = text as NSString
        switch format {
        case .properties: return propertyOccurrences(source)
        case .yaml: return yamlOccurrences(source)
        case .toml: return tomlOccurrences(source)
        case .json:
            var parser = JSONDocumentParser(source: source)
            return parser.occurrences()
        }
    }

    static func matchingEntry(path: [String], format: ConfigFormat, entries: [SchemaEntry]) -> SchemaEntry? {
        entries.first { entry in
            let segments = pathSegments(entry.path, format: format)
            guard segments.count == path.count else { return false }
            return zip(segments, path).allSatisfy { schema, actual in
                schema == "*" || schema == actual
            }
        }
    }

    static func pathSegments(_ path: String, format: ConfigFormat) -> [String] {
        format == .properties ? [path] : path.components(separatedBy: ".")
    }

    static func schemaPrefixMatches(_ schema: [String], actual: [String]) -> Bool {
        guard schema.count >= actual.count else { return false }
        for index in actual.indices where schema[index] != "*" && schema[index] != actual[index] {
            return false
        }
        return true
    }

    static func entryPath(_ entry: SchemaEntry, format: ConfigFormat) -> [String] {
        pathSegments(entry.path, format: format)
    }

    static func yamlSiblingNames(text: String, cursor: Int, candidates: Set<String>) -> Set<String> {
        guard !candidates.isEmpty else { return [] }
        let source = text as NSString
        let offset = min(max(0, cursor), source.length)
        let currentLine = sourceLine(source, at: offset)
        let indent = indentationWidth(source, currentLine.range)
        let ancestors = yamlAncestors(source, before: currentLine.range.location, indentation: indent)
        var regionEnd = source.length
        if indent > 0, NSMaxRange(currentLine.range) < source.length,
            let boundary = try? NSRegularExpression(pattern: "(?m)^[ ]{0,\(indent - 1)}(?=[^\\s#!])"),
            let match = boundary.firstMatch(
                in: text,
                range: NSRange(
                    location: NSMaxRange(currentLine.range), length: source.length - NSMaxRange(currentLine.range)))
        {
            regionEnd = match.range.location
        }
        let regionStart = min(ancestors.blockStart, currentLine.range.location)
        guard regionStart < regionEnd else { return [] }
        let region = NSRange(location: regionStart, length: regionEnd - regionStart)
        var result = Set<String>()
        for candidate in candidates {
            var searchRange = region
            while searchRange.length > 0 {
                let match = source.range(of: candidate, options: [], range: searchRange)
                guard match.location != NSNotFound else { break }
                let next = NSMaxRange(match)
                searchRange = NSRange(location: next, length: max(0, NSMaxRange(region) - next))
                let matchedLine = sourceLine(source, at: match.location)
                guard matchedLine.range.location != currentLine.range.location,
                    NSLocationInRange(match.location, region)
                else { continue }
                let content = uncommentedRange(source, matchedLine.range, mode: .yaml)
                guard match.location < NSMaxRange(content),
                    indentationWidth(source, matchedLine.range) == indent,
                    !yamlBlockScalarContainsCursor(
                        source, before: matchedLine.range.location,
                        indentation: indent),
                    let separator = yamlSeparator(source, in: content)
                else { continue }
                let keyRange = trimmedRange(
                    source,
                    NSRange(
                        location: matchedLine.range.location + indent,
                        length: max(0, separator - matchedLine.range.location - indent)))
                if stripQuotes(string(source, keyRange)) == candidate {
                    result.insert(candidate)
                    break
                }
            }
        }
        return result
    }

    static func stripQuotes(_ value: String) -> String {
        guard value.count >= 2 else { return value }
        let first = value.first!
        let last = value.last!
        guard (first == "\"" && last == "\"") || (first == "'" && last == "'") else { return value }
        let body = String(value.dropFirst().dropLast())
        if first == "'" { return body.replacingOccurrences(of: "''", with: "'") }
        return decodeEscapes(body)
    }

    static func decodeEscapes(_ value: String) -> String {
        var output = ""
        var iterator = value.makeIterator()
        while let character = iterator.next() {
            guard character == "\\", let escaped = iterator.next() else {
                output.append(character)
                continue
            }
            switch escaped {
            case "n": output.append("\n")
            case "r": output.append("\r")
            case "t": output.append("\t")
            case "\\": output.append("\\")
            case "\"": output.append("\"")
            default:
                output.append("\\")
                output.append(escaped)
            }
        }
        return output
    }

    static func unquotedPrefix(_ value: String) -> String {
        var result = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if result.first == "\"" || result.first == "'" { result.removeFirst() }
        if result.last == "\"" || result.last == "'" { result.removeLast() }
        return decodeEscapes(result)
    }

    static func trimmedRange(_ source: NSString, _ range: NSRange) -> NSRange {
        var lower = max(0, min(range.location, source.length))
        var upper = max(lower, min(NSMaxRange(range), source.length))
        while lower < upper, isWhitespace(source.character(at: lower)) { lower += 1 }
        while upper > lower, isWhitespace(source.character(at: upper - 1)) { upper -= 1 }
        return NSRange(location: lower, length: upper - lower)
    }

    static func string(_ source: NSString, _ range: NSRange) -> String {
        guard range.location >= 0, range.length >= 0, range.location <= source.length else { return "" }
        let upper = min(NSMaxRange(range), source.length)
        return source.substring(with: NSRange(location: range.location, length: max(0, upper - range.location)))
    }

    static func isWhitespace(_ unit: unichar) -> Bool {
        unit == 0x20 || unit == 0x09 || unit == 0x0A || unit == 0x0D
    }

    static func lineNumber(_ source: NSString, before offset: Int) -> Int {
        guard offset > 0 else { return 1 }
        var line = 1
        let end = min(offset, source.length)
        for index in 0..<end where source.character(at: index) == 0x0A { line += 1 }
        return line
    }

    private static func sourceLine(_ source: NSString, at offset: Int) -> SourceLine {
        let location = min(max(0, offset), source.length)
        var start = location
        while start > 0, source.character(at: start - 1) != 0x0A, source.character(at: start - 1) != 0x0D { start -= 1 }
        var end = location
        while end < source.length, source.character(at: end) != 0x0A, source.character(at: end) != 0x0D { end += 1 }
        return SourceLine(source: source, range: NSRange(location: start, length: end - start), number: 0)
    }

    private static func previousLine(_ source: NSString, before start: Int) -> SourceLine? {
        guard start > 0 else { return nil }
        var probe = start - 1
        while probe >= 0, source.character(at: probe) == 0x0A || source.character(at: probe) == 0x0D {
            if probe == 0 { return nil }
            probe -= 1
        }
        return sourceLine(source, at: probe)
    }

    private static func nextLine(_ source: NSString, after line: SourceLine) -> SourceLine? {
        var next = NSMaxRange(line.range)
        while next < source.length, source.character(at: next) == 0x0A || source.character(at: next) == 0x0D {
            next += 1
        }
        guard next < source.length else { return nil }
        return sourceLine(source, at: next)
    }

    private static func propertiesContext(_ source: NSString, line: SourceLine, cursor: Int) -> EditorCursorContext? {
        let content = uncommentedRange(source, line.range, mode: .properties)
        let separator = assignmentSeparator(source, in: content, allowed: [0x3D, 0x3A])
        let absoluteCursor = min(cursor, NSMaxRange(content))
        guard let separator else {
            let token = trimmedRange(source, NSRange(location: content.location, length: max(0, content.length)))
            return EditorCursorContext(
                path: [], range: token, isValue: false,
                prefix: unquotedPrefix(
                    string(
                        source,
                        NSRange(
                            location: token.location,
                            length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location)))),
                rawValue: nil, siblings: [], isHeader: false, isBlockScalar: false, line: 0)
        }
        let left = trimmedRange(source, NSRange(location: content.location, length: separator - content.location))
        let right = trimmedRange(
            source, NSRange(location: separator + 1, length: max(0, NSMaxRange(content) - separator - 1)))
        let isValue = absoluteCursor > separator
        let token = isValue ? right : left
        let prefixRange = NSRange(
            location: token.location, length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location))
        let key = string(source, left)
        return EditorCursorContext(
            path: isValue ? [key] : [], range: token, isValue: isValue,
            prefix: unquotedPrefix(string(source, prefixRange)),
            rawValue: isValue ? string(source, right) : nil, siblings: [],
            isHeader: false, isBlockScalar: false, line: 0)
    }

    private static func yamlContext(_ source: NSString, line: SourceLine, cursor: Int) -> EditorCursorContext? {
        let rawRange = uncommentedRange(source, line.range, mode: .yaml)
        let indentation = indentationWidth(source, line.range)
        let start = NSRange(
            location: line.range.location + indentation,
            length: max(0, NSMaxRange(rawRange) - line.range.location - indentation))
        let separator = yamlSeparator(source, in: rawRange)
        let ancestors = yamlAncestors(source, before: line.range.location, indentation: indentation)
        let absoluteCursor = min(cursor, NSMaxRange(rawRange))
        if yamlBlockScalarContainsCursor(source, before: line.range.location, indentation: indentation) {
            return EditorCursorContext(
                path: [], range: NSRange(location: cursor, length: 0), isValue: true,
                prefix: "", rawValue: nil, siblings: [], isHeader: false,
                isBlockScalar: true, line: 0)
        }

        guard let separator else {
            let token = trimmedRange(source, start)
            let prefixRange = NSRange(
                location: token.location, length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location))
            return EditorCursorContext(
                path: ancestors.names, range: token, isValue: false,
                prefix: unquotedPrefix(string(source, prefixRange)), rawValue: nil,
                siblings: [], isHeader: false, isBlockScalar: false, line: 0)
        }

        let keyRange = trimmedRange(
            source,
            NSRange(
                location: line.range.location + indentation,
                length: max(0, separator - line.range.location - indentation)))
        let valueRange = trimmedRange(
            source,
            NSRange(
                location: separator + 1,
                length: max(0, NSMaxRange(rawRange) - separator - 1)))
        let isValue = absoluteCursor > separator
        let key = stripQuotes(string(source, keyRange))
        let token = isValue ? valueRange : keyRange
        let prefixRange = NSRange(
            location: token.location, length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location))
        let fullPath = ancestors.names + [key]
        return EditorCursorContext(
            path: isValue ? fullPath : ancestors.names, range: token, isValue: isValue,
            prefix: unquotedPrefix(string(source, prefixRange)),
            rawValue: isValue ? string(source, valueRange) : nil,
            siblings: [], isHeader: false, isBlockScalar: false, line: 0)
    }

    private static func tomlContext(_ source: NSString, line: SourceLine, cursor: Int) -> EditorCursorContext? {
        let content = uncommentedRange(source, line.range, mode: .toml)
        let trimmed = trimmedRange(source, content)
        let trimmedText = string(source, trimmed)
        let tablePath = currentTOMLTable(source, before: line.range.location)
        if trimmedText.hasPrefix("[") {
            let openCount = trimmedText.hasPrefix("[[") ? 2 : 1
            let closeCount = trimmedText.hasSuffix("]]") ? 2 : (trimmedText.hasSuffix("]") ? 1 : 0)
            let bodyStart = min(NSMaxRange(trimmed), trimmed.location + openCount)
            let bodyEnd = max(bodyStart, NSMaxRange(trimmed) - closeCount)
            let body = NSRange(location: bodyStart, length: bodyEnd - bodyStart)
            let token = tomlLastSegmentRange(source, body)
            let prefixRange = NSRange(
                location: token.location, length: max(0, min(cursor, NSMaxRange(token)) - token.location))
            let bodyParts = dottedParts(string(source, body))
            let parent = bodyParts.count > 1 ? Array(bodyParts.dropLast()) : []
            let prefix = unquotedPrefix(string(source, prefixRange))
            return EditorCursorContext(
                path: parent, range: token, isValue: false, prefix: prefix,
                rawValue: nil, siblings: [], isHeader: true, isBlockScalar: false, line: 0)
        }

        guard let separator = assignmentSeparator(source, in: content, allowed: [0x3D]) else {
            let token = trimmed
            let prefixRange = NSRange(
                location: token.location, length: max(0, min(cursor, NSMaxRange(token)) - token.location))
            return EditorCursorContext(
                path: tablePath, range: token, isValue: false,
                prefix: unquotedPrefix(string(source, prefixRange)), rawValue: nil,
                siblings: [], isHeader: false, isBlockScalar: false, line: 0)
        }
        let keyRange = trimmedRange(source, NSRange(location: content.location, length: separator - content.location))
        let valueRange = trimmedRange(
            source, NSRange(location: separator + 1, length: max(0, NSMaxRange(content) - separator - 1)))
        let keyText = string(source, keyRange)
        let parts = dottedParts(keyText)
        let absoluteCursor = min(cursor, NSMaxRange(content))
        let isValue = absoluteCursor > separator
        let token = isValue ? valueRange : tomlLastSegmentRange(source, keyRange)
        let tokenPrefix = NSRange(
            location: token.location, length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location))
        let keyPath = tablePath + parts
        let parentPath = parts.count > 1 ? tablePath + Array(parts.dropLast()) : tablePath
        return EditorCursorContext(
            path: isValue ? keyPath : parentPath, range: token, isValue: isValue,
            prefix: unquotedPrefix(string(source, tokenPrefix)),
            rawValue: isValue ? string(source, valueRange) : nil,
            siblings: [], isHeader: false, isBlockScalar: false, line: 0)
    }

    private enum CommentMode { case properties, yaml, toml }

    private static func uncommentedRange(_ source: NSString, _ range: NSRange, mode: CommentMode) -> NSRange {
        var quote: unichar = 0
        var escaped = false
        for index in range.location..<NSMaxRange(range) {
            let unit = source.character(at: index)
            if escaped {
                escaped = false
                continue
            }
            if quote == 0 {
                if unit == 0x22 || unit == 0x27 {
                    quote = unit
                    continue
                }
                if mode == .properties, unit == 0x23 || unit == 0x21,
                    isLinePrefixWhitespace(source, range: range, through: index)
                {
                    return NSRange(location: range.location, length: index - range.location)
                }
                if unit == 0x23, mode != .properties,
                    mode == .toml || index == range.location || isWhitespace(source.character(at: index - 1))
                {
                    return NSRange(location: range.location, length: index - range.location)
                }
            } else if quote == 0x22, unit == 0x5C {
                escaped = true
            } else if unit == quote {
                quote = 0
            }
        }
        return range
    }

    private static func cursorInComment(_ source: NSString, line: SourceLine, cursor: Int, format: ConfigFormat) -> Bool
    {
        guard format != .json else { return false }
        let mode: CommentMode
        switch format {
        case .properties: mode = .properties
        case .yaml: mode = .yaml
        case .toml: mode = .toml
        case .json: return false
        }
        let content = uncommentedRange(source, line.range, mode: mode)
        let boundary = NSMaxRange(content)
        guard boundary < NSMaxRange(line.range), cursor >= boundary else { return false }
        let marker = source.character(at: boundary)
        if format == .properties { return marker == 0x23 || marker == 0x21 }
        return marker == 0x23
    }

    private static func isLinePrefixWhitespace(_ source: NSString, range: NSRange, through index: Int) -> Bool {
        guard index >= range.location else { return true }
        for position in range.location..<index where !isWhitespace(source.character(at: position)) { return false }
        return true
    }

    private static func assignmentSeparator(_ source: NSString, in range: NSRange, allowed: Set<unichar>) -> Int? {
        var quote: unichar = 0
        var escaped = false
        for index in range.location..<NSMaxRange(range) {
            let unit = source.character(at: index)
            if escaped {
                escaped = false
                continue
            }
            if quote == 0 {
                if unit == 0x22 || unit == 0x27 { quote = unit } else if allowed.contains(unit) { return index }
            } else if quote == 0x22, unit == 0x5C {
                escaped = true
            } else if unit == quote {
                quote = 0
            }
        }
        return nil
    }

    private static func yamlSeparator(_ source: NSString, in range: NSRange) -> Int? {
        var quote: unichar = 0
        var escaped = false
        for index in range.location..<NSMaxRange(range) {
            let unit = source.character(at: index)
            if escaped {
                escaped = false
                continue
            }
            if quote == 0 {
                if unit == 0x22 || unit == 0x27 {
                    quote = unit
                } else if unit == 0x3A, index + 1 == NSMaxRange(range) || isWhitespace(source.character(at: index + 1))
                {
                    return index
                }
            } else if quote == 0x22, unit == 0x5C {
                escaped = true
            } else if unit == quote {
                quote = 0
            }
        }
        return nil
    }

    private static func indentationWidth(_ source: NSString, _ range: NSRange) -> Int {
        var result = 0
        while range.location + result < NSMaxRange(range), isWhitespace(source.character(at: range.location + result)),
            source.character(at: range.location + result) != 0x0A, source.character(at: range.location + result) != 0x0D
        {
            result += 1
        }
        return result
    }

    private struct YAMLAncestors {
        var names: [String]
        var blockStart: Int
    }

    private static func yamlAncestors(_ source: NSString, before lineStart: Int, indentation: Int) -> YAMLAncestors {
        guard indentation > 0 else { return YAMLAncestors(names: [], blockStart: 0) }
        var found: [(indent: Int, name: String, start: Int)] = []
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
            found.append((indent, key, previous.range.location))
            limit = indent
            if limit == 0 { break }
        }
        let names = found.reversed().map(\.name)
        let start = found.first?.start ?? 0
        return YAMLAncestors(names: names, blockStart: start)
    }

    private static func yamlBlockScalarContainsCursor(_ source: NSString, before lineStart: Int, indentation: Int)
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

    private static func isYAMLBlockMarker(_ value: String) -> Bool {
        guard let first = value.first, first == "|" || first == ">" else { return false }
        return value.dropFirst().allSatisfy { "+-123456789".contains($0) }
    }

    private static func currentTOMLTable(_ source: NSString, before lineStart: Int) -> [String] {
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

    private static func tomlLastSegmentRange(_ source: NSString, _ range: NSRange) -> NSRange {
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

    private static func dottedParts(_ value: String) -> [String] {
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

    private static func propertyOccurrences(_ source: NSString) -> [EditorOccurrence] {
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

    private static func yamlOccurrences(_ source: NSString) -> [EditorOccurrence] {
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

    private static func tomlOccurrences(_ source: NSString) -> [EditorOccurrence] {
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

    private static func forEachLine(_ source: NSString, _ body: (SourceLine) -> Void) {
        guard source.length > 0 else { return }
        var offset = 0
        var number = 0
        while offset < source.length {
            var full = source.lineRange(for: NSRange(location: offset, length: 0))
            if full.length == 0 { break }
            var end = min(NSMaxRange(full), source.length)
            while end > offset, source.character(at: end - 1) == 0x0A || source.character(at: end - 1) == 0x0D {
                end -= 1
            }
            full = NSRange(location: offset, length: end - offset)
            body(SourceLine(source: source, range: full, number: number))
            offset = NSMaxRange(source.lineRange(for: NSRange(location: offset, length: 0)))
            number += 1
        }
    }
}

private struct SourceLine {
    let range: NSRange
    let number: Int
    init(source: NSString, range: NSRange, number: Int) {
        self.range = NSRange(
            location: range.location, length: max(0, min(NSMaxRange(range), source.length) - range.location))
        self.number = number
    }
}
