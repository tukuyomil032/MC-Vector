// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import SwiftUI

/// The app's shared motion, so every screen moves the same way. With Reduce
/// Motion on, movement and scaling become short fades.
@MainActor
public enum Motion {
    /// Debug captures can force the reduced variants.
    public static var forceReducedMotion = false

    public static var isReduced: Bool {
        forceReducedMotion || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    /// Switching screens, showing and hiding parts of a screen.
    public static var standard: Animation {
        isReduced ? .easeInOut(duration: 0.15) : .smooth(duration: 0.35)
    }

    /// Feedback to a click or a selection.
    public static var snappy: Animation {
        isReduced ? .easeInOut(duration: 0.12) : .snappy(duration: 0.25)
    }

    /// Toasts, sheet contents and things that arrive.
    public static var spring: Animation {
        isReduced ? .easeInOut(duration: 0.15) : .spring(response: 0.45, dampingFraction: 0.82)
    }

    /// Numbers rolling to a new value.
    public static var value: Animation {
        isReduced ? .easeInOut(duration: 0.15) : .smooth(duration: 0.6)
    }
}

@MainActor
extension AnyTransition {
    public static var motionFade: AnyTransition { .opacity }

    /// Fades in while rising a few points (screen content, new rows, errors).
    public static var motionRise: AnyTransition {
        Motion.isReduced
            ? .opacity
            : .asymmetric(
                insertion: .opacity.combined(with: .offset(y: 10)).combined(with: .scale(scale: 0.985)),
                removal: .opacity
            )
    }

    /// Slides from an edge (bars that open and close).
    public static func motionSlide(edge: Edge) -> AnyTransition {
        Motion.isReduced ? .opacity : .move(edge: edge).combined(with: .opacity)
    }

    /// Grows from the center (floating buttons).
    public static var motionPop: AnyTransition {
        Motion.isReduced ? .opacity : .scale(scale: 0.85).combined(with: .opacity)
    }
}
