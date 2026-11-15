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
            guard index < source.length, index <= cursor else { break }
            if let context = scanCurrentToken() { return context }
        }
        return contextAtCursor()
    }

    private mutating func scanCurrentToken() -> EditorCursorContext? {
        let unit = source.character(at: index)
        if unit == 0x22 { return scanStringToken() }
        switch unit {
        case 0x7B: openObject()
        case 0x5B: openArray()
        case 0x7D, 0x5D:
            if let context = emptyValueBeforeDelimiter() { return context }
            closeContainer()
        case 0x3A: consumeColon()
        case 0x2C:
            if let context = emptyValueBeforeDelimiter() { return context }
            consumeComma()
        default: return scanScalarToken()
        }
        return nil
    }

    private mutating func scanStringToken() -> EditorCursorContext? {
        let start = index
        let isKey = frames.last?.kind == .object && frames.last?.state == .keyOrEnd
        let endOfLine = source.lineRange(for: NSRange(location: cursor, length: 0))
        var lineEnd = NSMaxRange(endOfLine)
        while lineEnd > endOfLine.location,
            source.character(at: lineEnd - 1) == 0x0A || source.character(at: lineEnd - 1) == 0x0D
        {
            lineEnd -= 1
        }
        let end = scanStringEnd(from: start, limit: lineEnd)
        let hasClosingQuote = end > start && source.character(at: end - 1) == 0x22
        let contentStart = start + 1
        let tokenEnd = hasClosingQuote ? end : min(lineEnd, max(cursor, contentStart))
        let cursorIsInToken =
            cursor >= start
            && (cursor < tokenEnd || (!hasClosingQuote && cursor == tokenEnd))
        if cursorIsInToken {
            return stringTokenContext(
                start: start, tokenEnd: tokenEnd, contentStart: contentStart,
                hasClosingQuote: hasClosingQuote, isKey: isKey)
        }
        let decoded = decodeJSONString(start: start, end: end)
        index = end
        if isKey {
            recordCompletedKey(decoded)
        } else {
            consumeValue()
        }
        return nil
    }

    private func stringTokenContext(
        start: Int, tokenEnd: Int, contentStart: Int, hasClosingQuote: Bool, isKey: Bool
    ) -> EditorCursorContext {
        let contentEnd = max(contentStart, tokenEnd - (hasClosingQuote ? 1 : 0))
        let prefixEnd = min(cursor, contentEnd)
        let rawPrefix = DocumentContext.string(
            source, NSRange(location: contentStart, length: max(0, prefixEnd - contentStart)))
        let prefix = DocumentContext.unquotedPrefix("\"" + rawPrefix)
        let tokenRange = NSRange(location: start, length: max(0, tokenEnd - start))
        if isKey, let frame = frames.last {
            return EditorCursorContext(
                path: frame.path, range: tokenRange, isValue: false,
                prefix: prefix, rawValue: nil, siblings: frame.siblings,
                isHeader: false, isBlockScalar: false, line: 0)
        }
        return EditorCursorContext(
            path: currentValuePath(), range: tokenRange, isValue: true,
            prefix: prefix,
            rawValue: DocumentContext.string(
                source, NSRange(location: start, length: max(0, tokenEnd - start))),
            siblings: [], isHeader: false, isBlockScalar: false, line: 0)
    }

    private mutating func recordCompletedKey(_ key: String) {
        guard var frame = frames.last else { return }
        frame.pendingKey = key
        frame.siblings.insert(key)
        frame.state = .colon
        frames[frames.count - 1] = frame
    }

    private mutating func openObject() {
        let path = currentValuePath()
        consumeValue()
        frames.append(
            JSONCursorFrame(kind: .object, path: path, state: .keyOrEnd, pendingKey: nil, siblings: []))
        index += 1
    }

    private mutating func openArray() {
        let path = currentValuePath()
        consumeValue()
        frames.append(
            JSONCursorFrame(kind: .array, path: path, state: .valueOrEnd, pendingKey: nil, siblings: []))
        index += 1
    }

    private mutating func closeContainer() {
        if !frames.isEmpty { frames.removeLast() }
        index += 1
    }

    private mutating func consumeColon() {
        if var frame = frames.last, frame.kind == .object {
            frame.state = .value
            frames[frames.count - 1] = frame
        }
        index += 1
    }

    private mutating func consumeComma() {
        if var frame = frames.last {
            frame.state = frame.kind == .object ? .keyOrEnd : .valueOrEnd
            frame.pendingKey = nil
            frames[frames.count - 1] = frame
        }
        index += 1
    }

    private func emptyValueBeforeDelimiter() -> EditorCursorContext? {
        guard index == cursor, let frame = frames.last,
            frame.kind == .object, frame.state == .value
        else { return nil }
        return emptyValueContext(path: frame.path + [frame.pendingKey ?? ""])
    }

    private func contextAtCursor() -> EditorCursorContext? {
        guard let frame = frames.last else { return nil }
        switch (frame.kind, frame.state) {
        case (.object, .keyOrEnd):
            return EditorCursorContext(
                path: frame.path, range: NSRange(location: cursor, length: 0), isValue: false,
                prefix: "", rawValue: nil, siblings: frame.siblings, isHeader: false,
                isBlockScalar: false, line: 0)
        case (.object, .value):
            return emptyValueContext(path: frame.path + [frame.pendingKey ?? ""])
        case (.array, .valueOrEnd):
            return emptyValueContext(path: frame.path + ["[]"])
        default: return nil
        }
    }

    private func emptyValueContext(path: [String]) -> EditorCursorContext {
        EditorCursorContext(
            path: path, range: NSRange(location: cursor, length: 0), isValue: true,
            prefix: "", rawValue: nil, siblings: [], isHeader: false,
            isBlockScalar: false, line: 0)
    }

    private mutating func scanScalarToken() -> EditorCursorContext? {
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
                siblings: [], isHeader: false, isBlockScalar: false, line: 0)
        }
        consumeValue()
        return nil
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
