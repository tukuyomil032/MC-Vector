// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A choice opened by a click: a glass button showing the current value, and
/// a popover (the look of the settings ⓘ hint) listing the options with a
/// check on the current one. Hints open on hover; choices open on click.
public struct GlassChoiceButton<Value: Hashable>: View {
    private let symbol: String?
    @Binding private var selection: Value
    private let options: [Value]
    private let title: (Value) -> String
    private let section: ((Value) -> String?)?
    @State private var isOpen = false

    /// `section` names the group an option belongs to; a heading is shown
    /// where it changes (options are listed in the order given).
    public init(
        symbol: String? = nil, selection: Binding<Value>, options: [Value], title: @escaping (Value) -> String,
        section: ((Value) -> String?)? = nil
    ) {
        self.symbol = symbol
        self._selection = selection
        self.options = options
        self.title = title
        self.section = section
    }

    public var body: some View {
        GlassMotionReader { motion in
            let button = Button {
                isOpen.toggle()
            } label: {
                HStack(spacing: 6) {
                    if let symbol { Image(systemName: symbol) }
                    Text(title(selection))
                    Image(systemName: "chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .contentShape(Capsule())
                .glassSurface(Capsule(), interactive: true)
            }
            .buttonStyle(.plain)
            .animation(motion.quick, value: isOpen)
            .accessibilityValue(title(selection))

            // Attached only while open, like every GlassKit popover.
            if isOpen {
                button.popover(isPresented: $isOpen, arrowEdge: .bottom) {
                    GlassChoiceList(options: options, selection: selection, title: title, section: section) { picked in
                        selection = picked
                        isOpen = false
                    }
                }
            } else {
                button
            }
        }
    }
}
