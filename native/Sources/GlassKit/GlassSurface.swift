// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Liquid Glass on macOS 26, a material on macOS 15 (or when the fallback is
/// forced). Every GlassKit part draws its glass through this.
struct GlassSurface<S: Shape>: ViewModifier {
    let shape: S
    var interactive = false
    var tint: Color?
    @Environment(\.glassAppearance) private var appearance

    func body(content: Content) -> some View {
        if appearance.usesLiquidGlass, #available(macOS 26, *) {
            content.glassEffect(glass, in: shape)
        } else {
            content
                .background(.regularMaterial, in: shape)
                .background(tint.map { AnyShapeStyle($0.opacity(0.35)) } ?? AnyShapeStyle(.clear), in: shape)
                .overlay(shape.stroke(.white.opacity(0.14), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
        }
    }

    @available(macOS 26, *)
    private var glass: Glass {
        var glass = Glass.regular
        if let tint { glass = glass.tint(tint) }
        return interactive ? glass.interactive() : glass
    }
}

extension View {
    /// Puts the view on glass: Liquid Glass on macOS 26, a material before it.
    /// `interactive` lets Liquid Glass answer the pointer.
    public func glassSurface<S: Shape>(_ shape: S, interactive: Bool = false, tint: Color? = nil) -> some View {
        modifier(GlassSurface(shape: shape, interactive: interactive, tint: tint))
    }
}
