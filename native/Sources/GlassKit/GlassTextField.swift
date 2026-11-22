// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A text field on glass, with an accent ring while focused.
public struct GlassTextField: View {
    private let title: String
    @Binding private var text: String
    private let onSubmit: () -> Void
    @FocusState private var focused: Bool

    public init(_ title: String, text: Binding<String>, onSubmit: @escaping () -> Void = {}) {
        self.title = title
        self._text = text
        self.onSubmit = onSubmit
    }

    public var body: some View {
        GlassMotionReader { motion in
            TextField(title, text: $text)
                .textFieldStyle(.plain)
                .focused($focused)
                .onSubmit(onSubmit)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .glassSurface(RoundedRectangle(cornerRadius: 10, style: .continuous), interactive: true)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.accentColor.opacity(focused ? 0.8 : 0), lineWidth: 1.5)
                )
                .animation(motion.quick, value: focused)
        }
    }
}
