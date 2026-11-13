// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// Entry point. The cross-edition lock is checked before SwiftUI starts, so a
/// refused launch never creates a window or touches shared data (NAT-010).
/// Showing the alert from an app delegate is too late: SwiftUI creates the
/// windows while the alert's modal loop is running.
@main
enum Launcher {
    @MainActor
    static func main() {
        Preflight.run()
        MCVectorApp.main()
    }
}

@MainActor
enum Preflight {
    static func run() {
        do {
            switch try CoreClient.start() {
            case .ready:
                // The core is started, so config.json can be read (NAT-008).
                L10n.configure(locale: CoreClient.configLocale())
                return
            case let .heldByOther(owner):
                // The other edition holds the data folder: never read config.json here.
                L10n.configure(locale: nil)
                prepareForAlert()
                OtherEditionAlert.run(owner: owner)
                exit(0)
            }
        } catch {
            L10n.configure(locale: nil)
            prepareForAlert()
            StartupFailureAlert.run(error: error)
            exit(1)
        }
    }

    /// NSAlert needs the shared application and a regular activation policy
    /// to come to the front before NSApplication.run() has been called.
    private static func prepareForAlert() {
        NSApplication.shared.setActivationPolicy(.regular)
    }
}

struct MCVectorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var app = AppState()
    @State private var feedback = FeedbackCenter()

    var body: some Scene {
        // One window, like the Tauri app (ui-parity-a D1). Minimum 720x520, default 1200x800.
        Window("MC-Vector", id: "main") {
            RootView()
                .environment(app)
                .environment(feedback)
                .frame(minWidth: 720, minHeight: 520)
                .onAppear { appDelegate.attach(app: app, feedback: feedback) }
        }
        .defaultSize(width: 1200, height: 800)
        .commands { ShellCommands(app: app) }
    }
}

/// Menu commands that carry React's keyboard shortcuts (ui-parity-a D11).
struct ShellCommands: Commands {
    let app: AppState

    var body: some Commands {
        CommandGroup(replacing: .appSettings) {
            Button(L10n.t("nav.settings")) { app.navigate(to: .appSettings) }
                .keyboardShortcut(",", modifiers: .command)
        }
        CommandGroup(after: .sidebar) {
            // React's ⌘K palette is the toolbar search field here.
            Button(L10n.t("commandPalette.label")) { app.isSearchFocused = true }
                .keyboardShortcut("k", modifiers: .command)
            Button(L10n.t("native.menu.nextView")) { app.cycleServerView(forward: true) }
                .keyboardShortcut(.tab, modifiers: .control)
            Button(L10n.t("native.menu.previousView")) { app.cycleServerView(forward: false) }
                .keyboardShortcut(.tab, modifiers: [.control, .shift])
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var hotKeys: GlobalHotKeys?

    /// Registers the system-wide ⌘⇧S / ⌘⇧R once the UI state exists. The server
    /// actions are wired in phase 6; until then they explain that they are not available.
    func attach(app: AppState, feedback: FeedbackCenter) {
        guard hotKeys == nil else { return }
        hotKeys = GlobalHotKeys { action in
            switch action {
            case .startStop, .restart:
                feedback.info(L10n.t("native.notPorted"))
            }
        }
    }

    /// Closing the last window quits, like the Tauri app (ui-parity.md decision).
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
