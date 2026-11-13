// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Presents `FeedbackCenter.modal` (React `AppFeedbackProvider` dialogs):
/// confirm → `.alert` with Cancel then the confirm button (destructive for `danger`),
/// prompt → sheet with a labelled text field and Cancel / Save on the trailing side,
/// dialog → sheet with title, description and up to two actions.
struct FeedbackHost: ViewModifier {
    @Bindable var feedback: FeedbackCenter

    func body(content: Content) -> some View {
        content
            .alert(
                confirmRequest?.title ?? "",
                isPresented: Binding(
                    get: { confirmRequest != nil },
                    set: { if !$0, confirmRequest != nil { feedback.finishConfirm(false) } }
                ),
                presenting: confirmRequest
            ) { request in
                Button(request.cancelLabel, role: .cancel) { feedback.finishConfirm(false) }
                Button(request.confirmLabel, role: request.isDanger ? .destructive : nil) {
                    feedback.finishConfirm(true)
                }
            } message: { request in
                if let description = request.description {
                    Text(description)
                }
            }
            .sheet(item: Binding(
                get: { sheetModal },
                set: { if $0 == nil { dismissSheet() } }
            )) { modal in
                switch modal {
                case let .prompt(request):
                    PromptSheet(request: request) { feedback.finishPrompt($0) }
                case let .dialog(request):
                    DialogSheet(request: request) { feedback.finishDialog() }
                case .confirm:
                    EmptyView()
                }
            }
    }

    private var confirmRequest: FeedbackCenter.ConfirmRequest? {
        if case let .confirm(request) = feedback.modal { return request }
        return nil
    }

    private var sheetModal: FeedbackCenter.Modal? {
        switch feedback.modal {
        case .prompt, .dialog: feedback.modal
        default: nil
        }
    }

    private func dismissSheet() {
        switch feedback.modal {
        case .prompt: feedback.finishPrompt(nil)
        case .dialog: feedback.finishDialog()
        default: break
        }
    }
}

extension View {
    func feedbackHost(_ feedback: FeedbackCenter) -> some View {
        modifier(FeedbackHost(feedback: feedback))
    }
}

/// PROMPT-*: title, field label, text field, then Cancel / confirm on the trailing side.
private struct PromptSheet: View {
    let request: FeedbackCenter.PromptRequest
    let finish: (String?) -> Void
    @State private var value: String
    @State private var error: String?

    init(request: FeedbackCenter.PromptRequest, finish: @escaping (String?) -> Void) {
        self.request = request
        self.finish = finish
        _value = State(initialValue: request.defaultValue)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(request.title).font(.headline)
            if let description = request.description {
                Text(description).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(request.label).font(.callout)
                TextField(request.placeholder ?? "", text: $value)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(submit)
                if let error {
                    Text(error).font(.callout).foregroundStyle(.red)
                }
            }
            HStack {
                Spacer()
                Button(L10n.t("common.cancel"), role: .cancel) { finish(nil) }
                    .keyboardShortcut(.cancelAction)
                Button(request.confirmLabel, action: submit)
                    .keyboardShortcut(.defaultAction)
                    .disabled(trimmed.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private var trimmed: String { value.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func submit() {
        guard !trimmed.isEmpty else { return }
        if let message = request.validate?(trimmed) {
            error = message
            return
        }
        finish(trimmed)
    }
}

/// FEEDBACK-dialog-*: title, description, actions on the trailing side.
private struct DialogSheet: View {
    let request: FeedbackCenter.DialogRequest
    let finish: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(request.title).font(.headline)
            if let description = request.description {
                Text(description).foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                if let secondary = request.secondary {
                    Button(secondary.label) {
                        secondary.run()
                        finish()
                    }
                }
                if let primary = request.primary {
                    Button(primary.label) {
                        primary.run()
                        finish()
                    }
                    .keyboardShortcut(.defaultAction)
                    Button(L10n.t("common.close"), role: .cancel, action: finish)
                        .keyboardShortcut(.cancelAction)
                } else {
                    Button(L10n.t("common.close"), action: finish)
                        .keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}
