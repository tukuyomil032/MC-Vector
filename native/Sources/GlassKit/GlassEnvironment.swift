// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// How GlassKit draws and moves, set through the environment. The defaults
/// follow the system; the UI Playground overrides them to compare looks.
public struct GlassAppearance: Sendable, Equatable {
    /// Draw the macOS 15 look (a material) even where Liquid Glass exists.
    public var forcesFallback = false
    /// 1 is normal speed; 4 plays every GlassKit animation at a quarter speed.
    public var slowdown: Double = 1
    /// Overrides the system's Reduce Motion when set.
    public var reducesMotion: Bool?

    public init(forcesFallback: Bool = false, slowdown: Double = 1, reducesMotion: Bool? = nil) {
        self.forcesFallback = forcesFallback
        self.slowdown = slowdown
        self.reducesMotion = reducesMotion
    }

    /// Whether real Liquid Glass is drawn.
    public var usesLiquidGlass: Bool {
        guard !forcesFallback else { return false }
        if #available(macOS 26, *) { return true }
        return false
    }
}

extension EnvironmentValues {
    @Entry public var glassAppearance = GlassAppearance()
}
