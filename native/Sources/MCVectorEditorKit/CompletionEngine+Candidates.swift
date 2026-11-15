// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension CompletionEngine {
    static func rankCandidates(
        _ candidates: [CompletionCandidate], prefix: String, preserveUnmatchedValues: Bool
    ) -> [CompletionCandidate] {
        let rankedMatches = candidates.enumerated().compactMap { index, candidate -> (Int, CompletionCandidate)? in
            guard let match = fuzzyMatch(query: prefix, label: candidate.label) else { return nil }
            let defaultPriority = prefix.isEmpty ? candidate.score : 0
            return (
                index,
                CompletionCandidate(
                    id: candidate.id, label: candidate.label, insertText: candidate.insertText,
                    kind: candidate.kind, detail: candidate.detail, entry: candidate.entry,
                    matchedRanges: match.ranges, score: defaultPriority + match.score)
            )
        }
        let matchedIndices = Set(rankedMatches.map(\.0))
        let matched = rankedMatches.sorted {
            if $0.1.score != $1.1.score { return $0.1.score > $1.1.score }
            return $0.0 < $1.0
        }.map(\.1)
        guard preserveUnmatchedValues, let entry = candidates.first?.entry,
            entry.type == .bool || entry.type == .enum || entry.values != nil
        else { return matched }

        let schemaOrder = entry.type == .bool ? ["true", "false"] : entry.values ?? []
        var orderByValue: [String: Int] = [:]
        for (index, value) in schemaOrder.enumerated() where orderByValue[value] == nil {
            orderByValue[value] = index
        }
        let unmatched = candidates.enumerated().filter { !matchedIndices.contains($0.offset) }.sorted {
            let lhsOrder = orderByValue[$0.element.label] ?? Int.max
            let rhsOrder = orderByValue[$1.element.label] ?? Int.max
            if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
            return $0.offset < $1.offset
        }.map { _, candidate in
            CompletionCandidate(
                id: candidate.id, label: candidate.label, insertText: candidate.insertText,
                kind: candidate.kind, detail: candidate.detail, entry: candidate.entry,
                matchedRanges: [], score: 0)
        }
        return matched + unmatched
    }

    static func keyCandidates(
        text: String, cursor: Int, format: ConfigFormat,
        context: EditorCursorContext, entries: [SchemaEntry]
    ) -> [CompletionCandidate] {
        let parent = context.path
        var nextEntries: [(String, SchemaEntry, Bool)] = []
        for entry in entries {
            let segments = DocumentContext.entryPath(entry, format: format)
            guard segments.count > parent.count,
                DocumentContext.schemaPrefixMatches(Array(segments.prefix(parent.count)), actual: parent)
            else { continue }
            let segment = segments[parent.count]
            guard segment != "*", !segment.isEmpty else { continue }
            let isSection = entry.type == .section || segments.count > parent.count + 1
            if context.isHeader && !isSection { continue }
            nextEntries.append((segment, entry, isSection))
        }

        var keyed: [(name: String, entry: SchemaEntry, isSection: Bool)] = []
        var positions: [String: Int] = [:]
        for (name, entry, isSection) in nextEntries {
            if let position = positions[name] {
                keyed[position].isSection = keyed[position].isSection || isSection
                if entry.type == .section { keyed[position].entry = entry }
            } else {
                positions[name] = keyed.count
                keyed.append((name, entry, isSection))
            }
        }
        if format == .yaml, !keyed.isEmpty {
            let existing = DocumentContext.yamlSiblingNames(
                text: text, cursor: cursor, candidates: Set(keyed.map(\.name)))
            keyed.removeAll { existing.contains($0.name) }
        } else if format == .json, !context.siblings.isEmpty {
            keyed.removeAll { context.siblings.contains($0.name) }
        }

        return keyed.map { item in
            let name = item.name
            let entry = item.entry
            let kind: CompletionKind = item.isSection ? .section : .key
            let insertion: String
            switch format {
            case .properties: insertion = name + "="
            case .yaml:
                insertion = kind == .section ? yamlSectionInsertion(name, text: text, cursor: cursor) : name + ": "
            case .toml: insertion = context.isHeader ? name : name + " = "
            case .json: insertion = jsonQuoted(name) + ": "
            }
            return CompletionCandidate(
                id: "key:\(format.rawValue):\((parent + [name]).joined(separator: "."))",
                label: name, insertText: insertion, kind: kind,
                detail: item.isSection ? "section" : entryDetail(entry), entry: entry)
        }
    }

    static func valueCandidates(
        text: String, format: ConfigFormat,
        context: EditorCursorContext, entries: [SchemaEntry]
    ) -> [CompletionCandidate] {
        guard let entry = DocumentContext.matchingEntry(path: context.path, format: format, entries: entries) else {
            return []
        }
        var rawValues: [(String, CompletionKind, Bool)] = []
        if let value = entry.default, case .null = value {
            // Null defaults are not suggestions.
        } else if let value = entry.default {
            if !(format == .json && isNumeric(value)) {
                rawValues.append((value.displayText, entry.type == .enum ? .enumValue : .value, true))
            }
        }
        switch entry.type {
        case .bool:
            for value in ["true", "false"] where !rawValues.contains(where: { $0.0 == value }) {
                rawValues.append((value, .value, false))
            }
        case .enum, .string:
            for value in entry.values ?? [] where !rawValues.contains(where: { $0.0 == value }) {
                rawValues.append((value, entry.type == .enum ? .enumValue : .value, false))
            }
        case .int, .float, .list, .map, .section: break
        }
        return rawValues.map { value, kind, isDefault in
            CompletionCandidate(
                id: "value:\(entry.path):\(value)", label: value,
                insertText: encodedValue(value, entry: entry, format: format), kind: kind,
                detail: entryDetail(entry),
                entry: entry, score: isDefault ? 0.5 : 0)
        }
    }
}
