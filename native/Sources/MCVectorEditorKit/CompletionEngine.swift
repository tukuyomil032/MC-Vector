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

        let candidates: [CompletionCandidate]
        if context.isValue {
            candidates = valueCandidates(text: text, format: format, context: context, entries: entries)
        } else {
            candidates = keyCandidates(text: text, cursor: offset, format: format, context: context, entries: entries)
        }
        if schema == nil, candidates.isEmpty {
            return wordFallback(text: text, cursor: offset, prefix: context.prefix)
        }
        let orderedCandidates = rankCandidates(
            candidates, prefix: context.prefix, preserveUnmatchedValues: context.isValue)
        if schema == nil, orderedCandidates.isEmpty {
            return wordFallback(text: text, cursor: offset, prefix: context.prefix)
        }
        return CompletionResult(replaceRange: range, prefix: context.prefix, candidates: orderedCandidates)
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
}
