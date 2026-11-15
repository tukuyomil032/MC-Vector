// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension DocumentContext {
    static func propertiesContext(_ source: NSString, line: SourceLine, cursor: Int) -> EditorCursorContext? {
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
        let token = isValue ? caretRangeWhenEmpty(right, cursor: absoluteCursor) : left
        let prefixRange = NSRange(
            location: token.location, length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location))
        let key = string(source, left)
        return EditorCursorContext(
            path: isValue ? [key] : [], range: token, isValue: isValue,
            prefix: unquotedPrefix(string(source, prefixRange)),
            rawValue: isValue ? string(source, right) : nil, siblings: [],
            isHeader: false, isBlockScalar: false, line: 0)
    }

    static func yamlContext(_ source: NSString, line: SourceLine, cursor: Int) -> EditorCursorContext? {
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
        let token = isValue ? caretRangeWhenEmpty(valueRange, cursor: absoluteCursor) : keyRange
        let prefixRange = NSRange(
            location: token.location, length: max(0, min(absoluteCursor, NSMaxRange(token)) - token.location))
        let fullPath = ancestors.names + [key]
        return EditorCursorContext(
            path: isValue ? fullPath : ancestors.names, range: token, isValue: isValue,
            prefix: unquotedPrefix(string(source, prefixRange)),
            rawValue: isValue ? string(source, valueRange) : nil,
            siblings: [], isHeader: false, isBlockScalar: false, line: 0)
    }

    static func tomlContext(_ source: NSString, line: SourceLine, cursor: Int) -> EditorCursorContext? {
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
        let token =
            isValue ? caretRangeWhenEmpty(valueRange, cursor: absoluteCursor) : tomlLastSegmentRange(source, keyRange)
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

    enum CommentMode { case properties, yaml, toml }

    static func uncommentedRange(_ source: NSString, _ range: NSRange, mode: CommentMode) -> NSRange {
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

    static func cursorInComment(_ source: NSString, line: SourceLine, cursor: Int, format: ConfigFormat) -> Bool {
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

    static func isLinePrefixWhitespace(_ source: NSString, range: NSRange, through index: Int) -> Bool {
        guard index >= range.location else { return true }
        for position in range.location..<index where !isWhitespace(source.character(at: position)) { return false }
        return true
    }

    static func assignmentSeparator(_ source: NSString, in range: NSRange, allowed: Set<unichar>) -> Int? {
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

    static func yamlSeparator(_ source: NSString, in range: NSRange) -> Int? {
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

    static func caretRangeWhenEmpty(_ range: NSRange, cursor: Int) -> NSRange {
        range.length == 0 ? NSRange(location: cursor, length: 0) : range
    }

}
