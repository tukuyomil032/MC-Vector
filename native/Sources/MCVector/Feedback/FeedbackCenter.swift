// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import Observation
import UserNotifications

/// Feedback covering what React's toasts and `AppFeedbackProvider` dialogs do,
/// built from macOS idioms:
/// - toasts are a single HUD capsule near the top of the window (`ToastHUD`);
/// - confirmations and prompts are alerts and sheets; `showError` is an alert for
///   failures the user has to read;
/// - background events can also go to Notification Center (`notifyInBackground`).
/// Only one modal is shown at a time; a new request cancels the previous one.
@MainActor
@Observable
final class FeedbackCenter {
    struct ConfirmRequest: Identifiable {
        let id = UUID()
        var title: String
        var description: String?
        var confirmLabel: String
        var cancelLabel: String
        /// Destructive confirm; Cancel is the default button.
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

    /// A failure the user should read: an alert with a single OK button.
    struct ErrorRequest: Identifiable {
        let id = UUID()
        var title: String
        var message: String?
        let resolve: () -> Void
    }

    enum Modal: Identifiable {
        case confirm(ConfirmRequest)
        case prompt(PromptRequest)
        case error(ErrorRequest)

        var id: UUID {
            switch self {
            case let .confirm(request): request.id
            case let .prompt(request): request.id
            case let .error(request): request.id
            }
        }
    }

    /// The one modal on screen.
    private(set) var modal: Modal?

    // MARK: Toast (HUD)

    enum ToastKind: Sendable {
        case success, info, warning, error

        var symbol: String {
            switch self {
            case .success: "checkmark.circle.fill"
            case .info: "info.circle.fill"
            case .warning: "exclamationmark.triangle.fill"
            case .error: "xmark.octagon.fill"
            }
        }
    }

    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let kind: ToastKind
        let title: String
    }

    /// The toast on screen. A new toast replaces the current one.
    private(set) var toast: Toast?
    @ObservationIgnored private var toastTimer: Task<Void, Never>?

    /// Shows a short message as a HUD capsule at the top of the window, then fades
    /// it out (about 2.5 s; warnings and errors stay a little longer).
    func toast(_ kind: ToastKind, _ title: String) {
        let next = Toast(kind: kind, title: title)
        toast = next
        toastTimer?.cancel()
        let seconds: Double = (kind == .warning || kind == .error) ? 4 : 2.5
        toastTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled, self?.toast?.id == next.id else { return }
            self?.toast = nil
        }
    }

    func dismissToast() {
        toastTimer?.cancel()
        toast = nil
    }

    // MARK: Requests

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

    /// Shows a failure as an alert. Does not wait for the user.
    func showError(_ title: String, message: String? = nil) {
        present(.error(ErrorRequest(title: title, message: message, resolve: {})))
    }

    /// Called by the host view when the user answers or dismisses.
    func finishConfirm(_ accepted: Bool) { take { if case let .confirm(r) = $0 { r.resolve(accepted) } } }
    func finishPrompt(_ value: String?) { take { if case let .prompt(r) = $0 { r.resolve(value) } } }
    func finishError() { take { if case let .error(r) = $0 { r.resolve() } } }

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
        case let .error(request): request.resolve()
        }
    }

    private func take(_ body: (Modal) -> Void) {
        guard let current = modal else { return }
        modal = nil
        body(current)
    }

    // MARK: Background events

    /// Posts a Notification Center notification for something that happened
    /// without the user asking (server crashed, auto backup finished...).
    /// Permission is requested on first use; without it nothing is shown.
    func notifyInBackground(title: String, body: String? = nil) {
        let center = UNUserNotificationCenter.current()
        Task {
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            if let body { content.body = body }
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            try? await center.add(request)
        }
    }
}
