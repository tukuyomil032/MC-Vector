// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

extension View {
    /// Window title and toolbar of the detail column: the view name as the title,
    /// the server name as the subtitle, server actions and settings as toolbar items.
    func serverToolbar() -> some View {
        modifier(ServerToolbar())
    }
}

private struct ServerToolbar: ViewModifier {
    @Environment(AppState.self) private var app

    func body(content: Content) -> some View {
        content
            .navigationTitle(L10n.t(app.route.labelKey))
            .navigationSubtitle(app.route.isServerView ? (app.selectedServer?.name ?? "") : "")
            .toolbar {
                if app.route.isServerView, app.selectedServer != nil {
                    ToolbarItemGroup(placement: .primaryAction) {
                        // Server lifecycle is wired in phase 6.
                        Button {
                        } label: {
                            Label(L10n.t("server.actions.start"), systemImage: "play.fill")
                        }
                        .help(L10n.t("server.actions.start"))
                        .disabled(true)
                        Button {
                        } label: {
                            Label(L10n.t("server.actions.restart"), systemImage: "arrow.clockwise")
                        }
                        .help(L10n.t("server.actions.restart"))
                        .disabled(true)
                        Button {
                        } label: {
                            Label(L10n.t("server.actions.stop"), systemImage: "stop.fill")
                        }
                        .help(L10n.t("server.actions.stop"))
                        .disabled(true)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    // Opens the Settings window, the same one as ⌘, and the app menu.
                    SettingsLink {
                        Label(L10n.t("nav.settings"), systemImage: "gearshape")
                    }
                    .help(L10n.t("nav.openSettings"))
                }
            }
    }
}
