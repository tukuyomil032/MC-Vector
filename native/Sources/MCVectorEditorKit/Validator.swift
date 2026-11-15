// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public enum DiagnosticKind: Sendable, Equatable {
    case typeMismatch(expected: ValueType)
    case outOfRange(min: Double?, max: Double?)
    case notAllowed(values: [String])
    case duplicateKey
}

public struct Diagnostic: Sendable, Equatable, Identifiable {
    public var id: String
    public var range: NSRange
    public var line: Int
    public var path: String
    public var kind: DiagnosticKind

    public init(id: String, range: NSRange, line: Int, path: String, kind: DiagnosticKind) {
        self.id = id
        self.range = range
        self.line = line
        self.path = path
        self.kind = kind
    }
}

public enum Validator: Sendable {
    public static func diagnostics(text: String, format: ConfigFormat, entries: [SchemaEntry]) -> [Diagnostic] {
        guard !entries.isEmpty else { return [] }
        var output: [Diagnostic] = []
        var seen = Set<[String]>()
        for occurrence in DocumentContext.occurrences(text: text, format: format) {
            guard let entry = DocumentContext.matchingEntry(path: occurrence.path, format: format, entries: entries)
            else {
                continue
            }
            let path = occurrence.path.joined(separator: ".")
            let duplicate = format == .json ? occurrence.isDuplicate : !seen.insert(occurrence.path).inserted
            if duplicate {
                output.append(diagnostic(.duplicateKey, occurrence: occurrence, path: path, key: true))
            }
            // The JSON scanner may emit a key-only duplicate marker before
            // scanning its value. Validate the actual scalar occurrence once.
            if format == .json, occurrence.isDuplicate, occurrence.valueRange.length == 0 { continue }
            if isEmptyValue(occurrence.rawValue) { continue }
            if let issue = valueIssue(occurrence.rawValue, format: format, entry: entry) {
                output.append(diagnostic(issue, occurrence: occurrence, path: path, key: false))
            }
        }
        return output
    }

    private static func valueIssue(_ rawValue: String, format: ConfigFormat, entry: SchemaEntry) -> DiagnosticKind? {
        let raw = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        switch entry.type {
        case .string, .list, .map, .section:
            return nil
        case .bool:
            let value = format == .yaml || format == .properties ? raw.lowercased() : raw
            return value == "true" || value == "false" ? nil : .typeMismatch(expected: .bool)
        case .enum:
            guard let values = entry.values else { return nil }
            let value = DocumentContext.stripQuotes(raw)
            return values.contains(value) ? nil : .notAllowed(values: values)
        case .int, .float:
            guard let number = numericValue(raw, integer: entry.type == .int, format: format) else {
                return .typeMismatch(expected: entry.type)
            }
            if let min = entry.min, number < min { return .outOfRange(min: entry.min, max: entry.max) }
            if let max = entry.max, number > max { return .outOfRange(min: entry.min, max: entry.max) }
            return nil
        }
    }

    private static func isEmptyValue(_ rawValue: String) -> Bool {
        rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func numericValue(_ raw: String, integer: Bool, format: ConfigFormat) -> Double? {
        guard !raw.isEmpty else { return nil }
        var token = raw
        // TOML permits underscores between numeric digits. Reject misplaced
        // underscores rather than silently turning malformed text into a number.
        if format == .toml, token.contains("_") {
            let characters = Array(token)
            for index in characters.indices where characters[index] == "_" {
                guard index > 0, index + 1 < characters.count,
                    characters[index - 1].isHexDigit, characters[index + 1].isHexDigit
                else { return nil }
            }
            token.removeAll { $0 == "_" }
        }
        if integer {
            let digits = token.hasPrefix("+") || token.hasPrefix("-") ? token.dropFirst() : token[...]
            guard !digits.isEmpty, digits.utf8.allSatisfy({ (48...57).contains($0) }) else { return nil }
        }
        guard let value = Double(token), value.isFinite else { return nil }
        return value
    }

    private static func diagnostic(
        _ kind: DiagnosticKind,
        occurrence: EditorOccurrence,
        path: String,
        key: Bool
    ) -> Diagnostic {
        let range = key ? occurrence.keyRange : occurrence.valueRange
        let tag: String
        switch kind {
        case .typeMismatch: tag = "type"
        case .outOfRange: tag = "range"
        case .notAllowed: tag = "enum"
        case .duplicateKey: tag = "duplicate"
        }
        return Diagnostic(
            id: "\(path):\(range.location):\(range.length):\(tag)",
            range: range,
            line: occurrence.line,
            path: path,
            kind: kind
        )
    }
}
