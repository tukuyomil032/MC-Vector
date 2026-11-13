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
        alert.informativeText = L10n.t(tauriRunning ? "lock.tauri_running" : "lock.other_running")
        alert.addButton(withTitle: L10n.t(tauriRunning ? "lock.show_tauri" : "lock.show_running"))
        alert.addButton(withTitle: L10n.t("lock.quit"))

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
        alert.messageText = L10n.t("startup.failed")
        alert.informativeText = error.uiText
        alert.addButton(withTitle: L10n.t("lock.quit"))
        NSApp.activate()
        alert.runModal()
    }
}

extension CoreError {
    /// Text in the app's chosen language: `error.<code>`, else `error.unknown` (NAT-005).
    var uiText: String {
        let text = L10n.t(localizationKey)
        return text == localizationKey ? L10n.t("error.unknown") : text
    }
}
