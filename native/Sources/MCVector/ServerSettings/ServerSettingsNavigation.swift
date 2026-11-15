// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The two halves of the Server Settings window (its big sidebar tiles).
enum ServerSettingsSection: String, CaseIterable, Hashable, Sendable {
    case general
    case properties

    var titleKey: String {
        switch self {
        case .general: "nav.generalSettings"
        case .properties: "nav.properties"
        }
    }

    /// The short name on the sidebar tile.
    var tileTitleKey: String {
        switch self {
        case .general: "native.serverSettings.tile.general"
        case .properties: "nav.properties"
        }
    }

    var symbol: String {
        switch self {
        case .general: "gearshape.fill"
        case .properties: "slider.horizontal.3"
        }
    }

    var color: Color {
        switch self {
        case .general: .gray
        case .properties: .blue
        }
    }

    var subtitleKey: String {
        switch self {
        case .general: "native.serverSettings.generalSubtitle"
        case .properties: "native.serverSettings.propertiesSubtitle"
        }
    }
}

/// A page on the right of the window.
enum ServerSettingsPage: Hashable, Sendable {
    /// The section's first page: hero header and links to its categories.
    case overview(ServerSettingsSection)
    case category(ServerSettingsSection, String)

    var section: ServerSettingsSection {
        switch self {
        case .overview(let section), .category(let section, _): section
        }
    }
}

/// Asks the shell to open (or bring forward) the Server Settings window.
struct ServerSettingsRequest: Equatable, Sendable {
    let id = UUID()
    var serverID: String?
    var section: ServerSettingsSection
    /// A page to open instead of the section's overview.
    var page: ServerSettingsPage?
}

/// Back / forward through visited pages, like Snapzy's and Droppy's arrows.
struct PageHistory: Equatable {
    private(set) var pages: [ServerSettingsPage] = []
    private(set) var index = -1

    var current: ServerSettingsPage? { pages.indices.contains(index) ? pages[index] : nil }
    var canGoBack: Bool { index > 0 }
    var canGoForward: Bool { index < pages.count - 1 }

    mutating func visit(_ page: ServerSettingsPage) {
        guard page != current else { return }
        pages = Array(pages.prefix(index + 1)) + [page]
        index = pages.count - 1
    }

    mutating func back() -> ServerSettingsPage? {
        guard canGoBack else { return nil }
        index -= 1
        return current
    }

    mutating func forward() -> ServerSettingsPage? {
        guard canGoForward else { return nil }
        index += 1
        return current
    }
}

/// Category colors for the Properties sidebar tiles.
extension PropertiesLayout.Category {
    var tint: Color {
        switch id {
        case "basic": .blue
        case "gameplay": .green
        case "remote": .indigo
        case "network": .teal
        case "world": .brown
        case "general": .gray
        case "security": .red
        case "resourcePack": .orange
        case "management": .purple
        default: .gray
        }
    }
}
