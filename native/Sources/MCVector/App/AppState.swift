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
        guard newRoute != route, !holdForUnsavedEditor(.route(newRoute)) else { return }
        previousRoute = route
        route = newRoute
    }

    /// Makes another server active, asking first when the editor has unsaved changes.
    func selectServer(_ id: String) {
        guard id != selectedServerID, !holdForUnsavedEditor(.server(id)) else { return }
        selectedServerID = id
    }

    /// React `returnToPreviousView`: back to the previous view, or the dashboard
    /// when there is none or it would be the settings screen itself.
    func returnToPreviousView() {
        guard !holdForUnsavedEditor(.previousView) else { return }
        let target = previousRoute ?? .dashboard
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

    // MARK: Unsaved editor (FILE-005)

    /// A navigation held back until the user saves or discards the editor's changes.
    enum PendingLeave: Equatable {
        case route(AppRoute)
        case server(String)
        case previousView
        /// The editor's own Close button.
        case closeEditor
    }

    /// The file editor has unsaved changes; switching views or servers asks first.
    var hasUnsavedEditor = false
    /// The editor is saving; navigation waits until it finishes.
    var isEditorSaving = false
    /// Shown by the editor as the Save / Discard / Cancel alert.
    var pendingLeave: PendingLeave?

    /// True when the navigation must wait for the editor.
    private func holdForUnsavedEditor(_ leave: PendingLeave) -> Bool {
        guard hasUnsavedEditor || isEditorSaving else { return false }
        if !isEditorSaving { pendingLeave = leave }
        return true
    }

    /// Carries out a navigation after the editor saved or discarded its changes.
    func performLeave(_ leave: PendingLeave) {
        hasUnsavedEditor = false
        pendingLeave = nil
        switch leave {
        case let .route(route): navigate(to: route)
        case let .server(id): selectServer(id)
        case .previousView: returnToPreviousView()
        case .closeEditor: break
        }
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

    /// Loads the server list. When the selected server no longer exists (or none is
    /// selected), the first server becomes selected (React
    /// `use-server-runtime-listeners` and the delete flow).
    func reloadServers(selectFirstIfMissing: Bool = true) async {
        do {
            let loaded = try await CoreClient.servers()
            servers = loaded
            serversLoad = .loaded
            if selectFirstIfMissing, selectedServer == nil {
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
