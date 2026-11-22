// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Lays children out side by side with exactly equal widths, unlike HStack,
/// which hands out width by each child's minimum size. Height is the tallest
/// child's height unless the container proposes one.
struct EqualColumns: Layout {
    var spacing: CGFloat = 14

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard !subviews.isEmpty else { return .zero }
        let gaps = spacing * CGFloat(subviews.count - 1)
        let width =
            proposal.width
            ?? subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(0, +) + gaps
        let column = max(0, (width - gaps) / CGFloat(subviews.count))
        let height =
            proposal.height
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
