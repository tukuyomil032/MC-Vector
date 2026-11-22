// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// One icon button of a MorphingBar.
public struct GlassBarItem: Identifiable {
    public let id: String
    /// Shown as the tooltip and read by VoiceOver.
    public let title: String
    public let symbol: String
    public let isEnabled: Bool
    public let action: () -> Void
    /// A popover the item opens instead of acting at once (attached only while open).
    public var popover: GlassBarPopover?

    public init(
        id: String, title: String, symbol: String, isEnabled: Bool = true, popover: GlassBarPopover? = nil,
        action: @escaping () -> Void = {}
    ) {
        self.id = id
        self.title = title
        self.symbol = symbol
        self.isEnabled = isEnabled
        self.popover = popover
        self.action = action
    }
}

/// A popover hanging from a bar item.
public struct GlassBarPopover {
    public let isPresented: Binding<Bool>
    public let content: AnyView

    public init<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: () -> Content) {
        self.isPresented = isPresented
        self.content = AnyView(content())
    }
}

/// Buttons that belong together; each group is one piece of glass.
public struct GlassBarGroup: Identifiable {
    public let id: String
    public let items: [GlassBarItem]

    public init(id: String, items: [GlassBarItem]) {
        self.id = id
        self.items = items
    }
}
