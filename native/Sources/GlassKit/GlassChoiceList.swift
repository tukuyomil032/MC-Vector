// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The options inside a GlassChoiceButton's popover. The pointer or ↑↓ light
/// a row, Return or a click picks it, Escape closes the popover.
struct GlassChoiceList<Value: Hashable>: View {
    let options: [Value]
    let selection: Value
    let title: (Value) -> String
    let section: ((Value) -> String?)?
    let pick: (Value) -> Void
    @State private var highlighted: Value?
    @FocusState private var focused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 1) {
                ForEach(Array(options.enumerated()), id: \.element) { index, option in
                    if let heading = heading(at: index) {
                        Text(heading)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 10)
                            .padding(.top, index == 0 ? 2 : 8)
                            .padding(.bottom, 2)
                    }
                    row(option)
                }
            }
            .padding(6)
        }
        .scrollBounceBehavior(.basedOnSize)
        .frame(minWidth: 200, maxHeight: 360)
        .fixedSize(horizontal: true, vertical: false)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onAppear {
            highlighted = selection
            focused = true
        }
        .onKeyPress(.downArrow) { move(1) }
        .onKeyPress(.upArrow) { move(-1) }
        .onKeyPress(.return) {
            if let highlighted { pick(highlighted) }
            return .handled
        }
    }

    /// The section title where it changes from the previous option.
    private func heading(at index: Int) -> String? {
        guard let section, let current = section(options[index]) else { return nil }
        return index > 0 && section(options[index - 1]) == current ? nil : current
    }

    private func row(_ option: Value) -> some View {
        Button {
            pick(option)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "checkmark")
                    .font(.caption.weight(.bold))
                    .opacity(option == selection ? 1 : 0)
                Text(title(option))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(highlighted == option ? Color.accentColor.opacity(0.22) : .clear))
        }
        .buttonStyle(.plain)
        .onHover { if $0 { highlighted = option } }
        .accessibilityAddTraits(option == selection ? .isSelected : [])
    }

    private func move(_ step: Int) -> KeyPress.Result {
        let index = highlighted.flatMap { options.firstIndex(of: $0) } ?? -step
        highlighted = options[min(max(index + step, 0), options.count - 1)]
        return .handled
    }
}
