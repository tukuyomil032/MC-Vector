// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The springs GlassKit moves with, resolved against Reduce Motion and the
/// appearance's slowdown. Nil means "no animation".
struct GlassMotion {
    let appearance: GlassAppearance
    let systemReducesMotion: Bool

    private var reduces: Bool { appearance.reducesMotion ?? systemReducesMotion }

    /// Pieces of glass appearing, leaving and changing shape.
    var morph: Animation? {
        reduces ? nil : .spring(response: 0.42 * appearance.slowdown, dampingFraction: 0.78)
    }

    /// A selection sliding between segments.
    var slide: Animation? {
        reduces ? nil : .spring(response: 0.34 * appearance.slowdown, dampingFraction: 0.82)
    }

    /// Small state changes such as a focus ring or a chevron turning.
    var quick: Animation? {
        reduces ? nil : .easeOut(duration: 0.15 * appearance.slowdown)
    }
}

/// Reads the environment GlassMotion needs.
struct GlassMotionReader<Content: View>: View {
    @Environment(\.glassAppearance) private var appearance
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder var content: (GlassMotion) -> Content

    var body: some View {
        content(GlassMotion(appearance: appearance, systemReducesMotion: reduceMotion))
    }
}
