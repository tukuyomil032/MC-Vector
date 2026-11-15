// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension CompletionEngine {
    static func encodedValue(_ value: String, entry: SchemaEntry, format: ConfigFormat) -> String {
        let shouldQuote = entry.type == .string || entry.type == .enum
        guard shouldQuote else { return value }
        if format == .properties { return value }
        if format == .json { return jsonQuoted(value) }
        if format == .toml { return jsonQuoted(value) }
        return yamlQuotedIfNeeded(value)
    }

    static func isNumeric(_ value: JSONValue) -> Bool {
        if case .number = value { return true }
        return false
    }

    static func entryDetail(_ entry: SchemaEntry) -> String {
        let type = entry.type.rawValue
        guard let value = entry.default, !isNull(value) else { return type }
        let displayText = value.displayText
        guard !displayText.isEmpty else { return type }
        return "\(type) · \(displayText)"
    }

    static func isNull(_ value: JSONValue) -> Bool {
        if case .null = value { return true }
        return false
    }

    static func yamlQuotedIfNeeded(_ value: String) -> String {
        let reserved = Set(["true", "false", "null", "~", "yes", "no", "on", "off"])
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let numeric = Double(value) != nil
        let indicatorCharacters = "-?:,[]{}#&*!|>'\"%@`"
        let startsWithIndicator = value.first.map { indicatorCharacters.contains($0) } ?? false
        let needsQuotes =
            value.isEmpty || trimmed != value || reserved.contains(value.lowercased()) || numeric
            || startsWithIndicator || value.range(of: ":\\s|\\s#|[\\n\\r]", options: .regularExpression) != nil
        return needsQuotes ? jsonQuoted(value) : value
    }

    static func jsonQuoted(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
            let result = String(data: data, encoding: .utf8)
        else { return "\"\(value)\"" }
        return result
    }
}
