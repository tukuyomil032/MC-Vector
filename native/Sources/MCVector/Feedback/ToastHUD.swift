// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The macOS-style transient message: one capsule near the top of the window with
/// an SF Symbol and a short line of text, on the system material (Liquid Glass
/// on macOS 26). It slides in, fades out on its own, and goes away on click.
struct ToastHUD: View {
    @Bindable var feedback: FeedbackCenter

    var body: some View {
        ZStack {
            if let toast = feedback.toast {
                ToastCapsule(toast: toast)
                    .onTapGesture { feedback.dismissToast() }
                    // Drops in from the top with a light bounce, leaves upward.
                    .transition(
                        Motion.isReduced
                            ? .opacity
                            : .asymmetric(
                                insertion: .move(edge: .top).combined(with: .opacity).combined(with: .scale(scale: 0.92, anchor: .top)),
                                removal: .move(edge: .top).combined(with: .opacity)
                            )
                    )
                    .id(toast.id)
            }
        }
        .padding(.top, 12)
        .animation(Motion.isReduced ? Motion.standard : .spring(duration: 0.45, bounce: 0.28), value: feedback.toast)
    }
}

private struct ToastCapsule: View {
    let toast: FeedbackCenter.Toast
    @State private var arrived = false

    var body: some View {
        let label = HStack(spacing: 8) {
            Image(systemName: toast.kind.symbol)
                .symbolRenderingMode(.multicolor)
                .foregroundStyle(tint)
                .imageScale(.large)
                .symbolEffect(.bounce, options: .nonRepeating, value: arrived)
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
        .task {
            // Bounce the icon once the capsule has landed.
            try? await Task.sleep(for: .milliseconds(180))
            arrived = true
        }
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
