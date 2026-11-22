// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

extension View {
    /// Rolls the digits of a number to its new value (tabular digits, the
    /// numeric content transition and the shared value animation).
    public func rollingNumber(_ value: Double) -> some View {
        monospacedDigit()
            .contentTransition(.numericText(value: value))
            .animation(Motion.value, value: value)
    }

    /// Rolls text whose digits change but which has no single numeric value,
    /// such as a version or "3 / 12".
    public func rollingText<V: Equatable>(_ trigger: V) -> some View {
        monospacedDigit()
            .contentTransition(.numericText())
            .animation(Motion.value, value: trigger)
    }
}
