import AppKit
import SwiftUI

/// Task 3-9's real floating console panel, built on the NSPanel bridge
/// confirmed by the Phase 3-A spike (`NonactivatingGlassPanel`; see
/// `Sources/Core/Spikes/PanelSpike/NonactivatingGlassPanel.swift` and
/// `spec/phase3a-spike-results.md` §3-1): `.nonactivatingPanel` +
/// `isFloatingPanel` + `NSHostingView`. On real hardware this reliably
/// detects app-inactive state, which is why it was chosen over the
/// rejected pure-SwiftUI `Window` + `WindowLevel` approach (that approach
/// couldn't detect a Dock-click deactivation, only Cmd+Tab-style ones; see
/// `spec/native-macos-requirements.md` §5.4).
///
/// Style mask, `isFloatingPanel`, `level`, `collectionBehavior`, and
/// `titlebarAppearsTransparent` all match the spike's confirmed-winning
/// configuration exactly. Two deliberate differences from the spike:
///
/// 1. **Generic over `Content`** (the spike's `NonactivatingGlassPanel`
///    hardcoded `GlassSpikeContent`) so this type can host the real,
///    per-server `FloatingConsoleContentView` rather than being reused
///    as-is for a fixed demo view.
/// 2. **Title bar shows a title** (`titleVisibility` left at its `.visible`
///    default; the spike set `.hidden` since its demo content had its own
///    title text). A real floating console needs to identify which
///    server it belongs to even before the panel's own header renders.
@MainActor
final class FloatingConsolePanel<Content: View>: NSPanel {
    init(title: String, content: Content) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 320),
            styleMask: [.nonactivatingPanel, .titled, .resizable, .closable],
            backing: .buffered,
            defer: false,
        )

        self.isFloatingPanel = true
        self.level = .floating
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.titlebarAppearsTransparent = true
        self.title = title
        self.contentView = NSHostingView(rootView: content)
    }
}
