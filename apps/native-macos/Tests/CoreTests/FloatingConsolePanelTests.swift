import SwiftUI
import Testing
@testable import Core

/// Mirrors `PanelSpikeTests.swift`'s style: assert the panel's static
/// AppKit configuration matches the Phase 3-A spike's confirmed-winning
/// `NonactivatingGlassPanel` settings exactly. A `Text` view stands in for
/// the real `FloatingConsoleContentView` here -- this suite is about the
/// panel's window configuration, not its hosted content.
@MainActor
@Test("FloatingConsolePanel matches the confirmed NSPanel bridge configuration")
func floatingConsolePanelConfiguration() {
    let panel = FloatingConsolePanel(title: "Console — Test Server", content: Text("log content"))

    #expect(panel.styleMask.contains(.nonactivatingPanel))
    #expect(panel.styleMask.contains(.titled))
    #expect(panel.styleMask.contains(.resizable))
    #expect(panel.styleMask.contains(.closable))
    #expect(panel.isFloatingPanel)
    #expect(panel.level == .floating)
    #expect(panel.collectionBehavior.contains(.canJoinAllSpaces))
    #expect(panel.collectionBehavior.contains(.fullScreenAuxiliary))
    #expect(panel.titlebarAppearsTransparent)
    #expect(panel.title == "Console — Test Server")
}

/// `FloatingConsolePanelController` is the riskiest piece of new state in
/// task 3-9 (it must never call `ServerLogViewModel.streamLogs()` itself --
/// see its doc comment), so its `isVisible` state machine is exercised
/// directly rather than only checking static panel configuration.
@MainActor
@Test("FloatingConsolePanelController tracks isVisible through show/hide/toggle/dismiss")
func floatingConsolePanelControllerLifecycle() {
    let service = ServerProcessService()
    let viewModel = ServerLogViewModel(serverId: "srv-1", processService: service)
    let controller = FloatingConsolePanelController(serverName: "Test Server", viewModel: viewModel)

    #expect(!controller.isVisible)

    controller.show()
    #expect(controller.isVisible)

    controller.hide()
    #expect(!controller.isVisible)

    controller.toggle()
    #expect(controller.isVisible)

    controller.toggle()
    #expect(!controller.isVisible)

    controller.show()
    #expect(controller.isVisible)

    controller.dismiss()
    #expect(!controller.isVisible)

    // show() after dismiss() must lazily recreate the panel rather than
    // reusing (or failing to reuse) a closed one.
    controller.show()
    #expect(controller.isVisible)
}
