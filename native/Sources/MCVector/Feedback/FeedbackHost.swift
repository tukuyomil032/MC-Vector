// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Presents `FeedbackCenter.modal` with the standard components:
/// confirm and error → `.alert`, prompt → a sheet with a text field.
struct FeedbackHost: ViewModifier {
    @Bindable var feedback: FeedbackCenter

    func body(content: Content) -> some View {
        content
            .alert(
                alertTitle,
                isPresented: Binding(
                    get: { isAlert },
                    set: { if !$0 { dismissAlert() } }
                )
            ) {
                switch feedback.modal {
                case let .confirm(request):
                    Button(request.cancelLabel, role: .cancel) { feedback.finishConfirm(false) }
                    Button(request.confirmLabel, role: request.isDanger ? .destructive : nil) {
                        feedback.finishConfirm(true)
                    }
                case .error:
                    Button(L10n.t("common.close")) { feedback.finishError() }
                default:
                    EmptyView()
                }
            } message: {
                switch feedback.modal {
                case let .confirm(request):
                    if let description = request.description { Text(description) }
                case let .error(request):
                    if let message = request.message { Text(message) }
                default:
                    EmptyView()
                }
            }
            .sheet(item: Binding(
                get: { promptRequest },
                set: { if $0 == nil, promptRequest != nil { feedback.finishPrompt(nil) } }
            )) { request in
                PromptSheet(request: request) { feedback.finishPrompt($0) }
            }
    }

    private var isAlert: Bool {
        switch feedback.modal {
        case .confirm, .error: true
        default: false
        }
    }

    private var alertTitle: String {
        switch feedback.modal {
        case let .confirm(request): request.title
        case let .error(request): request.title
        default: ""
        }
    }

    private var promptRequest: FeedbackCenter.PromptRequest? {
        if case let .prompt(request) = feedback.modal { return request }
        return nil
    }

    private func dismissAlert() {
        switch feedback.modal {
        case .confirm: feedback.finishConfirm(false)
        case .error: feedback.finishError()
        default: break
        }
    }
}

extension FeedbackCenter.PromptRequest: Equatable {
    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
}

extension View {
    func feedbackHost(_ feedback: FeedbackCenter) -> some View {
        modifier(FeedbackHost(feedback: feedback))
    }
}

/// A titled sheet with one labelled text field, Cancel and the confirm button.
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
        Form {
            Section {
                TextField(request.label, text: $value, prompt: request.placeholder.map(Text.init))
                    .onSubmit(submit)
                if let error {
                    Text(error).foregroundStyle(.red)
                }
            } header: {
                Text(request.title).font(.headline)
            } footer: {
                if let description = request.description {
                    Text(description).foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 420)
        .fixedSize(horizontal: false, vertical: true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.t("common.cancel")) { finish(nil) }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(request.confirmLabel, action: submit)
                    .disabled(trimmed.isEmpty)
            }
        }
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
