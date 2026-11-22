// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Groups of icon buttons, each group a piece of glass. When groups come and
/// go they grow out of and melt back into their neighbors (Liquid Glass) or
/// grow and fade (macOS 15), like the iPhone's toolbar.
public struct MorphingBar: View {
    private let groups: [GlassBarGroup]
    @Namespace private var namespace
    @Environment(\.glassAppearance) private var appearance

    public init(groups: [GlassBarGroup]) {
        self.groups = groups.filter { !$0.items.isEmpty }
    }

    public var body: some View {
        GlassMotionReader { motion in
            GlassGroup(spacing: 6) {
                HStack(spacing: 8) {
                    ForEach(groups) { group in
                        HStack(spacing: 0) {
                            ForEach(group.items) { GlassBarButton(item: $0) }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .glassSurface(Capsule(), interactive: true)
                        .glassIdentity(group.id, in: namespace)
                        .transition(
                            appearance.usesLiquidGlass
                                ? .identity : .scale(scale: 0.4, anchor: .leading).combined(with: .opacity))
                    }
                }
            }
            .animation(motion.morph, value: groups.map(\.id))
            .animation(motion.morph, value: groups.flatMap { $0.items.map(\.id) })
        }
    }
}

private struct GlassBarButton: View {
    let item: GlassBarItem
    @State private var isHovering = false

    var body: some View {
        let button = Button(action: { item.popover?.isPresented.wrappedValue.toggle() ?? item.action() }) {
            Image(systemName: item.symbol)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 30, height: 30)
                .background(Circle().fill(.primary.opacity(isHovering && item.isEnabled ? 0.1 : 0)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(item.isEnabled ? .primary : .tertiary)
        .disabled(!item.isEnabled)
        .help(item.title)
        .accessibilityLabel(item.title)
        .onHover { isHovering = $0 }

        // The popover is attached only while open: a popover modifier on a
        // toolbar item fails AppKit's size check while windows are restored.
        if let popover = item.popover, popover.isPresented.wrappedValue {
            button.popover(isPresented: popover.isPresented, arrowEdge: .bottom) { popover.content }
        } else {
            button
        }
    }
}
