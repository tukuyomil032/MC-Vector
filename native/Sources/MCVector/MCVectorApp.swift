// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// Entry point. The cross-edition lock is checked before SwiftUI starts, so a
/// refused launch never creates a window or touches shared data (NAT-010).
/// Showing the alert from an app delegate is too late: SwiftUI creates the
/// WindowGroup windows while the alert's modal loop is running.
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
                return
            case let .heldByOther(owner):
                prepareForAlert()
                OtherEditionAlert.run(owner: owner)
                exit(0)
            }
        } catch {
            prepareForAlert()
            StartupFailureAlert.run(error: error)
            exit(1)
        }
    }

    /// NSAlert needs the shared application and a regular activation policy
    /// to come to the front before NSApplication.run() has been called.
    private static func prepareForAlert() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
    }
}

struct MCVectorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ServerListView()
                .frame(minWidth: 760, minHeight: 480)
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
