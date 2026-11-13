// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore
import Observation

/// Shared UI state of the main window (the features of React's `serverStore` + `uiStore`).
@MainActor
@Observable
final class AppState {
    enum ServersLoad: Equatable {
        case loading
        case loaded
        case failed(CoreError)
    }

    // MARK: Servers

    private(set) var servers: [ServerProfile] = []
    private(set) var serversLoad: ServersLoad = .loading
    var selectedServerID: String?

    var selectedServer: ServerProfile? {
        guard let selectedServerID else { return nil }
        return servers.first { $0.id == selectedServerID }
    }

    // MARK: Navigation (React uiStore)

    private(set) var route: AppRoute = .dashboard
    private(set) var previousRoute: AppRoute?

    /// Same rule as React `setCurrentView`: remember the previous view on change.
    func navigate(to newRoute: AppRoute) {
        guard newRoute != route else { return }
        previousRoute = route
        route = newRoute
    }

    /// React `returnToPreviousView`: back to the previous view, or the dashboard
    /// when there is none or it would be the settings screen itself.
    func returnToPreviousView() {
        let target = previousRoute.flatMap { $0 == .appSettings ? nil : $0 } ?? .dashboard
        previousRoute = route
        route = target
    }

    /// Next/previous view in sidebar order (Ctrl+Tab / Ctrl+Shift+Tab).
    func cycleServerView(forward: Bool) {
        let views = AppRoute.serverViews
        let index = views.firstIndex(of: route) ?? 0
        let next = (index + (forward ? 1 : views.count - 1)) % views.count
        navigate(to: views[next])
    }

    // MARK: Chrome

    /// Toolbar search text. It replaces React's ⌘K command palette: the search
    /// suggestions list the views and servers (CMDK-* features).
    var searchText = ""
    /// Set by ⌘K to move keyboard focus into the toolbar search field.
    var isSearchFocused = false

    /// The one sheet shown at a time.
    var activeSheet: ActiveSheet?

    // MARK: Loading

    /// Loads the server list and selects the first server when none is selected
    /// (React `use-server-runtime-listeners`).
    func reloadServers() async {
        do {
            let loaded = try await CoreClient.servers()
            servers = loaded
            serversLoad = .loaded
            if selectedServer == nil {
                selectedServerID = loaded.first?.id
            }
        } catch {
            serversLoad = .failed(error)
        }
    }

    /// Test and capture seam: replaces the list without calling the core.
    func setServersForPreview(_ list: [ServerProfile], selected: String?) {
        servers = list
        serversLoad = .loaded
        selectedServerID = selected
    }
}

/// Sheets presented from the shell. Only one is visible at a time.
enum ActiveSheet: Identifiable, Equatable {
    case addServerChoice
    case addServer
    case importServer
    case serverEula(serverID: String)
    case appUpdate
    case javaManager
    case versionUpgrade(serverID: String)

    var id: String {
        switch self {
        case .addServerChoice: "addServerChoice"
        case .addServer: "addServer"
        case .importServer: "importServer"
        case let .serverEula(serverID): "serverEula-\(serverID)"
        case .appUpdate: "appUpdate"
        case .javaManager: "javaManager"
        case let .versionUpgrade(serverID): "versionUpgrade-\(serverID)"
        }
    }
}
