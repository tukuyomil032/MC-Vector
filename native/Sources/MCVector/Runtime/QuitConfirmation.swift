// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit

/// "Quit MC-Vector?" while servers run (React `use-exit-confirmation`). Unlike
/// React, ⌘Q asks too, because both paths reach `applicationShouldTerminate`.
@MainActor
enum QuitConfirmation {
    /// True when the user chose Quit.
    static func run() -> Bool {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = L10n.t("server.exit.title")
        alert.informativeText = L10n.t("server.exit.description")
        let quit = alert.addButton(withTitle: L10n.t("server.exit.confirm"))
        quit.hasDestructiveAction = true
        alert.addButton(withTitle: L10n.t("common.cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }

    /// "Discard unsaved changes?" when the file editor has unsaved edits (FILE-005).
    /// True when the user chose to discard them and quit.
    static func discardUnsavedEdits() -> Bool {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = L10n.t("unsavedChanges.title")
        alert.informativeText = L10n.t("native.files.editor.quitDescription")
        let quit = alert.addButton(withTitle: L10n.t("native.files.editor.discardAndQuit"))
        quit.hasDestructiveAction = true
        alert.addButton(withTitle: L10n.t("common.cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }
}
