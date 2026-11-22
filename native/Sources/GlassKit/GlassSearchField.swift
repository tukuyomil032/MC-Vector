// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A search field on glass: magnifying glass, the text, a clear button while
/// there is text, and an accent ring while focused.
public struct GlassSearchField: View {
    @Binding private var text: String
    private let prompt: String
    private let clearLabel: String
    private let onSubmit: () -> Void
    @FocusState private var focused: Bool

    public init(text: Binding<String>, prompt: String, clearLabel: String, onSubmit: @escaping () -> Void = {}) {
        self._text = text
        self.prompt = prompt
        self.clearLabel = clearLabel
        self.onSubmit = onSubmit
    }

    public var body: some View {
        GlassMotionReader { motion in
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField(prompt, text: $text)
                    .textFieldStyle(.plain)
                    .focused($focused)
                    .onSubmit(onSubmit)
                if !text.isEmpty {
                    Button(clearLabel, systemImage: "xmark.circle.fill") { text = "" }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glassSurface(Capsule(), interactive: true)
            .overlay(Capsule().stroke(Color.accentColor.opacity(focused ? 0.8 : 0), lineWidth: 1.5))
            .animation(motion.quick, value: focused)
        }
    }
}
