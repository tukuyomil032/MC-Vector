// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A progress bar with a label and a percentage that rolls. Progress events
/// can arrive many times a second; the number only changes when the whole
/// percent changes, so each roll gets to finish instead of restarting every
/// frame, and the bar eases between values. `fraction == nil` shows an
/// indeterminate bar.
public struct RollingPercent: View {
    let label: String
    let fraction: Double?

    public init(label: String, fraction: Double?) {
        self.label = label
        self.fraction = fraction
    }

    public var body: some View {
        let percent = fraction.map { Int(($0 * 100).rounded(.down)).clamped(to: 0...100) }
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                Spacer()
                if let percent {
                    Text("\(percent)%")
                        .monospacedDigit()
                        .contentTransition(.numericText(value: Double(percent)))
                        .animation(Motion.value, value: percent)
                }
            }
            .font(.callout)
            .foregroundStyle(.secondary)
            if let percent {
                ProgressView(value: Double(percent), total: 100)
                    .animation(Motion.value, value: percent)
            } else {
                ProgressView()
            }
        }
        .progressViewStyle(.linear)
        .accessibilityElement(children: .combine)
    }
}

extension Comparable {
    fileprivate func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
