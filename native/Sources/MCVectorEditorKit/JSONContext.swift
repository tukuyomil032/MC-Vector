// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

struct JSONCursorFrame {
    enum Kind { case object, array }
    enum State { case keyOrEnd, colon, value, commaOrEnd, valueOrEnd }
    let kind: Kind
    let path: [String]
    var state: State
    var pendingKey: String?
    var siblings: Set<String>
}

struct JSONCursorParser {
    let source: NSString
    let cursor: Int
    private var index = 0
    private var frames: [JSONCursorFrame] = []

    init(source: NSString, cursor: Int) {
        self.source = source
        self.cursor = cursor
    }

    mutating func context() -> EditorCursorContext? { scan() }

    private mutating func scan() -> EditorCursorContext? {
        while index < source.length, index <= cursor {
            skipWhitespace()
            if index >= source.length || index > cursor { break }
            let unit = source.character(at: index)
            if unit == 0x22 {
                let start = index
                let isKey = frames.last?.kind == .object && frames.last?.state == .keyOrEnd
                let lineRange = source.lineRange(for: NSRange(location: cursor, length: 0))
                var lineEnd = NSMaxRange(lineRange)
                while lineEnd > lineRange.location,
                    source.character(at: lineEnd - 1) == 0x0A || source.character(at: lineEnd - 1) == 0x0D
                {
                    lineEnd -= 1
                }
                let end = scanStringEnd(from: start, limit: lineEnd)
                let hasClosingQuote = end > start && source.character(at: end - 1) == 0x22
                let contentStart = start + 1
                let tokenEnd = hasClosingQuote ? end : min(lineEnd, max(cursor, contentStart))
                let contentEnd = max(contentStart, tokenEnd - (hasClosingQuote ? 1 : 0))
                if cursor >= start, cursor < tokenEnd {
                    let prefixEnd = min(cursor, contentEnd)
                    let rawPrefix = DocumentContext.string(
                        source, NSRange(location: contentStart, length: max(0, prefixEnd - contentStart)))
                    let value = DocumentContext.unquotedPrefix("\"" + rawPrefix)
                    let tokenRange = NSRange(location: start, length: max(0, tokenEnd - start))
                    if isKey, var frame = frames.last {
                        let decoded = value
                        frame.pendingKey = decoded
                        frames[frames.count - 1] = frame
                        return EditorCursorContext(
                            path: frame.path, range: tokenRange, isValue: false,
                            prefix: value, rawValue: nil, siblings: frame.siblings,
                            isHeader: false, isBlockScalar: false, line: 0)
                    }
                    let valuePath = currentValuePath()
                    return EditorCursorContext(
                        path: valuePath, range: tokenRange, isValue: true,
                        prefix: value,
                        rawValue: DocumentContext.string(
                            source, NSRange(location: start, length: max(0, tokenEnd - start))),
                        siblings: [], isHeader: false, isBlockScalar: false, line: 0)
                }
                let decoded = decodeJSONString(start: start, end: end)
                index = end
                if isKey, var frame = frames.last {
                    frame.pendingKey = decoded
                    frame.siblings.insert(decoded)
                    frame.state = .colon
                    frames[frames.count - 1] = frame
                } else {
                    consumeValue()
                }
                continue
            }
            switch unit {
            case 0x7B:
                let path = currentValuePath()
                consumeValue()
                frames.append(
                    JSONCursorFrame(kind: .object, path: path, state: .keyOrEnd, pendingKey: nil, siblings: []))
                index += 1
            case 0x5B:
                let path = currentValuePath()
                consumeValue()
                frames.append(
                    JSONCursorFrame(kind: .array, path: path, state: .valueOrEnd, pendingKey: nil, siblings: []))
                index += 1
            case 0x7D, 0x5D:
                if !frames.isEmpty { frames.removeLast() }
                index += 1
            case 0x3A:
                if var frame = frames.last, frame.kind == .object {
                    frame.state = .value
                    frames[frames.count - 1] = frame
                }
                index += 1
            case 0x2C:
                if var frame = frames.last {
                    frame.state = frame.kind == .object ? .keyOrEnd : .valueOrEnd
                    frame.pendingKey = nil
                    frames[frames.count - 1] = frame
                }
                index += 1
            default:
                let start = index
                while index < source.length,
                    !DocumentContext.isWhitespace(source.character(at: index)),
                    ![0x2C, 0x5D, 0x7D].contains(source.character(at: index))
                { index += 1 }
                if cursor >= start, cursor <= index {
                    return EditorCursorContext(
                        path: currentValuePath(), range: NSRange(location: start, length: index - start),
                        isValue: true,
                        prefix: DocumentContext.string(
                            source, NSRange(location: start, length: max(0, min(cursor, index) - start))),
                        rawValue: DocumentContext.string(source, NSRange(location: start, length: index - start)),
                        siblings: [], isHeader: false, isBlockScalar: false,
                        line: 0)
                }
                consumeValue()
            }
        }
        guard let frame = frames.last else { return nil }
        switch (frame.kind, frame.state) {
        case (.object, .keyOrEnd):
            return EditorCursorContext(
                path: frame.path, range: NSRange(location: cursor, length: 0), isValue: false,
                prefix: "", rawValue: nil, siblings: frame.siblings, isHeader: false,
                isBlockScalar: false, line: 0)
        case (.object, .value):
            return EditorCursorContext(
                path: frame.path + [frame.pendingKey ?? ""], range: NSRange(location: cursor, length: 0),
                isValue: true, prefix: "", rawValue: nil, siblings: [], isHeader: false,
                isBlockScalar: false, line: 0)
        case (.array, .valueOrEnd):
            return EditorCursorContext(
                path: frame.path + ["[]"], range: NSRange(location: cursor, length: 0),
                isValue: true, prefix: "", rawValue: nil, siblings: [], isHeader: false,
                isBlockScalar: false, line: 0)
        default: return nil
        }
    }

    private mutating func skipWhitespace() {
        while index < source.length, DocumentContext.isWhitespace(source.character(at: index)) { index += 1 }
    }

    private func currentValuePath() -> [String] {
        guard let frame = frames.last else { return [] }
        if frame.kind == .array { return frame.path + ["[]"] }
        return frame.path + [frame.pendingKey ?? ""]
    }

    private mutating func consumeValue() {
        guard var frame = frames.last else { return }
        frame.state = .commaOrEnd
        if frame.kind == .object { frame.pendingKey = nil }
        frames[frames.count - 1] = frame
    }

    private func scanStringEnd(from start: Int, limit: Int? = nil) -> Int {
        var position = start + 1
        var escaped = false
        let end = min(source.length, limit ?? source.length)
        while position < end {
            let unit = source.character(at: position)
            if escaped {
                escaped = false
            } else if unit == 0x5C {
                escaped = true
            } else if unit == 0x22 {
                return position + 1
            }
            position += 1
        }
        return source.length
    }

    private func decodeJSONString(start: Int, end: Int) -> String {
        let raw = DocumentContext.string(source, NSRange(location: start, length: max(0, end - start)))
        guard let data = raw.data(using: .utf8),
            let decoded = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? String
        else {
            return DocumentContext.unquotedPrefix(raw)
        }
        return decoded
    }
}

struct JSONDocumentParser {
    let source: NSString
    private var index = 0
    private var line = 0
    private var output: [EditorOccurrence] = []

    init(source: NSString) { self.source = source }

    mutating func occurrences() -> [EditorOccurrence] {
        _ = parseValue(path: [], keyRange: NSRange(location: 0, length: 0), isDuplicate: false)
        return output
    }

    private mutating func parseValue(path: [String], keyRange: NSRange, isDuplicate: Bool) -> Bool {
        skipWhitespace()
        guard index < source.length else { return false }
        let start = index
        let startLine = line
        switch source.character(at: index) {
        case 0x7B:
            guard parseObject(path: path) else { return false }
            output.append(
                EditorOccurrence(
                    path: path, keyRange: keyRange,
                    valueRange: NSRange(location: start, length: index - start),
                    rawValue: "", line: startLine, isDuplicate: isDuplicate))
            return true
        case 0x5B:
            guard parseArray(path: path) else { return false }
            output.append(
                EditorOccurrence(
                    path: path, keyRange: keyRange,
                    valueRange: NSRange(location: start, length: index - start),
                    rawValue: "", line: startLine, isDuplicate: isDuplicate))
            return true
        case 0x22:
            let end = scanStringEnd(from: start)
            let raw = DocumentContext.string(source, NSRange(location: start, length: end - start))
            advance(to: end)
            append(
                path: path, keyRange: keyRange, valueRange: NSRange(location: start, length: end - start),
                value: raw, line: startLine, isDuplicate: isDuplicate)
            return end > start + 1 && source.character(at: end - 1) == 0x22
        default:
            while index < source.length,
                !DocumentContext.isWhitespace(source.character(at: index)),
                ![0x2C, 0x5D, 0x7D].contains(source.character(at: index))
            { advance() }
            guard index > start else { return false }
            let range = NSRange(location: start, length: index - start)
            append(
                path: path, keyRange: keyRange, valueRange: range,
                value: DocumentContext.string(source, range), line: startLine, isDuplicate: isDuplicate)
            return true
        }
    }

    private mutating func parseObject(path: [String]) -> Bool {
        advance()
        skipWhitespace()
        var seen = Set<String>()
        while index < source.length, source.character(at: index) != 0x7D {
            guard source.character(at: index) == 0x22 else { return false }
            let keyStart = index
            let keyEnd = scanStringEnd(from: keyStart)
            guard keyEnd > keyStart + 1, source.character(at: keyEnd - 1) == 0x22 else { return false }
            let keyRange = NSRange(location: keyStart, length: keyEnd - keyStart)
            let key = decodeJSONString(start: keyStart, end: keyEnd)
            advance(to: keyEnd)
            skipWhitespace()
            guard index < source.length, source.character(at: index) == 0x3A else { return false }
            advance()
            let childPath = path + [key]
            let duplicate = !seen.insert(key).inserted
            guard parseValue(path: childPath, keyRange: keyRange, isDuplicate: duplicate) else { return false }
            skipWhitespace()
            if index < source.length, source.character(at: index) == 0x2C {
                advance()
                skipWhitespace()
                continue
            }
            if index < source.length, source.character(at: index) == 0x7D { break }
            return false
        }
        guard index < source.length, source.character(at: index) == 0x7D else { return false }
        advance()
        return true
    }

    private mutating func parseArray(path: [String]) -> Bool {
        advance()
        skipWhitespace()
        while index < source.length, source.character(at: index) != 0x5D {
            guard parseValue(path: path + ["[]"], keyRange: NSRange(location: index, length: 0), isDuplicate: false)
            else { return false }
            skipWhitespace()
            if index < source.length, source.character(at: index) == 0x2C {
                advance()
                skipWhitespace()
                continue
            }
            if index < source.length, source.character(at: index) == 0x5D { break }
            return false
        }
        guard index < source.length, source.character(at: index) == 0x5D else { return false }
        advance()
        return true
    }

    private mutating func skipWhitespace() {
        while index < source.length, DocumentContext.isWhitespace(source.character(at: index)) { advance() }
    }

    private mutating func advance() {
        advance(to: index + 1)
    }

    private mutating func advance(to end: Int) {
        let boundedEnd = min(max(index, end), source.length)
        for position in index..<boundedEnd where source.character(at: position) == 0x0A { line += 1 }
        index = boundedEnd
    }

    private func scanStringEnd(from start: Int) -> Int {
        var position = start + 1
        var escaped = false
        while position < source.length {
            let unit = source.character(at: position)
            if escaped {
                escaped = false
            } else if unit == 0x5C {
                escaped = true
            } else if unit == 0x22 {
                return position + 1
            }
            position += 1
        }
        return source.length
    }

    private func decodeJSONString(start: Int, end: Int) -> String {
        let raw = DocumentContext.string(source, NSRange(location: start, length: max(0, end - start)))
        guard let data = raw.data(using: .utf8),
            let decoded = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? String
        else {
            return DocumentContext.unquotedPrefix(raw)
        }
        return decoded
    }

    private mutating func append(
        path: [String], keyRange: NSRange, valueRange: NSRange,
        value: String, line: Int, isDuplicate: Bool
    ) {
        output.append(
            EditorOccurrence(
                path: path, keyRange: keyRange, valueRange: valueRange,
                rawValue: value, line: line, isDuplicate: isDuplicate))
    }
}
