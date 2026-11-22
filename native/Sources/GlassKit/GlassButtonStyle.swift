// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

extension View {
    /// SwiftUI's glass button styles on macOS 26 (`.glass`, `.glassProminent`),
    /// bordered buttons on macOS 15.
    public func glassButtonStyle(prominent: Bool = false) -> some View {
        modifier(GlassButtonStyleModifier(prominent: prominent))
    }
}

private struct GlassButtonStyleModifier: ViewModifier {
    let prominent: Bool
    @Environment(\.glassAppearance) private var appearance

    func body(content: Content) -> some View {
        if appearance.usesLiquidGlass, #available(macOS 26, *) {
            if prominent {
                content.buttonStyle(.glassProminent)
            } else {
                content.buttonStyle(.glass)
            }
        } else if prominent {
            content.buttonStyle(.borderedProminent)
        } else {
            content.buttonStyle(.bordered)
        }
    }
}
