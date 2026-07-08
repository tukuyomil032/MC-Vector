import AppKit
import Core

@MainActor
enum PanelSpikeRunner {
    static func runNSPanelBridge() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let panel = NonactivatingGlassPanel()
        panel.center()
        panel.makeKeyAndOrderFront(nil)
        app.run()
    }

    static func runSwiftUIWindowLevel() {
        SwiftUIWindowLevelSpike.main()
    }
}
