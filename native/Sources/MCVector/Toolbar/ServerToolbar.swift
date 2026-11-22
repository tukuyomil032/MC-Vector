// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
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
            // The same toolbar on every screen (file actions live in the Files
            // view's own bar). Items are never added, removed or hidden, only
            // disabled: a customizable toolbar whose items change while the window
            // is being restored at launch (servers are still loading then) fails
            // AppKit's NSToolbarItemViewer size check and crashes.
            .toolbar(id: "mcvector.main") {
                serverActions(showsServerActions ? app.selectedServer : nil)
                ToolbarItem(id: "server.settings", placement: .primaryAction) {
                    // Server Settings for the selected server (⌘;). The app's own
                    // settings stay in the app menu (⌘,), as on macOS.
                    Button {
                        app.openServerSettings()
                    } label: {
                        Label(L10n.t("nav.settings"), systemImage: "gearshape")
                    }
                    .help(L10n.t("native.serverSettings.open"))
                }
            }
    }

    private var showsServerActions: Bool {
        app.route.isServerView && app.selectedServer != nil
    }

    // Same enabling rules as React AppMainHeader: start when stopped or
    // crashed, restart and stop when running, nothing while changing.
    @ToolbarContentBuilder
    private func serverActions(_ selected: ServerProfile?) -> some CustomizableToolbarContent {
        let serverID = selected?.id ?? ""
        let status = runtime.status(of: serverID)
        ToolbarItem(id: "server.start", placement: .primaryAction) {
            if let download = runtime.javaDownload, download.serverID == serverID {
                // The Java a waiting start needs is downloading.
                ProgressView(value: download.fraction ?? 0)
                    .progressViewStyle(.circular)
                    .controlSize(.small)
                    .help(L10n.t("native.java.downloading", ["major": download.major]))
                    .animation(Motion.value, value: download.fraction)
            } else {
                Button {
                    Task { await runtime.start(serverID) }
                } label: {
                    Label(L10n.t("server.actions.start"), systemImage: "play.fill")
                        .symbolEffect(.bounce, value: status == "online")
                }
                .help(L10n.t("server.actions.start"))
                .disabled(selected == nil || !ServerStatusStyle.canStart(status))
            }
        }
        ToolbarItem(id: "server.restart", placement: .primaryAction) {
            Button {
                Task { await runtime.restart(serverID) }
            } label: {
                Label(L10n.t("server.actions.restart"), systemImage: "arrow.clockwise")
                    .symbolEffect(.rotate, isActive: status == "restarting")
            }
            .help(L10n.t("server.actions.restart"))
            .disabled(status != "online")
        }
        ToolbarItem(id: "server.stop", placement: .primaryAction) {
            Button {
                Task { await runtime.stop(serverID) }
            } label: {
                Label(L10n.t("server.actions.stop"), systemImage: "stop.fill")
                    .symbolEffect(.bounce, value: status == "offline")
            }
            .help(L10n.t("server.actions.stop"))
            .disabled(status != "online")
        }
    }
}
