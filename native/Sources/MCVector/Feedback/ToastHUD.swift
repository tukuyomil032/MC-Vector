// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The macOS-style transient message: one capsule near the top of the window with
/// an SF Symbol and a short line of text, on the system material (Liquid Glass
/// on macOS 26). It slides in, fades out on its own, and goes away on click.
struct ToastHUD: View {
    @Bindable var feedback: FeedbackCenter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if let toast = feedback.toast {
                ToastCapsule(toast: toast)
                    .onTapGesture { feedback.dismissToast() }
                    .transition(
                        reduceMotion
                            ? .opacity
                            : .move(edge: .top).combined(with: .opacity)
                    )
                    .id(toast.id)
            }
        }
        .padding(.top, 12)
        .animation(reduceMotion ? .easeInOut(duration: 0.15) : .spring(duration: 0.35, bounce: 0.2), value: feedback.toast)
    }
}

private struct ToastCapsule: View {
    let toast: FeedbackCenter.Toast

    var body: some View {
        let label = HStack(spacing: 8) {
            Image(systemName: toast.kind.symbol)
                .symbolRenderingMode(.multicolor)
                .foregroundStyle(tint)
                .imageScale(.large)
            Text(toast.title)
                .font(.callout.weight(.medium))
                .lineLimit(2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)

        Group {
            if #available(macOS 26.0, *) {
                label.glassEffect(.regular, in: .capsule)
            } else {
                label
                    .background(.regularMaterial, in: Capsule())
                    .overlay(Capsule().strokeBorder(.separator, lineWidth: 0.5))
                    .shadow(color: .black.opacity(0.15), radius: 10, y: 3)
            }
        }
        .frame(maxWidth: 480)
    }

    private var tint: Color {
        switch toast.kind {
        case .success: .green
        case .info: .accentColor
        case .warning: .orange
        case .error: .red
        }
    }
}
