// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Ties a piece of glass to an identity, so it morphs out of and into its
/// neighbors on macOS 26 and moves to its new place on macOS 15.
struct GlassIdentity: ViewModifier {
    let id: String
    let namespace: Namespace.ID
    @Environment(\.glassAppearance) private var appearance

    func body(content: Content) -> some View {
        if appearance.usesLiquidGlass, #available(macOS 26, *) {
            content.glassEffectID(id, in: namespace)
        } else {
            content.matchedGeometryEffect(id: id, in: namespace)
        }
    }
}

extension View {
    func glassIdentity(_ id: String, in namespace: Namespace.ID) -> some View {
        modifier(GlassIdentity(id: id, namespace: namespace))
    }
}
