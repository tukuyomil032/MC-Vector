import Testing
@testable import Core

@MainActor
@Test("NonactivatingGlassPanel is configured for floating, non-activating presentation")
func nonactivatingGlassPanelConfiguration() {
    let panel = NonactivatingGlassPanel()

    #expect(panel.styleMask.contains(.nonactivatingPanel))
    #expect(panel.isFloatingPanel)
    #expect(panel.level == .floating)
}
