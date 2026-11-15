// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import STTextView

/// What the editor's helpers decide for keys and the mouse. EditorTextView
/// only forwards; EditorAssistController implements it.
@MainActor
protocol EditorTextViewAssist: AnyObject {
    /// Tab with a dimmed inline suggestion on screen: true when it was inserted.
    func acceptInlineSuggestion(in textView: EditorTextView) -> Bool
    /// Tab or Shift-Tab: true when the assist indented, outdented or inserted
    /// the file's indent unit itself.
    func indent(in textView: EditorTextView, outdent: Bool) -> Bool
    /// Escape: true when it only dismissed the inline suggestion.
    func dismissInlineSuggestion(in textView: EditorTextView) -> Bool
    func toggleComment(in textView: EditorTextView)
    func goToLine(in textView: EditorTextView)
    func mouseMoved(in textView: EditorTextView, event: NSEvent)
    func mouseExited(in textView: EditorTextView)
}

/// STTextView with the editor's key handling and menu actions. The actions are
/// reached through the responder chain, so the Editor menu needs no reference
/// to the view: it sends `toggleComment:` and the focused editor answers.
final class EditorTextView: STTextView {
    weak var assist: (any EditorTextViewAssist)?
    private var hoverTrackingArea: NSTrackingArea?

    override func insertTab(_ sender: Any?) {
        if assist?.acceptInlineSuggestion(in: self) == true { return }
        if assist?.indent(in: self, outdent: false) == true { return }
        super.insertTab(sender)
    }

    override func insertBacktab(_ sender: Any?) {
        if assist?.indent(in: self, outdent: true) == true { return }
        super.insertBacktab(sender)
    }

    override func cancelOperation(_ sender: Any?) {
        if !isCompletionActive, assist?.dismissInlineSuggestion(in: self) == true { return }
        super.cancelOperation(sender)
    }

    // MARK: Editor menu actions

    @objc func toggleComment(_ sender: Any?) {
        assist?.toggleComment(in: self)
    }

    @objc func goToLine(_ sender: Any?) {
        assist?.goToLine(in: self)
    }

    @objc func showCompletions(_ sender: Any?) {
        complete(sender)
    }

    // MARK: Hover

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverTrackingArea { removeTrackingArea(hoverTrackingArea) }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self
        )
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        assist?.mouseMoved(in: self, event: event)
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        assist?.mouseExited(in: self)
    }
}
