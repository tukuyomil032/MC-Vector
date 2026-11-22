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
                if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
                    CoreClient.setAppVersion(version)
                }
                return
            case .heldByOther(let owner):
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
    @State private var feedback: FeedbackCenter
    @State private var runtime: ServerRuntime

    init() {
        let feedback = FeedbackCenter()
        _feedback = State(initialValue: feedback)
        _runtime = State(initialValue: ServerRuntime(feedback: feedback))
    }

    var body: some Scene {
        // One window, like the Tauri app (ui-parity-a D1). Minimum 720x520, default 1200x800.
        Window("MC-Vector", id: "main") {
            RootView()
                .environment(app)
                .environment(feedback)
                .environment(runtime)
                .frame(minWidth: 720, minHeight: 520)
                // Numbers and dates follow the app language, not the system's.
                .environment(\.locale, Locale(identifier: L10n.language))
                .onAppear { appDelegate.attach(app: app, feedback: feedback, runtime: runtime) }
        }
        .defaultSize(width: 1200, height: 800)
        .commands {
            ShellCommands(app: app)
            EditorCommands()
        }

        // The app's settings and one server's General Settings and properties
        // (⌘, opens the App tile, ⌘; the Server tile).
        Window(L10n.t("nav.settings"), id: SettingsWindow.windowID) {
            SettingsWindow()
                .environment(app)
                .environment(runtime)
                .environment(\.locale, Locale(identifier: L10n.language))
        }
        .defaultSize(width: 900, height: 680)
        .windowToolbarStyle(.unified)
        .windowResizability(.contentMinSize)

        #if DEBUG
            // Develop › UI Playground (⌥⌘P): GlassKit's parts on their own.
            Window("UI Playground", id: PlaygroundWindow.windowID) {
                PlaygroundWindow()
                    .environment(\.locale, Locale(identifier: L10n.language))
            }
            .defaultSize(width: 1180, height: 760)
        #endif
    }
}

/// Menu commands that carry React's keyboard shortcuts (ui-parity-a D11).
struct ShellCommands: Commands {
    let app: AppState
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        // One Settings window holds the app's and the servers' settings.
        CommandGroup(replacing: .appSettings) {
            Button(L10n.t("native.menu.settings")) { app.openSettings() }
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
            Divider()
            Button(L10n.t("native.serverSettings.menu")) { app.openServerSettings() }
                .keyboardShortcut(";", modifiers: .command)
                .disabled(app.servers.isEmpty)
        }
        #if DEBUG
            CommandMenu(playgroundText("開発", "Develop")) {
                Button("UI Playground") { openWindow(id: PlaygroundWindow.windowID) }
                    .keyboardShortcut("p", modifiers: [.command, .option])
            }
        #endif
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var hotKeys: GlobalHotKeys?
    private var autoBackups: AutoBackupScheduler?
    private weak var runtime: ServerRuntime?
    private weak var app: AppState?
    private var isQuitting = false

    /// Starts listening to running servers and registers the system-wide
    /// ⌘⇧S (start/stop) and ⌘⇧R (restart) for the selected server.
    func attach(app: AppState, feedback: FeedbackCenter, runtime: ServerRuntime) {
        guard hotKeys == nil else { return }
        self.app = app
        self.runtime = runtime
        runtime.subscribe()
        let scheduler = AutoBackupScheduler(feedback: feedback)
        scheduler.onChange = { serverID in app.backupsChanged(serverID) }
        scheduler.start()
        autoBackups = scheduler
        hotKeys = GlobalHotKeys { action in
            guard let serverID = app.selectedServerID else { return }
            Task { @MainActor in
                switch action {
                case .startStop: await runtime.toggle(serverID)
                case .restart: await runtime.restart(serverID)
                }
            }
        }
    }

    /// Closing the last window quits, like the Tauri app (ui-parity.md decision).
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    /// ⌘Q and closing the window both come here. With servers running, ask
    /// first (React `use-exit-confirmation`), then stop them all before quitting.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if isQuitting { return .terminateLater }
        if let app, app.hasUnsavedEditor || app.isEditorSaving {
            guard QuitConfirmation.discardUnsavedEdits() else { return .terminateCancel }
            app.hasUnsavedEditor = false
        }
        guard let runtime, !runtime.activeServerIDs.isEmpty else { return .terminateNow }
        guard QuitConfirmation.run() else { return .terminateCancel }
        isQuitting = true
        Task { @MainActor in
            try? await CoreClient.shutdownAllServers()
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}
