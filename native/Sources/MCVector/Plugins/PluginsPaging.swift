// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// How the plugin browser reads further results (Settings › General › Display).
enum PluginsPaging: String, CaseIterable, Identifiable, Sendable {
    /// The next page loads when the grid scrolls to its end.
    case infinite
    /// Page numbers and a jump field under the grid, like the Tauri edition.
    case pages

    static let storageKey = "plugins.paging"

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .infinite: "native.settings.pluginsPaging.infinite"
        case .pages: "native.settings.pluginsPaging.pages"
        }
    }

    var symbol: String {
        switch self {
        case .infinite: "arrow.down.to.line"
        case .pages: "book.pages"
        }
    }
}
