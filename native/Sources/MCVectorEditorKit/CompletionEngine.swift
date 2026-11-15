// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public enum CompletionKind: String, Sendable, Equatable {
    case key
    case section
    case value
    case enumValue
    case word
}

public struct CompletionCandidate: Sendable, Identifiable, Equatable {
    public var id: String
    public var label: String
    public var insertText: String
    public var kind: CompletionKind
    public var detail: String?
    public var entry: SchemaEntry?
    public var matchedRanges: [Range<Int>]
    public var score: Double

    public init(
        id: String, label: String, insertText: String, kind: CompletionKind,
        detail: String? = nil, entry: SchemaEntry? = nil,
        matchedRanges: [Range<Int>] = [], score: Double = 0
    ) {
        self.id = id
        self.label = label
        self.insertText = insertText
        self.kind = kind
        self.detail = detail
        self.entry = entry
        self.matchedRanges = matchedRanges
        self.score = score
    }
}

public struct CompletionResult: Sendable, Equatable {
    public var replaceRange: NSRange
    public var prefix: String
    public var candidates: [CompletionCandidate]

    public init(replaceRange: NSRange, prefix: String, candidates: [CompletionCandidate]) {
        self.replaceRange = replaceRange
        self.prefix = prefix
        self.candidates = candidates
    }
}

public enum CompletionEngine: Sendable {
    public static func complete(
        text: String, cursor: Int, format: ConfigFormat,
        schema: ConfigSchema?, entries: [SchemaEntry]
    ) -> CompletionResult? {
        let offset = min(max(0, cursor), (text as NSString).length)
        guard let context = DocumentContext.at(text: text, cursor: offset, format: format) else {
            guard schema == nil else { return nil }
            return wordFallback(text: text, cursor: offset, prefix: nil)
        }
        let range = replacementRange(text: text, cursor: offset, format: format, context: context)
        if context.isComment || context.isBlockScalar {
            return nil
        }

        var candidates: [CompletionCandidate]
        if context.isValue {
            candidates = valueCandidates(text: text, format: format, context: context, entries: entries)
        } else {
            candidates = keyCandidates(text: text, cursor: offset, format: format, context: context, entries: entries)
        }
        if schema == nil, candidates.isEmpty {
            return wordFallback(text: text, cursor: offset, prefix: context.prefix)
        }
        let matched = candidates.enumerated().compactMap { index, candidate -> (Int, CompletionCandidate)? in
            guard let match = fuzzyMatch(query: context.prefix, label: candidate.label) else { return nil }
            return (
                index,
                CompletionCandidate(
                    id: candidate.id, label: candidate.label, insertText: candidate.insertText,
                    kind: candidate.kind, detail: candidate.detail, entry: candidate.entry,
                    matchedRanges: match.ranges, score: candidate.score + match.score)
            )
        }.sorted {
            if $0.1.score != $1.1.score { return $0.1.score > $1.1.score }
            return $0.0 < $1.0
        }.map(\.1)
        if schema == nil, matched.isEmpty {
            return wordFallback(text: text, cursor: offset, prefix: context.prefix)
        }
        return CompletionResult(replaceRange: range, prefix: context.prefix, candidates: matched)
    }

    /// Plain text documents do not have a schema. This overload keeps local word completion available.
    public static func complete(
        text: String, cursor: Int, format: ConfigFormat?,
        schema: ConfigSchema? = nil, entries: [SchemaEntry] = []
    ) -> CompletionResult? {
        guard let format else {
            let offset = min(max(0, cursor), (text as NSString).length)
            return wordFallback(text: text, cursor: offset, prefix: nil)
        }
        return complete(text: text, cursor: cursor, format: format, schema: schema, entries: entries)
    }

    public static func fuzzyMatch(query: String, label: String) -> (score: Double, ranges: [Range<Int>])? {
        let labelCharacters = Array(label)
        let queryCharacters = Array(query)
        guard !queryCharacters.isEmpty else { return (score: 0, ranges: []) }
        guard !labelCharacters.isEmpty else { return nil }

        let foldedLabel = labelCharacters.map(fold)
        let foldedQuery = queryCharacters.map(fold)
        if foldedLabel.count >= foldedQuery.count,
            Array(foldedLabel.prefix(foldedQuery.count)) == foldedQuery
        {
            return (
                score: 100 + Double(foldedQuery.count) * 0.15,
                ranges: [0..<foldedQuery.count]
            )
        }

        let boundaries = boundaryIndices(in: labelCharacters)
        var boundaryMatches: [Int] = []
        var previousMatch: Int?
        for character in foldedQuery {
            let contiguous = previousMatch.flatMap { previous -> Int? in
                let next = previous + 1
                return next < foldedLabel.count && foldedLabel[next] == character ? next : nil
            }
            let match =
                contiguous
                ?? boundaries.first(where: { index in
                    (previousMatch == nil || index > previousMatch!) && foldedLabel[index] == character
                })
            guard let match else {
                boundaryMatches.removeAll()
                break
            }
            boundaryMatches.append(match)
            previousMatch = match
        }
        if boundaryMatches.count == foldedQuery.count {
            let boundaryScore = min(89, max(60, 80 - Double(boundaryMatches.last! - boundaryMatches.first!) * 0.2))
            return (
                score: boundaryScore,
                ranges: mergedRanges(boundaryMatches)
            )
        }

        var positions: [Int] = []
        var cursor = 0
        for character in foldedQuery {
            guard let found = foldedLabel[cursor...].firstIndex(of: character) else { return nil }
            positions.append(found)
            cursor = found + 1
        }
        let gaps = zip(positions, positions.dropFirst()).reduce(0) { $0 + max(0, $1.1 - $1.0 - 1) }
        let contiguous = zip(positions, positions.dropFirst()).filter { $1 == $0 + 1 }.count
        let score = min(59, max(1, 50 - Double(gaps) * 2 + Double(contiguous) * 4 - Double(positions.first ?? 0) * 0.2))
        return (score: score, ranges: mergedRanges(positions))
    }

    private static func keyCandidates(
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

    private static func valueCandidates(
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

    private static func replacementRange(
        text: String, cursor: Int, format: ConfigFormat,
        context: EditorCursorContext
    ) -> NSRange {
        guard !context.isValue else { return context.range }
        let source = text as NSString
        var end = NSMaxRange(context.range)
        let line = source.lineRange(for: NSRange(location: min(cursor, source.length), length: 0))
        var lineEnd = NSMaxRange(line)
        while lineEnd > line.location,
            source.character(at: lineEnd - 1) == 0x0A || source.character(at: lineEnd - 1) == 0x0D
        {
            lineEnd -= 1
        }
        if format == .json {
            if context.range.length > 0, source.character(at: context.range.location) == 0x22 {
                var probe = end
                while probe < lineEnd, DocumentContext.isWhitespace(source.character(at: probe)) { probe += 1 }
                if probe < lineEnd, source.character(at: probe) == 0x3A {
                    probe += 1
                    while probe < lineEnd, DocumentContext.isWhitespace(source.character(at: probe)) { probe += 1 }
                    end = probe
                }
            }
            return NSRange(location: context.range.location, length: max(0, end - context.range.location))
        }
        let separators: Set<unichar> =
            switch format {
            case .properties: [0x3D, 0x3A]
            case .yaml: [0x3A]
            case .toml: [0x3D]
            case .json: []
            }
        var probe = end
        while probe < lineEnd, DocumentContext.isWhitespace(source.character(at: probe)) { probe += 1 }
        if probe < lineEnd, separators.contains(source.character(at: probe)) {
            probe += 1
            while probe < lineEnd, DocumentContext.isWhitespace(source.character(at: probe)) { probe += 1 }
            end = probe
        }
        return NSRange(location: context.range.location, length: max(0, end - context.range.location))
    }

    private static func wordFallback(
        text: String, cursor: Int,
        prefix suppliedPrefix: String?
    ) -> CompletionResult? {
        let range = wordRange(text: text, cursor: cursor)
        let source = text as NSString
        let prefixEnd = min(cursor, NSMaxRange(range))
        let cursorPrefix = DocumentContext.string(
            source,
            NSRange(
                location: range.location,
                length: max(0, prefixEnd - range.location)))
        let prefix = suppliedPrefix ?? cursorPrefix
        let currentWord = DocumentContext.string(source, range).lowercased()
        let local = text
        let pattern = try? NSRegularExpression(pattern: "[\\p{L}\\p{N}_-]{3,}")
        let localRange = NSRange(location: 0, length: source.length)
        var seen = Set<String>()
        let candidates = (pattern?.matches(in: local, range: localRange) ?? []).enumerated().compactMap {
            order, match -> (Int, CompletionCandidate)? in
            let word = (local as NSString).substring(with: match.range)
            guard word.lowercased() != currentWord,
                seen.insert(word.lowercased()).inserted,
                let result = fuzzyMatch(query: prefix, label: word)
            else { return nil }
            return (
                order,
                CompletionCandidate(
                    id: "word:\(word.lowercased())", label: word, insertText: word,
                    kind: .word, matchedRanges: result.ranges, score: result.score)
            )
        }
        let ordered = candidates.sorted {
            if $0.1.score != $1.1.score { return $0.1.score > $1.1.score }
            if $0.1.label.count != $1.1.label.count { return $0.1.label.count < $1.1.label.count }
            return $0.0 < $1.0
        }.map(\.1)
        return CompletionResult(replaceRange: range, prefix: prefix, candidates: ordered)
    }

    private static func wordRange(text: String, cursor: Int) -> NSRange {
        let source = text as NSString
        let offset = min(max(0, cursor), source.length)
        var start = offset
        var end = offset
        while start > 0, isWordUnit(source.character(at: start - 1)) { start -= 1 }
        while end < source.length, isWordUnit(source.character(at: end)) { end += 1 }
        return NSRange(location: start, length: end - start)
    }

    private static func isWordUnit(_ unit: unichar) -> Bool {
        (unit >= 48 && unit <= 57) || (unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122)
            || unit == 0x5F || unit == 0x2D || unit >= 0x80
    }

    private static func encodedValue(_ value: String, entry: SchemaEntry, format: ConfigFormat) -> String {
        let shouldQuote = entry.type == .string || entry.type == .enum
        guard shouldQuote else { return value }
        if format == .properties { return value }
        if format == .json { return jsonQuoted(value) }
        if format == .toml { return jsonQuoted(value) }
        return yamlQuotedIfNeeded(value)
    }

    private static func isNumeric(_ value: JSONValue) -> Bool {
        if case .number = value { return true }
        return false
    }

    private static func entryDetail(_ entry: SchemaEntry) -> String {
        let type = entry.type.rawValue
        guard let value = entry.default, !isNull(value) else { return type }
        return "\(type) · \(value.displayText)"
    }

    private static func isNull(_ value: JSONValue) -> Bool {
        if case .null = value { return true }
        return false
    }

    private static func yamlQuotedIfNeeded(_ value: String) -> String {
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

    private static func yamlSectionInsertion(_ name: String, text: String, cursor: Int) -> String {
        let source = text as NSString
        let line = source.lineRange(for: NSRange(location: min(cursor, source.length), length: 0))
        var currentIndent = 0
        while line.location + currentIndent < NSMaxRange(line),
            source.character(at: line.location + currentIndent) == 0x20
        { currentIndent += 1 }
        let childIndent = String(repeating: " ", count: currentIndent + 2)
        return name + ":\n" + childIndent
    }

    private static func jsonQuoted(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
            let result = String(data: data, encoding: .utf8)
        else { return "\"\(value)\"" }
        return result
    }

    private static func boundaryIndices(in characters: [Character]) -> [Int] {
        var indices: [Int] = []
        for index in characters.indices {
            if index == 0 {
                indices.append(index)
                continue
            }
            let previous = characters[index - 1]
            let current = characters[index]
            if !previous.isLetter && !previous.isNumber {
                indices.append(index)
            } else if current.isUppercase && (previous.isLowercase || previous.isNumber) {
                indices.append(index)
            }
        }
        return indices
    }

    private static func fold(_ character: Character) -> String {
        String(character).folding(
            options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
    }

    private static func mergedRanges(_ indices: [Int]) -> [Range<Int>] {
        guard let first = indices.first else { return [] }
        var result: [Range<Int>] = []
        var start = first
        var end = first + 1
        for index in indices.dropFirst() {
            if index == end {
                end += 1
            } else {
                result.append(start..<end)
                start = index
                end = index + 1
            }
        }
        result.append(start..<end)
        return result
    }
}
