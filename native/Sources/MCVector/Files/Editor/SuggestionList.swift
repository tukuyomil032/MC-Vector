// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorEditorKit
import STTextView
import SwiftUI

/// One suggestion handed to STTextView's completion window.
struct SuggestionItem: STCompletionItem {
    let candidate: CompletionCandidate
    var id: String { candidate.id }
    /// STTextView's own list would show this; the custom list draws SwiftUI rows.
    var view: NSView { MainActor.assumeIsolated { NSView() } }
}

/// What the suggestion list shows.
@MainActor
@Observable
final class SuggestionModel {
    var candidates: [CompletionCandidate] = []
    var selectedIndex = 0
    /// The documentation under the list (⌃Space toggles it, like VS Code).
    var showsDetails = true
    /// Card width, from the longest suggestion.
    var width: CGFloat = SuggestionViewController.minWidth

    var selected: CompletionCandidate? {
        candidates.indices.contains(selectedIndex) ? candidates[selectedIndex] : nil
    }
}

/// STTextView's completion window content: one card with the suggestions on
/// top and the highlighted key's documentation below (⌃Space hides it). The
/// card is sized from its content before it appears, then fades in from a few
/// points lower. The list is SwiftUI, not NSTableView (see the Table rule in
/// native-rich-animations). Keys arrive through a local event monitor while
/// the window is up, the same way STTextView's own list receives them.
final class SuggestionViewController: NSViewController, @preconcurrency STCompletionViewControllerProtocol {
    static let rowHeight: CGFloat = 26
    static let maxRows = 8
    static let minWidth: CGFloat = 320
    static let maxWidth: CGFloat = 480
    /// Space between the line and the card.
    static let gap: CGFloat = 6

    let model = SuggestionModel()
    weak var delegate: (any STCompletionViewControllerDelegate)?
    /// Called when the highlighted suggestion changes (the inline suggestion follows it).
    var onSelectionChange: ((CompletionCandidate?) -> Void)?

    var items: [Item] = [] {
        didSet {
            model.candidates = items.compactMap { ($0 as? SuggestionItem)?.candidate }
            model.selectedIndex = 0
            model.width = Self.width(for: model.candidates)
            fitWindow(animated: isShown)
            onSelectionChange?(model.selected)
            if !isShown { DispatchQueue.main.async { [weak self] in self?.appear() } }
        }
    }

    private var eventMonitor: Any?
    /// The window was faded in; later size changes animate instead.
    private var isShown = false

    override func loadView() {
        let hosting = NSHostingView(
            rootView: SuggestionCard(model: model) { [weak self] index in
                self?.accept(index: index, movement: .other)
            })
        hosting.sizingOptions = []
        view = hosting
    }

    override func viewWillAppear() {
        super.viewWillAppear()
        isShown = false
        view.window?.alphaValue = 0
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        view.window?.hasShadow = true
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            return self.handle(event) ? nil : event
        }
    }

    override func viewDidDisappear() {
        super.viewDidDisappear()
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
        eventMonitor = nil
        isShown = false
        onSelectionChange?(nil)
    }

    /// Runs after STTextView placed the window under the line: leave a small
    /// gap, then fade in while rising into place.
    private func appear() {
        guard !isShown, let window = view.window else { return }
        isShown = true
        let top = CGPoint(x: window.frame.minX, y: window.frame.maxY - Self.gap)
        fitWindow(animated: false, top: top)
        let final = window.frame
        window.setFrame(final.offsetBy(dx: 0, dy: -6), display: false)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = Motion.isReduced ? 0 : 0.16
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            window.animator().alphaValue = 1
            window.animator().setFrame(final, display: true)
        }
    }

    /// True when the key was used by the list.
    private func handle(_ event: NSEvent) -> Bool {
        if event.modifierFlags.contains(.control), event.charactersIgnoringModifiers == " " {
            model.showsDetails.toggle()
            fitWindow(animated: true)
            return true
        }
        switch event.keyCode {
        case 125:
            move(by: 1)
            return true  // down
        case 126:
            move(by: -1)
            return true  // up
        case 121:
            move(by: Self.maxRows)
            return true  // page down
        case 116:
            move(by: -Self.maxRows)
            return true  // page up
        case 48:
            accept(index: model.selectedIndex, movement: .tab)
            return true  // tab
        case 36, 76:
            accept(index: model.selectedIndex, movement: .return)
            return true  // return, enter
        case 53:
            delegate?.completionViewControllerCancel(self)
            return true  // escape
        default: return false
        }
    }

    private func move(by step: Int) {
        guard !model.candidates.isEmpty else { return }
        let next = min(max(model.selectedIndex + step, 0), model.candidates.count - 1)
        guard next != model.selectedIndex else { return }
        model.selectedIndex = next
        fitWindow(animated: true)
        onSelectionChange?(model.selected)
    }

    private func accept(index: Int, movement: NSTextMovement) {
        guard items.indices.contains(index) else { return }
        delegate?.completionViewController(self, complete: items[index], movement: movement)
        delegate?.completionViewControllerCancel(self)
    }

    /// Sizes the window to the card, keeping its top edge where it is.
    private func fitWindow(animated: Bool, top: CGPoint? = nil) {
        guard let window = view.window else { return }
        // The window's own hosting view has no intrinsic size (it must not drive
        // the window), so a measuring controller sizes the card instead.
        let measuring = NSHostingController(rootView: SuggestionCard(model: model) { _ in })
        let fitted = measuring.sizeThatFits(in: CGSize(width: model.width, height: 4_000))
        let size = CGSize(width: model.width, height: ceil(fitted.height))
        let anchor = top ?? CGPoint(x: window.frame.minX, y: window.frame.maxY)
        let frame = CGRect(x: anchor.x, y: anchor.y - size.height, width: size.width, height: size.height)
        guard frame != window.frame else { return }
        if animated && !Motion.isReduced {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.18
                context.allowsImplicitAnimation = true
                window.animator().setFrame(frame, display: true)
            }
        } else {
            window.setFrame(frame, display: true)
        }
        window.invalidateShadow()
    }

    /// Wide enough for the longest label and its detail, within the limits.
    private static func width(for candidates: [CompletionCandidate]) -> CGFloat {
        let labelFont = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
        let detailFont = NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)
        let widest =
            candidates.prefix(200).map { candidate in
                (candidate.label as NSString).size(withAttributes: [.font: labelFont]).width
                    + ((candidate.detail ?? "") as NSString).size(withAttributes: [.font: detailFont]).width
            }.max() ?? 0
        return min(max(widest + 72, minWidth), maxWidth)
    }
}

/// The card: suggestions, then the documentation of the highlighted key.
struct SuggestionCard: View {
    let model: SuggestionModel
    let pick: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(model.candidates.enumerated()), id: \.element.id) { index, candidate in
                            SuggestionRow(candidate: candidate, isSelected: index == model.selectedIndex)
                                .id(index)
                                .contentShape(Rectangle())
                                .onTapGesture { pick(index) }
                        }
                    }
                    .padding(4)
                }
                .scrollIndicators(model.candidates.count > SuggestionViewController.maxRows ? .automatic : .never)
                .frame(height: listHeight)
                .onChange(of: model.selectedIndex) { _, index in
                    proxy.scrollTo(index)
                }
            }
            if model.showsDetails, let entry = model.selected?.entry {
                Divider()
                EditorDocCard(entry: entry)
                    .fixedSize(horizontal: false, vertical: true)
                    .id(entry.path)
                    .transition(.opacity)
            }
        }
        .frame(width: model.width)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12))
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .animation(Motion.snappy, value: model.selected?.entry?.path)
    }

    private var listHeight: CGFloat {
        CGFloat(min(max(model.candidates.count, 1), SuggestionViewController.maxRows))
            * SuggestionViewController.rowHeight + 8
    }
}

private struct SuggestionRow: View {
    let candidate: CompletionCandidate
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: Self.symbol(candidate.kind))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Self.tint(candidate.kind))
                .frame(width: 16)
            Text(highlighted)
                .font(.system(size: 12.5, design: .monospaced))
                .lineLimit(1)
            Spacer(minLength: 8)
            if let detail = candidate.detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(isSelected ? AnyShapeStyle(.primary.opacity(0.75)) : AnyShapeStyle(.tertiary))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: SuggestionViewController.rowHeight)
        .background {
            if isSelected {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(Color.accentColor.opacity(0.28))
            }
        }
    }

    /// The label with the letters that matched the typed text in bold accent.
    private var highlighted: AttributedString {
        var text = AttributedString(candidate.label)
        let characters = Array(candidate.label)
        for range in candidate.matchedRanges where range.lowerBound >= 0 && range.upperBound <= characters.count {
            let start = text.index(text.startIndex, offsetByCharacters: range.lowerBound)
            let end = text.index(text.startIndex, offsetByCharacters: range.upperBound)
            text[start..<end].foregroundColor = .accentColor
            text[start..<end].font = .system(size: 12.5, weight: .bold, design: .monospaced)
        }
        return text
    }

    static func symbol(_ kind: CompletionKind) -> String {
        switch kind {
        case .key: "slider.horizontal.3"
        case .section: "curlybraces"
        case .value: "equal"
        case .enumValue: "list.bullet"
        case .word: "textformat.abc"
        }
    }

    static func tint(_ kind: CompletionKind) -> Color {
        switch kind {
        case .key: .purple
        case .section: .blue
        case .value, .enumValue: .orange
        case .word: .secondary
        }
    }
}
