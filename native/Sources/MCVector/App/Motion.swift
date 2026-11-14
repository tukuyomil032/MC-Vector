// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import SwiftUI

/// The app's shared motion, so every screen moves the same way. With Reduce
/// Motion on, movement and scaling become short fades.
@MainActor
enum Motion {
    /// Debug captures can force the reduced variants.
    static var forceReducedMotion = false

    static var isReduced: Bool {
        forceReducedMotion || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    /// Switching screens, showing and hiding parts of a screen.
    static var standard: Animation {
        isReduced ? .easeInOut(duration: 0.15) : .smooth(duration: 0.35)
    }

    /// Feedback to a click or a selection.
    static var snappy: Animation {
        isReduced ? .easeInOut(duration: 0.12) : .snappy(duration: 0.25)
    }

    /// Toasts, sheet contents and things that arrive.
    static var spring: Animation {
        isReduced ? .easeInOut(duration: 0.15) : .spring(response: 0.45, dampingFraction: 0.82)
    }

    /// Numbers rolling to a new value.
    static var value: Animation {
        isReduced ? .easeInOut(duration: 0.15) : .smooth(duration: 0.6)
    }
}

@MainActor
extension AnyTransition {
    static var motionFade: AnyTransition { .opacity }

    /// Fades in while rising a few points (screen content, new rows, errors).
    static var motionRise: AnyTransition {
        Motion.isReduced
            ? .opacity
            : .asymmetric(
                insertion: .opacity.combined(with: .offset(y: 10)).combined(with: .scale(scale: 0.985)),
                removal: .opacity
            )
    }

    /// Slides from an edge (bars that open and close).
    static func motionSlide(edge: Edge) -> AnyTransition {
        Motion.isReduced ? .opacity : .move(edge: edge).combined(with: .opacity)
    }

    /// Grows from the center (floating buttons).
    static var motionPop: AnyTransition {
        Motion.isReduced ? .opacity : .scale(scale: 0.85).combined(with: .opacity)
    }
}

extension View {
    /// Fades and rises into place when `isVisible` turns on, `index` steps later
    /// than the first item, so cards and sections arrive one after another.
    func staggeredAppear(index: Int, isVisible: Bool) -> some View {
        modifier(StaggeredAppear(index: index, isVisible: isVisible))
    }
}

private struct StaggeredAppear: ViewModifier {
    let index: Int
    let isVisible: Bool

    func body(content: Content) -> some View {
        let reduced = Motion.isReduced
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible || reduced ? 0 : 12)
            .animation(Motion.spring.delay(reduced ? 0 : Double(index) * 0.05), value: isVisible)
    }
}

/// Lays children out side by side with exactly equal widths, unlike HStack,
/// which hands out width by each child's minimum size. Height is the tallest
/// child's height unless the container proposes one.
struct EqualColumns: Layout {
    var spacing: CGFloat = 14

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard !subviews.isEmpty else { return .zero }
        let gaps = spacing * CGFloat(subviews.count - 1)
        let width = proposal.width
            ?? subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(0, +) + gaps
        let column = max(0, (width - gaps) / CGFloat(subviews.count))
        let height = proposal.height
            ?? subviews.map { $0.sizeThatFits(ProposedViewSize(width: column, height: nil)).height }.max()
            ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard !subviews.isEmpty else { return }
        let gaps = spacing * CGFloat(subviews.count - 1)
        let column = max(0, (bounds.width - gaps) / CGFloat(subviews.count))
        for (index, subview) in subviews.enumerated() {
            subview.place(
                at: CGPoint(x: bounds.minX + CGFloat(index) * (column + spacing), y: bounds.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: column, height: bounds.height)
            )
        }
    }
}
