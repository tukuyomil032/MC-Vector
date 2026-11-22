// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Groups glass so pieces closer than `spacing` melt into each other while
/// they move (GlassEffectContainer on macOS 26; a plain container before).
public struct GlassGroup<Content: View>: View {
    private let spacing: CGFloat
    private let content: Content
    @Environment(\.glassAppearance) private var appearance

    public init(spacing: CGFloat = 6, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    public var body: some View {
        if appearance.usesLiquidGlass, #available(macOS 26, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}
