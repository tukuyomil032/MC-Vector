// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension DocumentContext {
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

}
