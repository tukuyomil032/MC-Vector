// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorEditorKit
import STAnnotationsPlugin
import STTextView
import SwiftUI

/// The editor's helpers around one text view: the suggestion list, the dimmed
/// inline suggestion, validation marks, the hover card, indentation and
/// comments. The logic lives in MCVectorEditorKit; this class turns it into
/// what the person sees and types.
@MainActor
final class EditorAssistController: EditorTextViewAssist {
    let document: EditorDocument
    private weak var textView: EditorTextView?
    private let settings = EditorSettings.shared

    private let inlineView = InlineSuggestionView()
    /// The inline suggestion on screen: what Tab inserts and where.
    private var inline: (text: String, range: NSRange)?
    /// The last completion result, so the inline suggestion and the list agree.
    private var lastResult: CompletionResult?

    private var suggestTask: Task<Void, Never>?
    private var caretTask: Task<Void, Never>?
    /// When the text last changed; selection changes right after an edit are the edit's own.
    private var lastEdit = Date.distantPast
    private var validateTask: Task<Void, Never>?
    private var hoverTask: Task<Void, Never>?
    private let hover = HoverCardPanel()
    private var hoverRange: NSRange?
    private var markedDiagnostics: [NSRange] = []
    /// A problem in the value being typed; shown once the cursor leaves it.
    private var heldDiagnostic: NSRange?
    /// Short messages at the end of lines with a problem.
    private let annotations = DiagnosticAnnotations()
    private var annotationsPlugin: STAnnotationsPlugin?

    init(document: EditorDocument) {
        self.document = document
    }

    #if DEBUG
        /// Capture tooling reaches the editor on screen through this.
        static weak var current: EditorAssistController?

        /// Capture tooling: shows the hover card for the first occurrence of `text`.
        func showHoverForCapture(on text: String) {
            guard let textView, let content = document.currentText else { return }
            let found = content.range(of: text)
            guard found.location != NSNotFound else { return }
            showHover(at: found.location + 1, in: textView)
        }

        var textViewForCapture: EditorTextView? { textView }
    #endif

    func attach(_ textView: EditorTextView) {
        #if DEBUG
            Self.current = self
        #endif
        self.textView = textView
        textView.assist = self
        textView.addSubview(inlineView)
        inlineView.isHidden = true
        if document.format != nil, !document.entries.isEmpty {
            let plugin = STAnnotationsPlugin(dataSource: annotations)
            textView.addPlugin(plugin)
            annotationsPlugin = plugin
        }
        scheduleValidation(delay: .zero)
    }

    // MARK: Text changes

    /// Called for every edit; `inserted` is the typed text.
    func textDidChange(inserted: String) {
        lastEdit = Date()
        caretTask?.cancel()
        hideHover()
        hideInline()
        scheduleValidation(delay: .milliseconds(350))
        guard let textView, !textView.hasMarkedText() else { return }
        if inserted.contains("\n") {
            // A new line ends the word being completed.
            suggestTask?.cancel()
            if textView.isCompletionActive { textView.cancelComplete(nil) }
            return
        }
        let triggers = inserted.count == 1 && (inserted.first.map(Self.isTrigger) ?? false)
        if textView.isCompletionActive {
            // Typing narrows the open list.
            refreshSuggestions(openList: true)
        } else if triggers {
            refreshSuggestions(openList: settings.suggestWhileTyping)
        }
    }

    func selectionDidChange() {
        guard let textView else { return }
        if let inline,
            textView.textSelection != NSRange(location: inline.range.location + inline.range.length, length: 0)
        {
            hideInline()
        }
        if let held = heldDiagnostic, Date().timeIntervalSince(lastEdit) > 0.1,
            !Self.touches(held, textView.textSelection.location)
        {
            heldDiagnostic = nil
            scheduleValidation(delay: .zero)
        }
        // The cursor was moved (click, arrow keys) onto a value: after a short
        // pause, offer its allowed values, so nobody has to guess a first letter.
        caretTask?.cancel()
        guard settings.suggestWhileTyping, Date().timeIntervalSince(lastEdit) > 0.1,
            textView.textSelection.length == 0, !textView.isCompletionActive
        else { return }
        caretTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard let self, !Task.isCancelled, let textView = self.textView, !textView.isCompletionActive,
                let result = self.computeResult(),
                result.candidates.contains(where: { $0.kind == .value || $0.kind == .enumValue })
            else { return }
            self.hideHover()
            textView.complete(nil)
        }
    }

    private static func isTrigger(_ character: Character) -> Bool {
        character.isLetter || character.isNumber || "-_.:=\"[ ".contains(character)
    }

    /// Recomputes suggestions a moment after typing stops.
    private func refreshSuggestions(openList: Bool) {
        suggestTask?.cancel()
        suggestTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(90))
            guard let self, !Task.isCancelled, let textView = self.textView else { return }
            let result = self.computeResult()
            if openList {
                if result?.candidates.isEmpty == false {
                    textView.complete(nil)
                } else if textView.isCompletionActive {
                    textView.cancelComplete(nil)
                }
            }
            if !textView.isCompletionActive {
                self.showInline(for: result?.candidates.first, in: result)
            }
        }
    }

    private func computeResult() -> CompletionResult? {
        guard let textView, let text = document.currentText, let format = document.format else { return nil }
        let cursor = textView.textSelection
        guard cursor.length == 0 else { return nil }
        let result = CompletionEngine.complete(
            text: text as String, cursor: cursor.location, format: format,
            schema: document.schema, entries: document.entries
        )
        lastResult = result
        return result
    }

    // MARK: Suggestion list (STTextView completion)

    func completionItems() -> [any STCompletionItem]? {
        guard let result = computeResult(), !result.candidates.isEmpty else { return [] }
        hideInline()
        return result.candidates.prefix(200).map { SuggestionItem(candidate: $0) }
    }

    func makeSuggestionController() -> SuggestionViewController {
        let controller = SuggestionViewController()
        controller.onSelectionChange = { [weak self] candidate in
            guard let self else { return }
            if let candidate {
                // The list shows the same documentation: one card is enough.
                self.hoverTask?.cancel()
                self.hideHover()
                self.showInline(for: candidate, in: self.lastResult)
            } else {
                self.hideInline()
            }
        }
        return controller
    }

    func insert(_ item: any STCompletionItem) {
        guard let item = item as? SuggestionItem, let result = lastResult, let textView else { return }
        hideInline()
        replace(result.replaceRange, with: item.candidate.insertText, in: textView)
        if item.candidate.kind == .key || item.candidate.kind == .section {
            // A key is followed by its value: offer the values right away.
            refreshSuggestions(openList: settings.suggestWhileTyping)
        }
    }

    private func replace(_ range: NSRange, with text: String, in textView: STTextView) {
        textView.breakUndoCoalescing()
        textView.insertText(text, replacementRange: range)
        textView.breakUndoCoalescing()
    }

    // MARK: Inline suggestion

    /// Shows the rest of `candidate` after the cursor, dimmed, when the typed
    /// text is its beginning and the cursor ends the line.
    private func showInline(for candidate: CompletionCandidate?, in result: CompletionResult?) {
        guard settings.inlineSuggestions, let candidate, let result, let textView,
            let text = document.currentText, !result.prefix.isEmpty,
            candidate.insertText.lowercased().hasPrefix(result.prefix.lowercased()),
            candidate.insertText.count > result.prefix.count
        else { return hideInline() }
        let cursor = textView.textSelection.location
        let lineEnd = text.lineRange(for: NSRange(location: cursor, length: 0))
        let endOfLine = lineEnd.location + lineEnd.length
        let trailing = text.substring(with: NSRange(location: cursor, length: endOfLine - cursor))
        guard trailing.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return hideInline() }

        let rest =
            String(candidate.insertText.dropFirst(result.prefix.count))
            .components(separatedBy: "\n").first ?? ""
        guard !rest.isEmpty, let window = textView.window else { return hideInline() }
        let caret = textView.firstRect(forCharacterRange: NSRange(location: cursor, length: 0), actualRange: nil)
        let inView = textView.convert(window.convertFromScreen(caret), from: nil)
        inline = (candidate.insertText, result.replaceRange)
        inlineView.show(rest, font: textView.font, color: EditorStyle.palette.faint.nsColor, at: inView)
    }

    private func hideInline() {
        inline = nil
        inlineView.isHidden = true
    }

    func acceptInlineSuggestion(in textView: EditorTextView) -> Bool {
        guard let inline, !inlineView.isHidden else { return false }
        hideInline()
        replace(inline.range, with: inline.text, in: textView)
        return true
    }

    func dismissInlineSuggestion(in textView: EditorTextView) -> Bool {
        guard inline != nil else { return false }
        hideInline()
        return true
    }

    // MARK: Indentation and comments

    func indent(in textView: EditorTextView, outdent: Bool) -> Bool {
        guard let text = document.currentText else { return false }
        let selection = textView.textSelection
        let unit = EditCommands.indentUnit(for: document.format)
        let multiline = selection.length > 0 && text.substring(with: selection).contains("\n")
        if multiline || outdent {
            let edit =
                outdent
                ? EditCommands.outdent(text: text as String, selection: selection, unit: unit)
                : EditCommands.indent(text: text as String, selection: selection, unit: unit)
            apply(edit, in: textView)
            return true
        }
        guard unit != "\t" else { return false }
        replace(selection, with: unit, in: textView)
        return true
    }

    func toggleComment(in textView: EditorTextView) {
        guard let text = document.currentText,
            let edit = EditCommands.toggleComment(
                text: text as String, selection: textView.textSelection, format: document.format)
        else { return NSSound.beep() }
        apply(edit, in: textView)
    }

    private func apply(_ edit: TextEdit, in textView: STTextView) {
        replace(edit.range, with: edit.replacement, in: textView)
        textView.textSelection = edit.selection
    }

    func goToLine(in textView: EditorTextView) {
        document.isGoToLineRequested = true
    }

    // MARK: Validation

    private func scheduleValidation(delay: Duration) {
        validateTask?.cancel()
        guard document.format != nil, !document.entries.isEmpty else { return }
        validateTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard let self, !Task.isCancelled else { return }
            self.validate()
        }
    }

    private func validate() {
        guard let textView, let text = document.currentText, let format = document.format else { return }
        // A half-typed value is not a mistake yet: while the cursor is still in
        // the value just edited, hold its warning back so it does not cover the
        // suggestions. Moving the cursor away shows it (selectionDidChange).
        let caret = textView.textSelection
        let isTyping = Date().timeIntervalSince(lastEdit) < 10 && caret.length == 0
        var diagnostics = Validator.diagnostics(text: text as String, format: format, entries: document.entries)
        heldDiagnostic = nil
        if isTyping, let index = diagnostics.firstIndex(where: { Self.touches($0.range, caret.location) }) {
            heldDiagnostic = diagnostics.remove(at: index).range
        }
        document.diagnostics = diagnostics
        let manager = textView.textContentManager
        for range in markedDiagnostics {
            guard NSMaxRange(range) <= text.length, let textRange = NSTextRange(range, in: manager) else { continue }
            textView.textLayoutManager.removeRenderingAttribute(.underlineStyle, for: textRange)
            textView.textLayoutManager.removeRenderingAttribute(.underlineColor, for: textRange)
        }
        markedDiagnostics = []
        for diagnostic in diagnostics {
            guard NSMaxRange(diagnostic.range) <= text.length,
                let textRange = NSTextRange(diagnostic.range, in: manager)
            else { continue }
            let style = NSUnderlineStyle.thick.rawValue | NSUnderlineStyle.patternDot.rawValue
            textView.textLayoutManager.addRenderingAttribute(.underlineStyle, value: style, for: textRange)
            textView.textLayoutManager.addRenderingAttribute(
                .underlineColor, value: NSColor.systemOrange, for: textRange)
            markedDiagnostics.append(diagnostic.range)
        }
        annotations.textViewAnnotations = diagnostics.compactMap { diagnostic in
            guard let location = manager.location(manager.documentRange.location, offsetBy: diagnostic.range.location)
            else {
                return nil
            }
            return STMessageLineAnnotation(
                id: diagnostic.id, message: AttributedString(DiagnosticText.message(for: diagnostic)),
                kind: .warning, location: location
            )
        }
        annotationsPlugin?.reloadAnnotations()
        textView.needsLayout = true
        textView.needsDisplay = true
    }

    private static func touches(_ range: NSRange, _ location: Int) -> Bool {
        location >= range.location && location <= NSMaxRange(range)
    }

    // MARK: Hover

    func mouseMoved(in textView: EditorTextView, event: NSEvent) {
        hoverTask?.cancel()
        guard !textView.isCompletionActive else {
            hideHover()
            return
        }
        guard let window = textView.window else { return }
        let screenPoint = window.convertPoint(toScreen: event.locationInWindow)
        let index = textView.characterIndex(for: screenPoint)
        if let hoverRange, index != NSNotFound, NSLocationInRange(index, hoverRange) { return }
        hideHover()
        guard index != NSNotFound else { return }
        hoverTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(450))
            guard let self, !Task.isCancelled else { return }
            self.showHover(at: index, in: textView)
        }
    }

    func mouseExited(in textView: EditorTextView) {
        hoverTask?.cancel()
        hideHover()
    }

    private func showHover(at index: Int, in textView: EditorTextView) {
        guard let text = document.currentText, let format = document.format, !textView.isCompletionActive,
            let target = DocumentAnalyzer.hoverTarget(
                text: text as String, offset: index, format: format, entries: document.entries
            )
        else { return }
        let diagnostic = document.diagnostics.first { NSLocationInRange(index, $0.range) || $0.range == target.range }
        guard let entry = target.entry else { return }
        let message = diagnostic.map { DiagnosticText.message(for: $0) }
        let anchor = textView.firstRect(forCharacterRange: target.range, actualRange: nil)
        guard let window = textView.window, anchor != .zero else { return }
        hoverRange = target.range
        // The visible top of the text, in screen coordinates: the card goes
        // below the line when it would cover the editor header.
        let visible = textView.convert(textView.visibleRect, to: nil)
        let textTop = window.convertToScreen(visible).maxY
        hover.show(EditorDocCard(entry: entry, diagnostic: message), above: anchor, parent: window, limitTop: textTop)
    }

    func hideHover() {
        hoverRange = nil
        hover.hide()
    }
}

/// Localized text for a validation problem. Values and key names stay as written.
enum DiagnosticText {
    static func message(for diagnostic: Diagnostic) -> String {
        switch diagnostic.kind {
        case .typeMismatch(let expected):
            L10n.t("native.editor.diagnostic.type", ["type": expected.rawValue])
        case .outOfRange(let min, let max):
            L10n.t(
                "native.editor.diagnostic.range",
                [
                    "min": min.map(number) ?? "…", "max": max.map(number) ?? "…",
                ])
        case .notAllowed(let values):
            L10n.t("native.editor.diagnostic.values", ["values": values.joined(separator: ", ")])
        case .duplicateKey:
            L10n.t("native.editor.diagnostic.duplicate")
        }
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }
}

/// The dimmed rest of a suggestion, drawn after the cursor.
final class InlineSuggestionView: NSTextField {
    convenience init() {
        self.init(labelWithString: "")
        isBordered = false
        drawsBackground = false
        isEditable = false
        isSelectable = false
        lineBreakMode = .byClipping
        setAccessibilityElement(false)
    }

    func show(_ text: String, font: NSFont, color: NSColor, at caret: CGRect) {
        stringValue = text
        self.font = font
        textColor = color
        sizeToFit()
        // Line up with the typed text: same left edge as the cursor, centered on its line.
        let height = frame.height
        setFrameOrigin(CGPoint(x: caret.maxX, y: caret.midY - height / 2))
        if isHidden {
            alphaValue = 0
            isHidden = false
            NSAnimationContext.runAnimationGroup { context in
                context.duration = Motion.isReduced ? 0 : 0.12
                animator().alphaValue = 1
            }
        }
    }
}

/// A floating card above the hovered key, like VS Code's hover.
@MainActor
final class HoverCardPanel {
    private var panel: NSPanel?

    func show(_ card: EditorDocCard, above anchor: CGRect, parent: NSWindow, limitTop: CGFloat) {
        hide()
        let hosting = NSHostingView(
            rootView:
                card
                .frame(width: 380, alignment: .leading)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Color.primary.opacity(0.12))
                }
        )
        let size = hosting.fittingSize
        let panel = NSPanel(
            contentRect: CGRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .popUpMenu
        panel.contentView = hosting
        // Above the line when it fits, otherwise below it.
        var origin = CGPoint(x: anchor.minX, y: anchor.maxY + 8)
        if origin.y + size.height > limitTop {
            origin.y = anchor.minY - 8 - size.height
        }
        panel.setFrameOrigin(origin)
        panel.alphaValue = 0
        parent.addChildWindow(panel, ordered: .above)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = Motion.isReduced ? 0 : 0.14
            panel.animator().alphaValue = 1
        }
        self.panel = panel
    }

    func hide() {
        guard let panel else { return }
        self.panel = nil
        panel.parent?.removeChildWindow(panel)
        panel.orderOut(nil)
    }
}

/// Supplies the validation messages shown after their lines: a small capsule
/// only as wide as its text, instead of a bar to the window edge. The plugin
/// rebuilds these views on every layout pass, so they do not animate.
@MainActor
final class DiagnosticAnnotations: STAnnotationsDataSource {
    var textViewAnnotations: [any STLineAnnotation] = []

    private static let font = NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)

    func textView(
        _ textView: STTextView, viewForLineAnnotation lineAnnotation: any STLineAnnotation,
        textLineFragment: NSTextLineFragment, proposedViewFrame: CGRect
    ) -> NSView? {
        guard let annotation = lineAnnotation as? STMessageLineAnnotation else { return nil }
        let message = String(annotation.message.characters)
        let textWidth = (message as NSString).size(withAttributes: [.font: Self.font]).width
        let left = proposedViewFrame.minX - 12
        let available = max(proposedViewFrame.maxX - left, 0)
        let width = min(ceil(textWidth) + 34, available, 420)
        guard width > 60 else { return nil }
        let height = min(proposedViewFrame.height, 20)
        let frame = CGRect(x: left, y: proposedViewFrame.midY - height / 2, width: width, height: height)
        return STAnnotationView(frame: frame) {
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 9.5, weight: .semibold))
                    .foregroundStyle(.orange)
                Text(message)
                    .font(Font(Self.font))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.14), in: Capsule())
            .overlay { Capsule().strokeBorder(Color.orange.opacity(0.35), lineWidth: 0.5) }
        }
    }
}
