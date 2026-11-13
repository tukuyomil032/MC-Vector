// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Bottom-right toast stack (React arc `ToastStack`, TOAST-* rows): status icon on the
/// leading side, title (and description) in the middle, close button on the trailing side.
/// Up to three cards are visible when collapsed; hovering fans the stack out and pauses timers.
struct ToastStackView: View {
    @Bindable var feedback: FeedbackCenter

    var body: some View {
        let shown = feedback.isStackExpanded
            ? feedback.toasts
            : Array(feedback.toasts.suffix(FeedbackCenter.visibleToasts))
        VStack(alignment: .trailing, spacing: 10) {
            ForEach(shown) { toast in
                ToastCard(toast: toast) { feedback.dismiss(toast.id) }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .frame(width: 360, alignment: .trailing)
        .padding(16)
        .onHover { feedback.isStackExpanded = $0 }
        .animation(.snappy, value: feedback.toasts)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(L10n.t("feedback.toast.region")))
    }
}

private struct ToastCard: View {
    let toast: FeedbackCenter.Toast
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            icon
                .font(.system(size: 16, weight: .medium))
                .frame(width: 20, height: 20)
            VStack(alignment: .leading, spacing: 4) {
                Text(toast.title)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                if let description = toast.description {
                    Text(description)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if toast.kind == .loading, let progress = toast.progress {
                    ProgressView(value: Double(progress), total: 100)
                        .progressViewStyle(.linear)
                }
                if let title = toast.actionTitle, let action = toast.action {
                    Button(title) {
                        action()
                        dismiss()
                    }
                    .controlSize(.small)
                }
            }
            Spacer(minLength: 8)
            Button(action: dismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help(L10n.t("feedback.toast.dismiss"))
            .accessibilityLabel(Text(L10n.t("feedback.toast.dismiss")))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(.separator, lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
    }

    @ViewBuilder
    private var icon: some View {
        switch toast.kind {
        case .success:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .error:
            Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        case .warning:
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        case .info:
            Image(systemName: "info.circle.fill").foregroundStyle(.tint)
        case .loading:
            ProgressView().controlSize(.small)
        }
    }
}
