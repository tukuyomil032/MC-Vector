// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

extension CompletionEngine {
    static func replacementRange(
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

    static func wordFallback(
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

    static func wordRange(text: String, cursor: Int) -> NSRange {
        let source = text as NSString
        let offset = min(max(0, cursor), source.length)
        var start = offset
        var end = offset
        while start > 0, isWordUnit(source.character(at: start - 1)) { start -= 1 }
        while end < source.length, isWordUnit(source.character(at: end)) { end += 1 }
        return NSRange(location: start, length: end - start)
    }

    static func isWordUnit(_ unit: unichar) -> Bool {
        (unit >= 48 && unit <= 57) || (unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122)
            || unit == 0x5F || unit == 0x2D || unit >= 0x80
    }

    static func yamlSectionInsertion(_ name: String, text: String, cursor: Int) -> String {
        let source = text as NSString
        let line = source.lineRange(for: NSRange(location: min(cursor, source.length), length: 0))
        var currentIndent = 0
        while line.location + currentIndent < NSMaxRange(line),
            source.character(at: line.location + currentIndent) == 0x20
        { currentIndent += 1 }
        let childIndent = String(repeating: " ", count: currentIndent + 2)
        return name + ":\n" + childIndent
    }
}
