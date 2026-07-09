import AppKit
import Observation
import SwiftUI

/// Owns a lazily-created `FloatingConsolePanel` for one server's console and
/// drives its show/hide/dismiss lifecycle from SwiftUI.
///
/// Held as `@State` in `ServerDetailView`, so it is recreated whenever that
/// view's own `@State` is -- i.e. whenever `RootView`'s `.id(server.id)`
/// selects a different server (see `RootView`'s doc comment on that
/// modifier). `ServerDetailView` calls `dismiss()` from `.onDisappear` so a
/// panel for a previously-selected server can never outlive it.
///
/// **Why this is safe against the single-consumer stdout stream
/// constraint**: this controller never calls `ServerLogViewModel
/// .streamLogs()` itself, and the `ServerLogView` inside the panel it
/// creates has no `.task` of its own (see that view's doc comment). Only
/// `ServerDetailView`'s own `.task(id: server.status)` calls `streamLogs()`,
/// exactly once, regardless of whether this panel is open, closed, or was
/// never shown at all. This controller and the inline "Console Output"
/// section both only *read* the same `ServerLogViewModel.lines`, which is
/// safe from any number of SwiftUI views -- unlike calling `streamLogs()`
/// (and transitively `ServerProcessService.stdoutLines(serverId:)`) more
/// than once for the same running server, which is documented there as
/// unsafe.
@MainActor
@Observable
final class FloatingConsolePanelController: NSObject {
    private(set) var isVisible = false

    private var panel: FloatingConsolePanel<FloatingConsoleContentView>?
    private let serverName: String
    private let viewModel: ServerLogViewModel

    init(serverName: String, viewModel: ServerLogViewModel) {
        self.serverName = serverName
        self.viewModel = viewModel
    }

    /// Shows the panel, creating it on first call. `orderFront(nil)` (not
    /// `makeKeyAndOrderFront`) matches this panel's `.nonactivatingPanel`
    /// design: it should float into view without taking key window status
    /// or activating the app, per the confirmed spike design.
    func show() {
        let panel = self.panel ?? self.makePanel()
        self.panel = panel
        panel.orderFront(nil)
        self.isVisible = true
    }

    /// Hides the panel without discarding it -- a subsequent `show()`
    /// reuses the same `NSPanel`/`NSHostingView`/`ServerLogView`, cheaper
    /// than recreating the panel on every toggle and preserving its
    /// on-screen frame across hides.
    func hide() {
        self.panel?.orderOut(nil)
        self.isVisible = false
    }

    func toggle() {
        if self.isVisible {
            self.hide()
        } else {
            self.show()
        }
    }

    /// Fully closes and releases the panel. Called from
    /// `ServerDetailView.onDisappear` so a panel never outlives the server
    /// it was showing -- `hide()` alone would leave it orphaned on screen,
    /// still retaining this now-stale `viewModel`, once `ServerDetailView`
    /// itself is torn down (e.g. a different server is selected).
    func dismiss() {
        self.panel?.close()
        self.panel = nil
        self.isVisible = false
    }

    private func makePanel() -> FloatingConsolePanel<FloatingConsoleContentView> {
        let content = FloatingConsoleContentView(serverName: self.serverName, viewModel: self.viewModel)
        let panel = FloatingConsolePanel(title: "Console — \(self.serverName)", content: content)
        panel.delegate = self
        return panel
    }
}

extension FloatingConsolePanelController: NSWindowDelegate {
    /// Handles the panel's native close button (present because
    /// `.closable` is in its `styleMask`), which calls `NSWindow.close()`
    /// directly and bypasses `dismiss()`. Without this, `isVisible` would
    /// stay stuck at `true` after the user closes the panel by hand, and a
    /// later `show()` would call `orderFront(nil)` on an already-closed
    /// window, which does not reliably reopen it -- so this resets to the
    /// same "not shown" state `dismiss()` produces, ready for `show()` to
    /// lazily recreate the panel next time.
    func windowWillClose(_: Notification) {
        self.panel = nil
        self.isVisible = false
    }
}
