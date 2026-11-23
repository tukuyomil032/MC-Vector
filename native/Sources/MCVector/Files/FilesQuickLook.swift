// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import Quartz
import SwiftUI

extension View {
    /// Space toggles Quick Look while this Files view has focus, and an open
    /// panel follows the selection. (Space is not a keyboard shortcut: that
    /// would also take spaces typed into the filter or a name.)
    func filesQuickLook(_ model: FilesModel) -> some View {
        onKeyPress(.space) {
            FilesQuickLook.shared.toggle(model)
            return .handled
        }
        .onChange(of: model.selection) { FilesQuickLook.shared.refresh(model) }
    }
}

/// Quick Look for the Files view (Space): the shared preview panel shows the
/// selected entries, in the order they are listed. Arrow keys pressed in the
/// panel move the selection, and the panel follows it.
@MainActor
final class FilesQuickLook: NSObject, QLPreviewPanelDataSource, QLPreviewPanelDelegate {
    static let shared = FilesQuickLook()

    private weak var model: FilesModel?
    private var urls: [URL] = []

    /// How many entries the panel is showing (E2E checks).
    var itemCount: Int { urls.count }

    static var isOpen: Bool { QLPreviewPanel.sharedPreviewPanelExists() && QLPreviewPanel.shared().isVisible }

    /// Opens the panel on the selection, or closes it when it is open.
    func toggle(_ model: FilesModel) {
        if Self.isOpen {
            QLPreviewPanel.shared().orderOut(nil)
            return
        }
        guard !model.selection.isEmpty else { return }
        self.model = model
        guard let panel = QLPreviewPanel.shared() else { return }
        panel.dataSource = self
        panel.delegate = self
        refresh(model)
        panel.makeKeyAndOrderFront(nil)
    }

    /// Shows the current selection when the panel is open for this model.
    func refresh(_ model: FilesModel) {
        guard model === self.model else { return }
        urls = model.selectedRows.compactMap {
            try? CoreClient.fileEntryURL(serverID: model.serverID, relative: model.relative($0.name))
        }
        guard QLPreviewPanel.sharedPreviewPanelExists(), let panel = QLPreviewPanel.shared() else { return }
        panel.reloadData()
        let focused = model.selectionAnchor.flatMap { anchor in
            model.selectedRows.firstIndex { $0.name == anchor }
        }
        panel.currentPreviewItemIndex = focused ?? 0
    }

    // MARK: QLPreviewPanelDataSource

    nonisolated func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        MainActor.assumeIsolated { urls.count }
    }

    nonisolated func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> (any QLPreviewItem)! {
        let url = MainActor.assumeIsolated { urls.indices.contains(index) ? urls[index] : nil }
        return url as NSURL?
    }

    // MARK: QLPreviewPanelDelegate

    /// Arrow keys move the Files selection (one entry at a time, like Finder).
    nonisolated func previewPanel(_ panel: QLPreviewPanel!, handle event: NSEvent!) -> Bool {
        guard event.type == .keyDown else { return false }
        let offset: Int? =
            switch event.keyCode {
            case 123, 126: -1  // ← ↑
            case 124, 125: 1  // → ↓
            default: nil
            }
        guard let offset else { return false }
        return MainActor.assumeIsolated {
            guard let model else { return false }
            model.moveSelection(by: offset)
            refresh(model)
            return true
        }
    }
}
