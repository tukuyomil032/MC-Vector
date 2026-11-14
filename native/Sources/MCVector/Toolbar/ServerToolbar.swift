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
    @Environment(ServerRuntime.self) private var runtime

    func body(content: Content) -> some View {
        content
            .navigationTitle(L10n.t(app.route.labelKey))
            .navigationSubtitle(app.route.isServerView ? (app.selectedServer?.name ?? "") : "")
            .toolbar {
                if app.route.isServerView, let server = app.selectedServer {
                    // Same enabling rules as React AppMainHeader: start when stopped or
                    // crashed, restart and stop when running, nothing while changing.
                    let status = runtime.status(of: server.id)
                    ToolbarItemGroup(placement: .primaryAction) {
                        Button {
                            Task { await runtime.start(server.id) }
                        } label: {
                            Label(L10n.t("server.actions.start"), systemImage: "play.fill")
                                .symbolEffect(.bounce, value: status == "online")
                        }
                        .help(L10n.t("server.actions.start"))
                        .disabled(!ServerStatusStyle.canStart(status))
                        Button {
                            Task { await runtime.restart(server.id) }
                        } label: {
                            Label(L10n.t("server.actions.restart"), systemImage: "arrow.clockwise")
                                .symbolEffect(.rotate, isActive: status == "restarting")
                        }
                        .help(L10n.t("server.actions.restart"))
                        .disabled(status != "online")
                        Button {
                            Task { await runtime.stop(server.id) }
                        } label: {
                            Label(L10n.t("server.actions.stop"), systemImage: "stop.fill")
                                .symbolEffect(.bounce, value: status == "offline")
                        }
                        .help(L10n.t("server.actions.stop"))
                        .disabled(status != "online")
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
