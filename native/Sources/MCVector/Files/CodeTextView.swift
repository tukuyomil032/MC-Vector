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

    func makeCoordinator() -> Coordinator {
        Coordinator(document: document)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = STTextView.scrollableTextView()
        // SwiftUI already lays the editor out below the toolbar. Letting the
        // scroll view follow the window's safe area as well makes the two
        // adjust each other during layout until AppKit throws.
        scrollView.automaticallyAdjustsContentInsets = false
        scrollView.contentInsets = NSEdgeInsetsZero
        guard let textView = scrollView.documentView as? STTextView else { return scrollView }
        textView.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        textView.textColor = .textColor
        textView.showsLineNumbers = true
        textView.highlightSelectedLine = true
        textView.isHorizontallyResizable = true
        textView.isIncrementalSearchingEnabled = true
        textView.textFinder.incrementalSearchingShouldDimContentView = true
        textView.text = document.initialText
        textView.textSelection = NSRange(location: 0, length: 0)

        switch document.language.highlighting {
        case let .treeSitter(language, queries):
            textView.addPlugin(SyntaxHighlightPlugin(language: language, queries: queries))
        case .ini:
            textView.addPlugin(IniHighlightPlugin())
        case .none:
            break
        }

        textView.textDelegate = context.coordinator
        document.attach(textView)
        DispatchQueue.main.async {
            textView.window?.makeFirstResponder(textView)
        }
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {}

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

        init(document: EditorDocument) {
            self.document = document
        }

        func textViewDidChangeText(_ notification: Notification) {
            document.textDidChange()
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            document.selectionDidChange()
        }
    }
}
