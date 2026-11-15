// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import STTextView

/// Colors key=value files (server.properties, .conf, .cfg), which have no
/// tree-sitter grammar among the bundled ones: comments (`#`, `!`, `;`),
/// [sections], the key before the first `=` or `:`, and that separator. Values
/// keep the text color. Only the lines an edit touched are colored again.
struct IniHighlightPlugin: STPlugin {
    func setUp(context: any Context) {
        context.events.onDidChangeText { affectedRange, replacementString in
            let manager = context.textView.textContentManager
            let range = NSRange(affectedRange, in: manager)
            let changed = NSRange(location: range.location, length: replacementString?.utf16.count ?? 0)
            IniHighlighter.highlight(context.textView, around: changed)
        }
    }

    func makeCoordinator(context: CoordinatorContext) {
        // STTextView makes coordinators when it moves into the window, which
        // happens inside a layout pass; coloring then would ask for layout
        // during layout and AppKit throws. Color on the next turn instead.
        let textView = context.textView
        DispatchQueue.main.async { [weak textView] in
            guard let textView else { return }
            IniHighlighter.highlight(textView, around: nil)
        }
    }
}

@MainActor
enum IniHighlighter {
    /// Colors the lines that `range` touches, or the whole text when nil.
    static func highlight(_ textView: STTextView, around range: NSRange?) {
        guard let storage = (textView.textContentManager as? NSTextContentStorage)?.textStorage else { return }
        let text = storage.mutableString
        let target: NSRange
        if let range {
            let clamped = NSRange(location: min(range.location, text.length),
                                  length: min(range.length, text.length - min(range.location, text.length)))
            target = text.lineRange(for: clamped)
        } else {
            target = NSRange(location: 0, length: text.length)
        }
        guard let textRange = NSTextRange(target, in: textView.textContentManager) else { return }
        let layout = textView.textLayoutManager
        layout.removeRenderingAttribute(.foregroundColor, for: textRange)

        text.enumerateSubstrings(in: target, options: [.byLines, .substringNotRequired]) { _, line, _, _ in
            for (color, part) in parts(of: text, line: line) {
                guard let partRange = NSTextRange(part, in: textView.textContentManager) else { continue }
                layout.addRenderingAttribute(.foregroundColor, value: color, for: partRange)
            }
        }
    }

    /// The colored pieces of one line.
    static func parts(of text: NSString, line: NSRange) -> [(NSColor, NSRange)] {
        var start = line.location
        let end = line.location + line.length
        let whitespace = CharacterSet.whitespaces
        while start < end, let scalar = UnicodeScalar(text.character(at: start)), whitespace.contains(scalar) {
            start += 1
        }
        guard start < end else { return [] }
        let first = text.character(at: start)
        let rest = NSRange(location: start, length: end - start)
        switch first {
        case 0x23, 0x21, 0x3B: // # ! ;
            return [(SyntaxColors.iniComment, rest)]
        case 0x5B: // [
            return [(SyntaxColors.iniSection, rest)]
        default:
            let separator = text.rangeOfCharacter(from: CharacterSet(charactersIn: "=:"), range: rest)
            guard separator.location != NSNotFound else { return [(SyntaxColors.iniKey, rest)] }
            return [
                (SyntaxColors.iniKey, NSRange(location: start, length: separator.location - start)),
                (SyntaxColors.iniSeparator, separator),
            ]
        }
    }
}
