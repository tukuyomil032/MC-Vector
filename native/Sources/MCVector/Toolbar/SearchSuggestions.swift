// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Suggestions of the toolbar search field. They cover what React's ⌘K command
/// palette offers: jump to a view, switch the server.
struct SearchSuggestions: View {
    @Environment(AppState.self) private var app
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        let query = app.searchText.trimmingCharacters(in: .whitespaces).lowercased()
        // Views match their localized name or their English id ("console"), so typing
        // in either language finds them.
        let routes = (AppRoute.serverViews + [.proxy]).filter {
            matches(L10n.t($0.labelKey), query) || matches($0.rawValue, query)
        }
        let showSettings = matches(L10n.t("nav.settings"), query) || matches("settings", query)
        let servers = app.servers.filter { matches($0.name, query) || matches($0.groupName ?? "", query) }

        if !routes.isEmpty || showSettings {
            Section(L10n.t("commandPalette.navigate")) {
                ForEach(routes, id: \.self) { route in
                    Button {
                        app.navigate(to: route)
                        app.searchText = ""
                    } label: {
                        Label(L10n.t(route.labelKey), systemImage: route.symbol)
                    }
                }
                if showSettings {
                    Button {
                        app.searchText = ""
                        openSettings()
                    } label: {
                        Label(L10n.t("nav.settings"), systemImage: "gearshape")
                    }
                }
            }
        }
        if !servers.isEmpty {
            Section(L10n.t("commandPalette.servers")) {
                ForEach(servers, id: \.id) { server in
                    Button {
                        app.selectedServerID = server.id
                        app.searchText = ""
                    } label: {
                        Label {
                            Text(server.name)
                        } icon: {
                            Image(systemName: "circle.fill")
                                .foregroundStyle(ServerStatusStyle.color(server.status))
                        }
                    }
                }
            }
        }
        if routes.isEmpty, servers.isEmpty, !showSettings, !query.isEmpty {
            Text(L10n.t("commandPalette.noResults"))
                .foregroundStyle(.secondary)
        }
    }

    private func matches(_ text: String, _ query: String) -> Bool {
        query.isEmpty || text.lowercased().contains(query)
    }
}
