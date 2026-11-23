// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit

/// Finder-style selection for the views that draw their own items (icons and
/// gallery); the list view gets the same from NSTableView.
extension FilesModel {
    /// A click on an item: ⌘ toggles it, ⇧ selects the run from the last
    /// clicked item, a plain click selects only it.
    func click(_ name: String, modifiers: NSEvent.ModifierFlags = NSEvent.modifierFlags) {
        let order = visibleRows.map(\.name)
        if modifiers.contains(.command) {
            toggle(name)
        } else if modifiers.contains(.shift), let anchor = selectionAnchor,
            let from = order.firstIndex(of: anchor), let to = order.firstIndex(of: name)
        {
            selection.formUnion(order[min(from, to)...max(from, to)])
            return
        } else {
            selection = [name]
        }
        selectionAnchor = name
    }

    /// Moves the selection `offset` items along the visible order (arrow keys);
    /// with nothing selected, the first or last item is chosen.
    func moveSelection(by offset: Int) {
        let order = visibleRows.map(\.name)
        guard !order.isEmpty else { return }
        let current = selectionAnchor.flatMap(order.firstIndex(of:)) ?? order.firstIndex { selection.contains($0) }
        let target: Int
        if let current {
            target = min(max(current + offset, 0), order.count - 1)
        } else {
            target = offset >= 0 ? 0 : order.count - 1
        }
        selection = [order[target]]
        selectionAnchor = order[target]
    }

    /// ⌘I: shows the selected entry's info, or hides it when it is showing.
    func showInfo() {
        guard selection.count == 1, let name = selection.first else { return }
        infoTarget = infoTarget == name ? nil : name
    }

    /// The single selected row, or the first visible one when none is selected
    /// (what the gallery and the column preview show).
    var focusedRow: FileRow? {
        let rows = visibleRows
        if let anchor = selectionAnchor, selection.contains(anchor), let row = rows.first(where: { $0.name == anchor })
        {
            return row
        }
        return rows.first { selection.contains($0.name) } ?? rows.first
    }
}
