// SPDX-License-Identifier: GPL-3.0-or-later

/// The screens of the app, mirroring React's `AppView`
/// (`src/renderer/shared/server declaration.ts`). The raw values are the React ids.
/// `ui-lab` is dev-only in React and is not ported.
enum AppRoute: String, CaseIterable, Hashable, Sendable {
    case dashboard
    case console
    case users
    case files
    case plugins
    case backups
    case properties
    case generalSettings = "general-settings"
    case proxy
    case proxyHelp = "proxy-help"
    case ngrokGuide = "ngrok-guide"
    // React's in-window "app-settings" view is the Settings window (⌘,) here.

    /// Sidebar order (React `NAV_ITEMS`): the eight per-server views, then Proxy Network after a divider.
    static let serverViews: [AppRoute] = [
        .dashboard, .console, .users, .files, .plugins, .backups, .properties, .generalSettings,
    ]

    /// Views that need a selected server. The others are app-wide ("static" in AppContentRouter).
    var isServerView: Bool { Self.serverViews.contains(self) }

    /// Translation key of the sidebar label / header title.
    var labelKey: String {
        switch self {
        case .dashboard: "nav.dashboard"
        case .console: "nav.console"
        case .users: "nav.users"
        case .files: "nav.files"
        case .plugins: "nav.pluginsMods"
        case .backups: "nav.backups"
        case .properties: "nav.properties"
        case .generalSettings: "nav.generalSettings"
        case .proxy, .proxyHelp: "nav.proxyNetwork"
        case .ngrokGuide: "nav.generalSettings"
        }
    }

    /// SF Symbol for the lucide icon React uses (ui-parity-a, section 3).
    var symbol: String {
        switch self {
        case .dashboard: "square.grid.2x2"
        case .console: "terminal"
        case .users: "person.2"
        case .files: "folder"
        case .plugins: "puzzlepiece.extension"
        case .backups: "archivebox"
        case .properties: "slider.horizontal.3"
        case .generalSettings: "gearshape"
        case .proxy, .proxyHelp: "network"
        case .ngrokGuide: "globe"
        }
    }
}
