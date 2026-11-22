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
                case .confirm(let request):
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
                case .confirm(let request):
                    if let description = request.description { Text(description) }
                case .error(let request):
                    if let message = request.message { Text(message) }
                default:
                    EmptyView()
                }
            }
            .sheet(
                item: Binding(
                    get: { promptRequest },
                    set: { if $0 == nil, promptRequest != nil { feedback.finishPrompt(nil) } }
                )
            ) { request in
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
        case .confirm(let request): request.title
        case .error(let request): request.title
        default: ""
        }
    }

    private var promptRequest: FeedbackCenter.PromptRequest? {
        if case .prompt(let request) = feedback.modal { return request }
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

/// A titled sheet with one text field, Cancel and the confirm button. The
/// title says what is being made or changed, and the field runs the full
/// width under it, both on the same leading edge.
private struct PromptSheet: View {
    let request: FeedbackCenter.PromptRequest
    let finish: (String?) -> Void
    @State private var value: String
    @State private var selection: TextSelection?
    @State private var error: String?
    @FocusState private var isFocused: Bool

    init(request: FeedbackCenter.PromptRequest, finish: @escaping (String?) -> Void) {
        self.request = request
        self.finish = finish
        _value = State(initialValue: request.defaultValue)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(request.title)
                .font(.headline)
            if let description = request.description {
                Text(description)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            TextField(request.label, text: $value, selection: $selection, prompt: request.placeholder.map(Text.init))
                .textFieldStyle(.roundedBorder)
                .labelsHidden()
                .focused($isFocused)
                .onSubmit(submit)
                // The error is about the submitted value; editing starts over.
                .onChange(of: value) { error = nil }
            if let error {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button(L10n.t("common.cancel")) { finish(nil) }
                    .keyboardShortcut(.cancelAction)
                Button(request.confirmLabel, action: submit)
                    .keyboardShortcut(.defaultAction)
                    .disabled(trimmed.isEmpty)
            }
            .padding(.top, 4)
        }
        .padding(20)
        .frame(width: 400)
        .onAppear {
            isFocused = true
            // The field selects everything when it takes focus; narrow it afterwards.
            if request.selectsBaseName {
                Task {
                    try? await Task.sleep(for: .milliseconds(60))
                    selectBaseName()
                }
            }
        }
    }

    /// "server.properties" opens with "server" selected, like Finder's rename.
    private func selectBaseName() {
        let ext = (value as NSString).pathExtension
        let end =
            ext.isEmpty || value.hasPrefix(".") && !value.dropFirst().contains(".")
            ? value.endIndex : value.index(value.endIndex, offsetBy: -(ext.count + 1))
        selection = TextSelection(range: value.startIndex..<end)
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
