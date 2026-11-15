// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import SwiftUI

extension FocusedValues {
    /// Set while the file editor is on screen. The Editor menu is enabled only
    /// then, so its shortcuts (⌘F, ⌘L, …) never take keys from other screens.
    @Entry var isEditorActive: Bool?
}

/// The Editor menu. Text actions go down the responder chain to the focused
/// EditorTextView; view options change EditorSettings for every editor.
struct EditorCommands: Commands {
    @FocusedValue(\.isEditorActive) private var isEditorActive
    @Bindable private var settings = EditorSettings.shared

    var body: some Commands {
        CommandMenu(L10n.t("native.editor.menu")) {
            Group {
                Button(L10n.t("native.editor.menu.find")) { finder(.showFindInterface) }
                    .keyboardShortcut("f", modifiers: .command)
                Button(L10n.t("native.editor.menu.replace")) { finder(.showReplaceInterface) }
                    .keyboardShortcut("f", modifiers: [.command, .option])
                Button(L10n.t("native.editor.menu.findNext")) { finder(.nextMatch) }
                    .keyboardShortcut("g", modifiers: .command)
                Button(L10n.t("native.editor.menu.findPrevious")) { finder(.previousMatch) }
                    .keyboardShortcut("g", modifiers: [.command, .shift])
                Divider()
                Button(L10n.t("native.editor.menu.suggestions")) { send(#selector(EditorTextView.showCompletions(_:))) }
                    .keyboardShortcut(" ", modifiers: .control)
                Button(L10n.t("native.editor.menu.comment")) { send(#selector(EditorTextView.toggleComment(_:))) }
                    .keyboardShortcut("/", modifiers: .command)
                Button(L10n.t("native.editor.menu.goToLine")) { send(#selector(EditorTextView.goToLine(_:))) }
                    .keyboardShortcut("l", modifiers: .command)
                Divider()
                Toggle(L10n.t("native.settings.editor.wrapLines"), isOn: $settings.wrapLines)
                    .keyboardShortcut("w", modifiers: [.command, .option])
                Toggle(L10n.t("native.settings.editor.showInvisibles"), isOn: $settings.showInvisibles)
                    .keyboardShortcut("i", modifiers: [.command, .option])
                Divider()
                Button(L10n.t("native.editor.menu.zoomIn")) { settings.zoom(by: 1) }
                    .keyboardShortcut("+", modifiers: .command)
                Button(L10n.t("native.editor.menu.zoomOut")) { settings.zoom(by: -1) }
                    .keyboardShortcut("-", modifiers: .command)
                Button(L10n.t("native.editor.menu.actualSize")) { settings.resetZoom() }
                    .keyboardShortcut("0", modifiers: .command)
            }
            .disabled(isEditorActive != true)
        }
    }

    private func send(_ action: Selector) {
        NSApp.sendAction(action, to: nil, from: nil)
    }

    /// NSTextFinder reads the action from the sender's tag.
    private func finder(_ action: NSTextFinder.Action) {
        let item = NSMenuItem()
        item.tag = action.rawValue
        NSApp.sendAction(#selector(NSResponder.performTextFinderAction(_:)), to: nil, from: item)
    }
}
