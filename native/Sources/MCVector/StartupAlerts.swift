// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore

/// Shown when another MC-Vector already holds the data lock (NAT-010).
/// Offers to bring the running app to the front, then this app quits.
@MainActor
enum OtherEditionAlert {
    static func run(owner: LockOwnerInfo?) {
        let tauriRunning = owner?.edition == .tauri
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "MC-Vector"
        alert.informativeText = String(
            localized: tauriRunning ? "lock.tauri_running" : "lock.other_running"
        )
        alert.addButton(withTitle: String(localized: tauriRunning ? "lock.show_tauri" : "lock.show_running"))
        alert.addButton(withTitle: String(localized: "lock.quit"))

        NSApp.activate()
        guard alert.runModal() == .alertFirstButtonReturn, let owner else { return }
        if let running = NSRunningApplication.runningApplications(withBundleIdentifier: owner.bundleId).first {
            running.activate()
        } else if let running = NSRunningApplication(processIdentifier: pid_t(owner.pid)) {
            running.activate()
        }
    }
}

/// Shown when the lock or the data folder cannot be opened. Fails closed.
@MainActor
enum StartupFailureAlert {
    static func run(error: CoreError) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = String(localized: "startup.failed")
        alert.informativeText = error.localizedText()
        alert.addButton(withTitle: String(localized: "lock.quit"))
        NSApp.activate()
        alert.runModal()
    }
}
