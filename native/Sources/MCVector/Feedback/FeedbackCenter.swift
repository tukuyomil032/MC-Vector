// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Observation

/// Toasts and modal feedback for the whole window, mirroring React's
/// `AppFeedbackProvider` + `notify` + arc `ToastStack`:
/// - toasts: bottom-right stack, 5 s (warning and error 1.6x, loading until done),
///   at most 12 kept, 3 shown stacked, fanned out on hover;
/// - modal feedback: one at a time; a new request cancels the previous one (D8).
@MainActor
@Observable
final class FeedbackCenter {
    // MARK: Toasts

    enum ToastKind: String, Sendable {
        case success, error, warning, info, loading
    }

    struct Toast: Identifiable, Equatable {
        let id: String
        var kind: ToastKind
        var title: String
        var description: String?
        /// 0...100 for `.loading`.
        var progress: Int?
        var actionTitle: String?
        var action: (@MainActor () -> Void)?

        static func == (lhs: Toast, rhs: Toast) -> Bool {
            lhs.id == rhs.id && lhs.kind == rhs.kind && lhs.title == rhs.title
                && lhs.description == rhs.description && lhs.progress == rhs.progress
                && lhs.actionTitle == rhs.actionTitle
        }
    }

    static let baseDuration: Duration = .milliseconds(5000)
    static let limit = 12
    static let visibleToasts = 3

    /// Newest last.
    private(set) var toasts: [Toast] = []
    /// While the stack is hovered or focused it fans out and timers pause.
    var isStackExpanded = false {
        didSet { if !isStackExpanded { restartTimers() } }
    }

    private var timers: [String: Task<Void, Never>] = [:]

    func success(_ title: String, _ description: String? = nil) { show(.success, title, description) }
    func error(_ title: String, _ description: String? = nil) { show(.error, title, description) }
    func warning(_ title: String, _ description: String? = nil) { show(.warning, title, description) }
    func info(_ title: String, _ description: String? = nil) { show(.info, title, description) }

    /// Shows a toast. Reusing an `id` replaces that toast in place (React `notify.progress` / `done`).
    @discardableResult
    func show(
        _ kind: ToastKind,
        _ title: String,
        _ description: String? = nil,
        id: String = UUID().uuidString,
        progress: Int? = nil,
        actionTitle: String? = nil,
        action: (@MainActor () -> Void)? = nil
    ) -> String {
        let toast = Toast(
            id: id, kind: kind, title: title, description: description,
            progress: progress.map { min(100, max(0, $0)) },
            actionTitle: actionTitle, action: action
        )
        if let index = toasts.firstIndex(where: { $0.id == id }) {
            toasts[index] = toast
        } else {
            toasts.append(toast)
            if toasts.count > Self.limit {
                dismiss(toasts[0].id)
            }
        }
        schedule(toast)
        return id
    }

    func dismiss(_ id: String) {
        timers[id]?.cancel()
        timers[id] = nil
        toasts.removeAll { $0.id == id }
    }

    private func duration(for kind: ToastKind) -> Duration? {
        switch kind {
        case .loading: nil
        case .warning, .error: Self.baseDuration * 1.6
        case .success, .info: Self.baseDuration
        }
    }

    private func schedule(_ toast: Toast) {
        timers[toast.id]?.cancel()
        guard !isStackExpanded, let delay = duration(for: toast.kind) else {
            timers[toast.id] = nil
            return
        }
        let id = toast.id
        timers[id] = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            self?.dismiss(id)
        }
    }

    private func restartTimers() {
        for toast in toasts { schedule(toast) }
    }

    // MARK: Modal feedback (confirm / prompt / dialog)

    struct ConfirmRequest: Identifiable {
        let id = UUID()
        var title: String
        var description: String?
        var confirmLabel: String
        var cancelLabel: String
        /// React `tone: 'danger'`: destructive confirm, focus starts on Cancel.
        var isDanger: Bool
        let resolve: (Bool) -> Void
    }

    struct PromptRequest: Identifiable {
        let id = UUID()
        var title: String
        var description: String?
        var label: String
        var defaultValue: String
        var placeholder: String?
        var confirmLabel: String
        /// Returns an error message to block submitting, or nil when acceptable.
        var validate: ((String) -> String?)?
        let resolve: (String?) -> Void
    }

    struct DialogAction {
        var label: String
        var run: @MainActor () -> Void
    }

    struct DialogRequest: Identifiable {
        let id = UUID()
        var title: String
        var description: String?
        var primary: DialogAction?
        var secondary: DialogAction?
        let resolve: () -> Void
    }

    enum Modal: Identifiable {
        case confirm(ConfirmRequest)
        case prompt(PromptRequest)
        case dialog(DialogRequest)

        var id: UUID {
            switch self {
            case let .confirm(request): request.id
            case let .prompt(request): request.id
            case let .dialog(request): request.id
            }
        }
    }

    /// The one modal on screen. Setting a new one cancels the previous request.
    private(set) var modal: Modal?

    /// Resolves true when confirmed; false on cancel or Escape.
    func confirm(
        title: String,
        description: String? = nil,
        confirmLabel: String? = nil,
        cancelLabel: String? = nil,
        isDanger: Bool = false
    ) async -> Bool {
        await withCheckedContinuation { continuation in
            present(.confirm(ConfirmRequest(
                title: title,
                description: description,
                confirmLabel: confirmLabel ?? L10n.t("common.confirm"),
                cancelLabel: cancelLabel ?? L10n.t("common.cancel"),
                isDanger: isDanger,
                resolve: { continuation.resume(returning: $0) }
            )))
        }
    }

    /// Resolves the trimmed value when submitted; nil when cancelled.
    func prompt(
        title: String,
        description: String? = nil,
        label: String,
        defaultValue: String = "",
        placeholder: String? = nil,
        confirmLabel: String? = nil,
        validate: ((String) -> String?)? = nil
    ) async -> String? {
        await withCheckedContinuation { continuation in
            present(.prompt(PromptRequest(
                title: title,
                description: description,
                label: label,
                defaultValue: defaultValue,
                placeholder: placeholder,
                confirmLabel: confirmLabel ?? L10n.t("common.save"),
                validate: validate,
                resolve: { continuation.resume(returning: $0) }
            )))
        }
    }

    func openDialog(
        title: String,
        description: String? = nil,
        primary: DialogAction? = nil,
        secondary: DialogAction? = nil
    ) async {
        await withCheckedContinuation { continuation in
            present(.dialog(DialogRequest(
                title: title,
                description: description,
                primary: primary,
                secondary: secondary,
                resolve: { continuation.resume() }
            )))
        }
    }

    /// Called by the host views when the user answers or dismisses.
    func finishConfirm(_ accepted: Bool) { take { if case let .confirm(r) = $0 { r.resolve(accepted) } } }
    func finishPrompt(_ value: String?) { take { if case let .prompt(r) = $0 { r.resolve(value) } } }
    func finishDialog() { take { if case let .dialog(r) = $0 { r.resolve() } } }

    private func present(_ newModal: Modal) {
        cancelCurrent()
        modal = newModal
    }

    private func cancelCurrent() {
        guard let current = modal else { return }
        modal = nil
        switch current {
        case let .confirm(request): request.resolve(false)
        case let .prompt(request): request.resolve(nil)
        case let .dialog(request): request.resolve()
        }
    }

    private func take(_ body: (Modal) -> Void) {
        guard let current = modal else { return }
        modal = nil
        body(current)
    }
}
