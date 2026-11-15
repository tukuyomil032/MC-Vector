// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

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
            output.append(
                EditorOccurrence(
                    path: path, keyRange: keyRange, valueRange: NSRange(location: start, length: end - start),
                    rawValue: raw, line: startLine, isDuplicate: isDuplicate))
            return end > start + 1 && source.character(at: end - 1) == 0x22
        default:
            while index < source.length,
                !DocumentContext.isWhitespace(source.character(at: index)),
                ![0x2C, 0x5D, 0x7D].contains(source.character(at: index))
            { advance() }
            guard index > start else { return false }
            let range = NSRange(location: start, length: index - start)
            output.append(
                EditorOccurrence(
                    path: path, keyRange: keyRange, valueRange: range,
                    rawValue: DocumentContext.string(source, range), line: startLine, isDuplicate: isDuplicate))
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

}
