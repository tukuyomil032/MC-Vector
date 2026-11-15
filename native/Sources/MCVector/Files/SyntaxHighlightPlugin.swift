// SPDX-License-Identifier: GPL-3.0-or-later
//
// Adapted from STTextView-Plugin-Neon (NeonPlugin, Coordinator and
// STTextViewSystemInterface), Copyright (c) 2023 Marcin Krzyzanowski, MIT License;
// see ThirdPartyNotices.txt. Two changes: the highlight query is read from the
// app's own Contents/Resources (the plugin's SwiftPM resource bundles cannot be
// placed where `Bundle.module` looks inside a signed .app), and token colors come
// from macOS system colors so they follow Light and Dark appearance.

import AppKit
import Neon
import STTextView
import SwiftTreeSitter
import TreeSitterClient
import TreeSitterResource

/// Tree-sitter syntax coloring for one language.
struct SyntaxHighlightPlugin: STPlugin {
    let language: TreeSitterLanguage
    /// Folder name under Contents/Resources/TreeSitterQueries.
    let queries: String

    func setUp(context: any Context) {
        context.events.onWillChangeText { affectedRange, _ in
            let range = NSRange(affectedRange, in: context.textView.textContentManager)
            context.coordinator.willChangeContent(in: range)
        }
        context.events.onDidChangeText { affectedRange, replacementString in
            guard let replacementString else { return }
            let manager = context.textView.textContentManager
            let range = NSRange(affectedRange, in: manager)
            context.coordinator.didChangeContent(
                manager, in: range,
                delta: replacementString.utf16.count - range.length,
                limit: manager.length
            )
        }
        context.events.onDidLayoutViewport { viewportRange in
            context.coordinator.updateViewportRange(viewportRange)
        }
    }

    func makeCoordinator(context: CoordinatorContext) -> SyntaxHighlightCoordinator {
        let url = Bundle.main.resourceURL?
            .appendingPathComponent("TreeSitterQueries/\(queries)/highlights.scm")
        return SyntaxHighlightCoordinator(textView: context.textView, language: language, queryURL: url)
    }
}

@MainActor
final class SyntaxHighlightCoordinator {
    private var highlighter: Neon.Highlighter?
    /// Nil when the query is missing or does not load: the text then stays plain
    /// (DEP-002: a grammar problem must not keep the file from opening).
    private var tsClient: TreeSitterClient?
    private var previousViewportRange: NSTextRange?
    private var scrollObserver: (any NSObjectProtocol)?
    private var styleObserver: (any NSObjectProtocol)?

    init(textView: STTextView, language: TreeSitterLanguage, queryURL: URL?) {
        let tsLanguage = Language(language: language.parser)
        guard let queryURL, let query = try? tsLanguage.query(contentsOf: queryURL),
            let client = try? TreeSitterClient(
                language: tsLanguage,
                transformer: { codePointIndex in
                    guard let location = textView.textContentManager.location(at: codePointIndex),
                        let position = textView.textContentManager.position(location)
                    else { return .zero }
                    return Point(row: position.row, column: position.column)
                })
        else { return }
        tsClient = client

        let manager = textView.textContentManager
        let tokenProvider = client.tokenProvider(with: query) { range, _ in
            guard !range.isEmpty else { return nil }
            return manager.attributedString(in: NSTextRange(range, provider: manager))?.string
        }
        highlighter = Neon.Highlighter(
            textInterface: TextViewInterface(textView: textView),
            tokenProvider: tokenProvider
        )
        client.invalidationHandler = { [weak self] indexSet in
            self?.highlighter?.invalidate(.set(indexSet))
        }

        // First parse of the whole document.
        let whole = NSRange(manager.documentRange, in: manager)
        client.willChangeContent(in: whole)
        client.didChangeContent(
            in: whole, delta: manager.length, limit: manager.length,
            readHandler: Parser.readFunction(for: manager.attributedString(in: nil)?.string ?? ""),
            completionHandler: {}
        )

        // Styles applied before the first layout do not stick, and STTextView
        // does not always report viewport layouts to plugins, so color again
        // once the view is on screen and whenever it scrolls.
        DispatchQueue.main.async { [weak self, weak textView] in
            guard let self, let clipView = textView?.enclosingScrollView?.contentView else { return }
            highlighter?.invalidate(.all)
            clipView.postsBoundsChangedNotifications = true
            scrollObserver = NotificationCenter.default.addObserver(
                forName: NSView.boundsDidChangeNotification, object: clipView, queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated { self?.highlighter?.visibleContentDidChange() }
            }
        }
        styleObserver = NotificationCenter.default.addObserver(
            forName: EditorStyle.didChange, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.highlighter?.invalidate(.all) }
        }
    }

    isolated deinit {
        if let scrollObserver { NotificationCenter.default.removeObserver(scrollObserver) }
        if let styleObserver { NotificationCenter.default.removeObserver(styleObserver) }
    }

    func updateViewportRange(_ range: NSTextRange?) {
        if range != previousViewportRange {
            highlighter?.visibleContentDidChange()
        }
        previousViewportRange = range
    }

    func willChangeContent(in range: NSRange) {
        tsClient?.willChangeContent(in: range)
    }

    func didChangeContent(_ manager: NSTextContentManager, in range: NSRange, delta: Int, limit: Int) {
        guard let tsClient, let text = manager.attributedString(in: nil)?.string else { return }
        tsClient.didChangeContent(
            in: range, delta: delta, limit: limit,
            readHandler: Parser.readFunction(for: text), completionHandler: {}
        )
    }
}

/// Applies token colors as rendering attributes, which only affect drawing, so
/// coloring never changes the layout.
@MainActor
private final class TextViewInterface: TextSystemInterface {
    private let textView: STTextView

    init(textView: STTextView) {
        self.textView = textView
    }

    // STTextView's own rendering-attribute calls also mark the view for
    // redrawing; the layout manager's alone leave the old colors on screen.
    func clearStyle(in range: NSRange) {
        textView.removeRenderingAttribute(.foregroundColor, range: range)
    }

    func applyStyle(to token: Neon.Token) {
        guard let color = EditorStyle.color(forToken: token.name) else { return }
        textView.addRenderingAttributes([.foregroundColor: color], range: token.range)
    }

    var length: Int {
        textView.textContentManager.length
    }

    var visibleRange: NSRange {
        guard let viewportRange = textView.textLayoutManager.textViewportLayoutController.viewportRange else {
            return .zero
        }
        return NSRange(viewportRange, provider: textView.textContentManager)
    }
}

/// The palette the editor colors text with. CodeTextView sets it from the
/// chosen theme and the appearance; highlighters color again when it changes.
@MainActor
enum EditorStyle {
    static let didChange = Notification.Name("MCVectorEditorStyleDidChange")

    private(set) static var palette: EditorTheme.Palette = .fallback
    private static var key = ""

    /// `key` identifies theme and appearance, so the same palette is not re-sent.
    static func apply(_ palette: EditorTheme.Palette, key: String) {
        guard key != self.key else { return }
        self.palette = palette
        self.key = key
        NotificationCenter.default.post(name: didChange, object: nil)
    }

    static func color(forToken token: String) -> NSColor? {
        palette.color(forToken: token)
    }
}
