// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The two halves of the Settings window (its big sidebar tiles).
enum SettingsSection: String, CaseIterable, Hashable, Sendable {
    case app
    case server

    var titleKey: String { "native.settings.tile.\(rawValue)" }

    var symbol: String {
        switch self {
        case .app: "macwindow"
        case .server: "server.rack"
        }
    }

    var tint: SettingsTint {
        switch self {
        case .app: .graphite
        case .server: .green
        }
    }

    /// The section's pages in sidebar groups: the Server tile lists the
    /// server's settings, then its server.properties.
    var pageGroups: [[SettingsPage]] {
        switch self {
        case .app: [AppPane.allCases.map(SettingsPage.app)]
        case .server:
            [ServerPage.allCases.map(SettingsPage.server), PropertiesGroup.allCases.map(SettingsPage.properties)]
        }
    }

    var pages: [SettingsPage] { pageGroups.flatMap { $0 } }

    var firstPage: SettingsPage { pages[0] }
}

/// Pages of the App tile.
enum AppPane: String, CaseIterable, Hashable, Sendable {
    case general, java, editor, about

    var titleKey: String { "native.settings.\(rawValue)" }

    var symbol: String {
        switch self {
        case .general: "gearshape.fill"
        case .java: "cup.and.saucer.fill"
        case .editor: "chevron.left.forwardslash.chevron.right"
        case .about: "info.circle.fill"
        }
    }

    var tint: SettingsTint {
        switch self {
        case .general: .graphite
        case .java: .orange
        case .editor: .purple
        case .about: .indigo
        }
    }
}

/// Pages of the Server tile, each holding several General Settings categories.
enum ServerPage: String, CaseIterable, Hashable, Sendable {
    case server, automation

    var titleKey: String { "native.settings.page.\(rawValue)" }

    var symbol: String {
        switch self {
        case .server: "server.rack"
        case .automation: "arrow.triangle.2.circlepath"
        }
    }

    var tint: SettingsTint {
        switch self {
        case .server: .blue
        case .automation: .teal
        }
    }

    var categories: [GeneralSettingsCategory] {
        switch self {
        case .server: [.basic, .runtime, .jvm]
        case .automation: [.autoRestart, .autoBackup, .notifications]
        }
    }
}

/// Pages of the Properties tile, each holding several PropertiesLayout.json
/// categories (shown as titled sections).
enum PropertiesGroup: String, CaseIterable, Hashable, Sendable {
    case game, world, network, management

    var titleKey: String { "native.settings.page.\(rawValue)" }

    var symbol: String {
        switch self {
        case .game: "gamecontroller.fill"
        case .world: "globe.americas.fill"
        case .network: "network"
        case .management: "wrench.and.screwdriver.fill"
        }
    }

    var tint: SettingsTint {
        switch self {
        case .game: .green
        case .world: .brown
        case .network: .teal
        case .management: .purple
        }
    }

    var categoryIDs: [String] {
        switch self {
        case .game: ["basic", "gameplay", "general"]
        case .world: ["world"]
        case .network: ["network", "remote", "security"]
        case .management: ["management", "resourcePack"]
        }
    }

    /// The page's sections (title key suffix, server.properties keys), a few
    /// related keys each, like Snapzy's grouped rows. Keys of the page's
    /// categories missing here land in the last section.
    var sections: [(id: String, keys: [String])] {
        switch self {
        case .game:
            [
                ("rules", ["motd", "gamemode", "difficulty", "hardcore"]),
                ("play", ["pvp", "allow-flight", "force-gamemode", "enable-command-block"]),
                ("spawnIdle", ["spawn-protection", "player-idle-timeout", "pause-when-empty-seconds"]),
                (
                    "permissions",
                    [
                        "op-permission-level", "function-permission-level", "broadcast-console-to-ops",
                        "broadcast-rcon-to-ops",
                    ]
                ),
                ("other", ["accepts-transfers", "bug-report-link", "debug"]),
            ]
        case .world:
            [
                ("world", ["level-name", "level-seed", "level-type", "generator-settings"]),
                ("distance", ["view-distance", "simulation-distance", "max-world-size"]),
                ("generation", ["generate-structures", "sync-chunk-writes"]),
                ("datapacks", ["initial-enabled-packs", "initial-disabled-packs"]),
                ("textFilter", ["text-filtering-config", "text-filtering-version"]),
            ]
        case .network:
            [
                ("connection", ["server-ip", "server-port", "max-players"]),
                (
                    "joining",
                    [
                        "online-mode", "white-list", "enforce-whitelist", "enforce-secure-profile",
                        "prevent-proxy-connections",
                    ]
                ),
                (
                    "traffic",
                    [
                        "network-compression-threshold", "rate-limit", "use-native-transport",
                        "entity-broadcast-range-percentage",
                    ]
                ),
                ("status", ["enable-status", "status-heartbeat-interval"]),
                ("rcon", ["enable-rcon", "rcon.port", "rcon.password"]),
                ("query", ["enable-query", "query.port"]),
            ]
        case .management:
            [
                (
                    "managementServer",
                    [
                        "management-server-enabled", "management-server-host", "management-server-port",
                        "management-server-secret",
                    ]
                ),
                (
                    "tls",
                    [
                        "management-server-tls-enabled", "management-server-tls-keystore",
                        "management-server-tls-keystore-password",
                    ]
                ),
                ("resourcePack", ["resource-pack", "resource-pack-id", "resource-pack-sha1"]),
                ("resourcePackPrompt", ["require-resource-pack", "resource-pack-prompt"]),
            ]
        }
    }
}

/// A page on the right of the Settings window.
enum SettingsPage: Hashable, Sendable {
    case app(AppPane)
    case server(ServerPage)
    case properties(PropertiesGroup)

    var section: SettingsSection {
        switch self {
        case .app: .app
        case .server, .properties: .server
        }
    }

    /// A stable name, used by capture IDs and search entries.
    var id: String {
        switch self {
        case .app(let pane): "app-\(pane.rawValue)"
        case .server(let page): "server-\(page.rawValue)"
        case .properties(let group): "properties-\(group.rawValue)"
        }
    }

    var title: String {
        switch self {
        case .app(let pane): L10n.t(pane.titleKey)
        case .server(let page): L10n.t(page.titleKey)
        case .properties(let group): L10n.t(group.titleKey)
        }
    }

    var symbol: String {
        switch self {
        case .app(let pane): pane.symbol
        case .server(let page): page.symbol
        case .properties(let group): group.symbol
        }
    }

    var tint: SettingsTint {
        switch self {
        case .app(let pane): pane.tint
        case .server(let page): page.tint
        case .properties(let group): group.tint
        }
    }

    /// Pages that edit one server need a server to show anything.
    var needsServer: Bool { section != .app }

    init?(id: String) {
        guard let page = SettingsSection.allCases.flatMap(\.pages).first(where: { $0.id == id }) else { return nil }
        self = page
    }
}

/// Asks the shell to open (or bring forward) the Settings window.
struct SettingsRequest: Equatable, Sendable {
    let id = UUID()
    /// The server the Server and Properties pages edit; nil keeps the current one.
    var serverID: String?
    var page: SettingsPage
    /// A row title to scroll to and highlight once the page is shown.
    var reveal: String?
}

/// Back / forward through visited pages, like Snapzy's and Droppy's arrows.
struct PageHistory: Equatable {
    private(set) var pages: [SettingsPage] = []
    private(set) var index = -1

    var current: SettingsPage? { pages.indices.contains(index) ? pages[index] : nil }
    var canGoBack: Bool { index > 0 }
    var canGoForward: Bool { index < pages.count - 1 }

    mutating func visit(_ page: SettingsPage) {
        guard page != current else { return }
        pages = Array(pages.prefix(index + 1)) + [page]
        index = pages.count - 1
    }

    mutating func back() -> SettingsPage? {
        guard canGoBack else { return nil }
        index -= 1
        return current
    }

    mutating func forward() -> SettingsPage? {
        guard canGoForward else { return nil }
        index += 1
        return current
    }
}

/// Category colors for the Properties sections.
extension PropertiesLayout.Category {
    var tint: SettingsTint {
        switch id {
        case "basic": .blue
        case "gameplay": .green
        case "remote": .indigo
        case "network": .teal
        case "world": .brown
        case "general": .graphite
        case "security": .red
        case "resourcePack": .orange
        case "management": .purple
        default: .graphite
        }
    }
}
