// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import STTextView
import SwiftUI

/// STTextView (TextKit 2) for one document: monospaced text, line numbers, the
/// current line highlighted, no wrapping and no minimap (FILE-007), Find (⌘F)
/// through NSTextFinder, and the text view's own undo and redo. The view is
/// made once per document, because a highlighter's language is fixed when it
/// is added.
struct CodeTextView: NSViewRepresentable {
    let document: EditorDocument
    let style: Style

    /// What the editor settings and appearance decide about the text view.
    struct Style: Equatable {
        var themeID: String
        var isDark: Bool
        var fontSize: Double
        var wrapLines: Bool
        var showInvisibles: Bool

        var themeKey: String { "\(themeID)-\(isDark)" }

        @MainActor var palette: EditorTheme.Palette {
            EditorThemes.theme(id: themeID)?.palette(dark: isDark) ?? .fallback
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(document: document, assist: EditorAssistController(document: document))
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = EditorTextView.scrollableTextView()
        // SwiftUI already lays the editor out below the toolbar. Letting the
        // scroll view follow the window's safe area as well makes the two
        // adjust each other during layout until AppKit throws.
        scrollView.automaticallyAdjustsContentInsets = false
        scrollView.contentInsets = NSEdgeInsetsZero
        guard let textView = scrollView.documentView as? EditorTextView else { return scrollView }
        textView.showsLineNumbers = true
        textView.highlightSelectedLine = true
        apply(style, to: textView, scrollView: scrollView)
        context.coordinator.appliedStyle = style
        textView.isIncrementalSearchingEnabled = true
        textView.textFinder.incrementalSearchingShouldDimContentView = true
        textView.text = document.initialText
        textView.textSelection = NSRange(location: 0, length: 0)

        switch document.language.highlighting {
        case .treeSitter(let language, let queries):
            textView.addPlugin(SyntaxHighlightPlugin(language: language, queries: queries))
        case .ini:
            textView.addPlugin(IniHighlightPlugin())
        case .none:
            break
        }

        // Bracket and quote pairing, indentation on Return (TextFormation).
        textView.addPlugin(FormattingRules.plugin(for: document.format))
        textView.textDelegate = context.coordinator
        document.attach(textView)
        context.coordinator.assist.attach(textView)
        DispatchQueue.main.async {
            textView.window?.makeFirstResponder(textView)
        }
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard context.coordinator.appliedStyle != style,
            let textView = scrollView.documentView as? STTextView
        else { return }
        apply(style, to: textView, scrollView: scrollView)
        context.coordinator.appliedStyle = style
    }

    /// Theme colors, font, wrapping and invisibles. The palette goes to
    /// EditorStyle first, so the highlighters color with the new theme.
    private func apply(_ style: Style, to textView: STTextView, scrollView: NSScrollView) {
        let palette = style.palette
        EditorStyle.apply(palette, key: style.themeKey)
        let font = NSFont.monospacedSystemFont(ofSize: style.fontSize, weight: .regular)
        if textView.font != font { textView.font = font }
        textView.textColor = palette.foreground.nsColor
        textView.backgroundColor = palette.background.nsColor
        textView.insertionPointColor = palette.cursor.nsColor
        textView.selectedLineHighlightColor = palette.currentLine.nsColor
        scrollView.drawsBackground = true
        scrollView.backgroundColor = palette.background.nsColor
        if let gutter = textView.gutterView {
            gutter.font = NSFont.monospacedDigitSystemFont(ofSize: max(style.fontSize - 2, 9), weight: .regular)
            gutter.textColor = palette.lineNumber.nsColor
            gutter.selectedLineTextColor = palette.foreground.nsColor
            gutter.selectedLineHighlightColor = palette.currentLine.nsColor
        }
        if textView.isHorizontallyResizable == style.wrapLines {
            textView.isHorizontallyResizable = !style.wrapLines
        }
        if textView.showsInvisibleCharacters != style.showInvisibles {
            textView.showsInvisibleCharacters = style.showInvisibles
        }
    }

    /// Always the offered size. Otherwise SwiftUI asks the text view for its
    /// size, which changes while TextKit lays out lines; the split view then
    /// recomputes the detail column's minimum size on every pass and the
    /// window's constraint updates never settle.
    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 480, height: proposal.height ?? 320)
    }

    @MainActor
    final class Coordinator: @MainActor STTextViewDelegate {
        let document: EditorDocument
        let assist: EditorAssistController
        var appliedStyle: Style?

        init(document: EditorDocument, assist: EditorAssistController) {
            self.document = document
            self.assist = assist
        }

        func textViewDidChangeText(_ notification: Notification) {
            document.textDidChange()
        }

        func textView(_ textView: STTextView, didChangeTextIn affectedCharRange: NSTextRange, replacementString: String)
        {
            assist.textDidChange(inserted: replacementString)
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            document.selectionDidChange()
            assist.selectionDidChange()
        }

        // Suggestions come from MCVectorEditorKit and show in the custom list.

        func textView(_ textView: STTextView, completionItemsAtLocation location: any NSTextLocation)
            -> [any STCompletionItem]?
        {
            assist.completionItems()
        }

        func textView(_ textView: STTextView, insertCompletionItem item: any STCompletionItem) {
            assist.insert(item)
        }

        func textViewCompletionViewController(_ textView: STTextView) -> any STCompletionViewControllerProtocol {
            assist.makeSuggestionController()
        }
    }
}
