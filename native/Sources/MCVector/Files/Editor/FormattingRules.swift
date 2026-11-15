// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorEditorKit
import TextFormation
import TextFormationPlugin
import TextStory

enum FormattingRules {
    @MainActor
    static func plugin(for format: ConfigFormat?) -> TextFormationPlugin {
        let pairs: [(String, String)]
        switch format {
        case .json:
            pairs = [("{", "}"), ("[", "]"), ("(", ")"), ("\"", "\"")]
        case .yaml, .toml:
            pairs = [("[", "]"), ("{", "}"), ("\"", "\""), ("'", "'")]
        case .properties:
            pairs = [("\"", "\"")]
        case nil:
            pairs = []
        }

        var filters: [any Filter] = []
        for (open, close) in pairs {
            var pairFilters: [any Filter] = [
                SkipFilter(matching: close),
                OpenPairReplacementFilter(open: open, close: close),
            ]
            if open == "{" || open == "[" {
                pairFilters.append(NewlineWithinPairFilter(open: open, close: close))
            }
            pairFilters.append(ClosePairFilter(open: open, close: close))
            pairFilters.append(DeleteCloseFilter(open: open, close: close))
            // A pair's recognizer must not prevent other pairs from observing
            // the same keystroke and updating their own recognition state.
            filters.append(
                CompositeFilter(filters: pairFilters) { _, action in
                    action == .discard ? .discard : .none
                })
        }
        filters.append(ReturnWhitespaceFilter())

        let unit = EditCommands.indentUnit(for: format)
        let providers = WhitespaceProviders(
            leadingWhitespace: { range, interface in
                indentation(at: range.location, in: interface, unit: unit, format: format)
            },
            trailingWhitespace: WhitespaceProviders.removeAllProvider
        )
        return TextFormationPlugin(filters: filters, whitespaceProviders: providers)
    }

    private static func indentation(
        at location: Int,
        in interface: any TextInterface,
        unit: String,
        format: ConfigFormat?
    ) -> String {
        let start = interface.findStartOfLine(containing: location)
        guard start > 0 else { return "" }
        let previousStart = interface.findStartOfLine(containing: start - 1)
        let previousRange = NSRange(location: previousStart, length: start - previousStart)
        guard let previous = interface.substring(from: previousRange) else { return "" }
        var indentation = String(previous.prefix { $0 == " " || $0 == "\t" })
        let previousContent = previous.trimmingCharacters(in: .whitespacesAndNewlines)
        if previousContent.hasSuffix("{") || previousContent.hasSuffix("[")
            || (format == .yaml && previousContent.hasSuffix(":"))
        {
            indentation += unit
        }

        let currentEnd = interface.findEndOfLine(containing: location)
        let currentRange = NSRange(location: start, length: currentEnd - start)
        let current =
            interface.substring(from: currentRange)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if (current.hasPrefix("}") || current.hasPrefix("]")) && indentation.hasSuffix(unit) {
            indentation.removeLast(unit.count)
        }
        return indentation
    }
}

/// Keeps indentation on Return while removing trailing spaces from the line
/// being left, including lines made entirely of indentation.
private struct ReturnWhitespaceFilter: Filter {
    func processMutation(
        _ mutation: TextMutation,
        in interface: any TextInterface,
        with providers: WhitespaceProviders
    ) -> FilterAction {
        guard mutation.string == "\n" else { return .none }

        interface.applyMutation(mutation)
        let insertion = mutation.range.location + 1
        let indentation = providers.leadingWhitespace(NSRange(location: insertion, length: 0), interface)
        interface.insertString(indentation, at: insertion)

        let start = interface.findStartOfLine(containing: mutation.range.location)
        let previousRange = NSRange(location: start, length: mutation.range.location - start)
        let previous = interface.substring(from: previousRange) ?? ""
        let trailingCount = previous.reversed().prefix { $0 == " " || $0 == "\t" }
            .reduce(0) { $0 + $1.utf16.count }
        if trailingCount > 0 {
            interface.replaceString(
                in: NSRange(location: mutation.range.location - trailingCount, length: trailingCount),
                with: ""
            )
        }
        interface.selectedRange = NSRange(
            location: insertion + indentation.utf16.count - trailingCount,
            length: 0
        )
        return .discard
    }
}
