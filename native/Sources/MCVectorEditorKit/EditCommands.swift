// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

/// A source edit and the selection to restore after applying it.
public struct TextEdit: Sendable, Equatable {
    public var range: NSRange
    public var replacement: String
    public var selection: NSRange

    public init(range: NSRange, replacement: String, selection: NSRange) {
        self.range = range
        self.replacement = replacement
        self.selection = selection
    }
}

/// Line-oriented editing commands shared by the native file editor.
public enum EditCommands: Sendable {
    /// Returns `nil` when the format has no line-comment syntax.
    public static func toggleComment(text: String, selection: NSRange, format: ConfigFormat?) -> TextEdit? {
        guard let format, format != .json else { return nil }
        let comment = "#"
        let source = text as NSString
        let selected = selectedLines(in: source, selection: selection)
        let original = source.substring(with: selected.range)
        let lines = original.components(separatedBy: "\n")
        let nonblank = lines.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let shouldUncomment =
            !nonblank.isEmpty
            && nonblank.allSatisfy { line in
                let index = leadingWhitespaceLength(in: line)
                return (line as NSString).substring(from: index).hasPrefix(comment)
            }

        var operations: [OffsetChange] = []
        var absoluteLineStart = selected.range.location
        let editedLines = lines.map { line -> String in
            defer { absoluteLineStart += (line as NSString).length + 1 }
            guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return line }
            let nsLine = line as NSString
            let indent = leadingWhitespaceLength(in: line)
            let remainder = nsLine.substring(from: indent)
            guard shouldUncomment else {
                operations.append(.init(location: absoluteLineStart + indent, removedLength: 0, insertedLength: 2))
                return nsLine.replacingCharacters(in: NSRange(location: indent, length: 0), with: "# ")
            }
            guard remainder.hasPrefix(comment) else { return line }
            var removalLength = 1
            if remainder.hasPrefix("# ") { removalLength = 2 } else if remainder.hasPrefix("#\t") { removalLength = 2 }
            operations.append(
                .init(location: absoluteLineStart + indent, removedLength: removalLength, insertedLength: 0))
            return nsLine.replacingCharacters(in: NSRange(location: indent, length: removalLength), with: "")
        }

        return makeEdit(
            source: source,
            selected: selected,
            replacement: editedLines.joined(separator: "\n"),
            selection: selection,
            changes: operations
        )
    }

    public static func indent(text: String, selection: NSRange, unit: String) -> TextEdit {
        transformIndentation(text: text, selection: selection, unit: unit, outdent: false)
    }

    public static func outdent(text: String, selection: NSRange, unit: String) -> TextEdit {
        transformIndentation(text: text, selection: selection, unit: unit, outdent: true)
    }

    public static func indentUnit(for format: ConfigFormat?) -> String {
        switch format {
        case .yaml, .json: return "  "
        case .toml, .properties: return "    "
        case nil: return "\t"
        }
    }

    private static func transformIndentation(text: String, selection: NSRange, unit: String, outdent: Bool) -> TextEdit
    {
        let source = text as NSString
        let selected = selectedLines(in: source, selection: selection)
        let original = source.substring(with: selected.range)
        let lines = original.components(separatedBy: "\n")
        let unitLength = (unit as NSString).length
        var operations: [OffsetChange] = []
        var absoluteLineStart = selected.range.location
        let editedLines = lines.map { line -> String in
            defer { absoluteLineStart += (line as NSString).length + 1 }
            guard unitLength > 0 else { return line }
            let nsLine = line as NSString
            if !outdent {
                operations.append(.init(location: absoluteLineStart, removedLength: 0, insertedLength: unitLength))
                return unit + line
            }
            let removeLength = outdentLength(from: line, unit: unit)
            guard removeLength > 0 else { return line }
            operations.append(.init(location: absoluteLineStart, removedLength: removeLength, insertedLength: 0))
            return nsLine.substring(from: removeLength)
        }

        return makeEdit(
            source: source,
            selected: selected,
            replacement: editedLines.joined(separator: "\n"),
            selection: selection,
            changes: operations
        )
    }

    private static func outdentLength(from line: String, unit: String) -> Int {
        let nsLine = line as NSString
        let unitNS = unit as NSString
        if unitNS.length > 0, nsLine.length >= unitNS.length,
            nsLine.substring(to: unitNS.length) == unit
        {
            return unitNS.length
        }

        // A partially indented line still moves left by as much of the chosen
        // space indentation as it contains. Tabs are removed as one unit.
        if !unit.isEmpty, unit.allSatisfy({ $0 == " " }) {
            var count = 0
            while count < unitNS.length, count < nsLine.length,
                nsLine.character(at: count) == 0x20
            {
                count += 1
            }
            return count
        }
        if unit == "\t", nsLine.length > 0, nsLine.character(at: 0) == 0x09 { return 1 }
        return 0
    }

    private static func leadingWhitespaceLength(in line: String) -> Int {
        let nsLine = line as NSString
        var index = 0
        while index < nsLine.length {
            let character = nsLine.character(at: index)
            guard character == 0x20 || character == 0x09 else { break }
            index += 1
        }
        return index
    }

    private struct SelectedLines {
        let range: NSRange
    }

    private static func selectedLines(in source: NSString, selection: NSRange) -> SelectedLines {
        let start = min(max(selection.location == NSNotFound ? 0 : selection.location, 0), source.length)
        let rawLength = selection.length == NSNotFound ? 0 : max(selection.length, 0)
        let length = min(rawLength, source.length - start)
        let lastCharacter = length == 0 ? start : start + length - 1
        let firstLineStart = lineStart(beforeOrAt: start, in: source)
        let lastLineStart = lineStart(beforeOrAt: lastCharacter, in: source)
        let newline = source.range(
            of: "\n", options: .literal,
            range: NSRange(location: lastLineStart, length: source.length - lastLineStart)
        ).location
        let lineEnd = newline == NSNotFound ? source.length : newline
        return SelectedLines(range: NSRange(location: firstLineStart, length: max(0, lineEnd - firstLineStart)))
    }

    private static func lineStart(beforeOrAt offset: Int, in source: NSString) -> Int {
        guard offset > 0 else { return 0 }
        let search = NSRange(location: 0, length: min(offset, source.length))
        let newline = source.range(of: "\n", options: [.backwards, .literal], range: search)
        return newline.location == NSNotFound ? 0 : newline.location + 1
    }

    private struct OffsetChange {
        let location: Int
        let removedLength: Int
        let insertedLength: Int
    }

    private static func makeEdit(
        source: NSString,
        selected: SelectedLines,
        replacement: String,
        selection: NSRange,
        changes: [OffsetChange]
    ) -> TextEdit {
        let clampedLocation = min(max(selection.location == NSNotFound ? 0 : selection.location, 0), source.length)
        let clampedLength = min(
            max(selection.length == NSNotFound ? 0 : selection.length, 0), source.length - clampedLocation)
        let newStart = mapOffset(clampedLocation, changes: changes)
        let newEnd = mapOffset(clampedLocation + clampedLength, changes: changes)
        return TextEdit(
            range: selected.range,
            replacement: replacement,
            selection: NSRange(location: newStart, length: max(0, newEnd - newStart))
        )
    }

    private static func mapOffset(_ offset: Int, changes: [OffsetChange]) -> Int {
        var delta = 0
        for change in changes.sorted(by: { $0.location < $1.location }) {
            if offset < change.location { break }
            if change.removedLength > 0, offset < change.location + change.removedLength {
                return max(0, change.location + delta)
            }
            if offset == change.location, change.removedLength == 0 {
                delta += change.insertedLength
                continue
            }
            delta += change.insertedLength - change.removedLength
        }
        return max(0, offset + delta)
    }
}
