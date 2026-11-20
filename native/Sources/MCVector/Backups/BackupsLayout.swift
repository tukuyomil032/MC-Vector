// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// How the Backups view lists backups (Settings › General › Display).
enum BackupsLayout: String, CaseIterable, Identifiable, Sendable {
    /// Rich rows with tags and notes, like the Tauri edition.
    case cards
    /// A sortable table, like Finder's list view.
    case table

    static let storageKey = "backups.layout"

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .cards: "native.settings.backupsLayout.cards"
        case .table: "native.settings.backupsLayout.table"
        }
    }

    var symbol: String {
        switch self {
        case .cards: "rectangle.grid.1x2"
        case .table: "tablecells"
        }
    }
}
