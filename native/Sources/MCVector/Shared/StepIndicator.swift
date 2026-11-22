// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// Numbered steps joined by a line, like the React Stepper: done steps show a
/// check, the current one a ring, later ones a muted number. The line fills
/// and the marks change with a spring as `current` advances.
struct StepIndicator: View {
    let titles: [String]
    /// Index of the current step; `titles.count` means all done.
    let current: Int

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(titles.enumerated()), id: \.offset) { index, title in
                VStack(spacing: 6) {
                    HStack(spacing: 0) {
                        connector(filled: index <= current, hidden: index == 0)
                        mark(index)
                        connector(filled: index < current, hidden: index == titles.count - 1)
                    }
                    Text(title)
                        .font(.caption)
                        .foregroundStyle(index <= current ? .primary : .secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
                .frame(maxWidth: .infinity)
            }
        }
        .animation(Motion.spring, value: current)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func mark(_ index: Int) -> some View {
        ZStack {
            if index < current {
                Circle().fill(Color.accentColor)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .transition(.scale.combined(with: .opacity))
            } else if index == current {
                Circle().fill(Color.accentColor.opacity(0.15))
                Circle().strokeBorder(Color.accentColor, lineWidth: 2)
                Text("\(index + 1)").font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
            } else {
                Circle().strokeBorder(.tertiary, lineWidth: 1.5)
                Text("\(index + 1)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(width: 24, height: 24)
    }

    private func connector(filled: Bool, hidden: Bool) -> some View {
        ZStack(alignment: .leading) {
            Capsule().fill(.quaternary)
            Capsule().fill(Color.accentColor).scaleEffect(x: filled ? 1 : 0, anchor: .leading)
        }
        .frame(height: 2)
        .opacity(hidden ? 0 : 1)
    }
}
