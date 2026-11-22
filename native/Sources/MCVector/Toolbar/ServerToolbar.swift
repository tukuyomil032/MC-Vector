// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
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
                        if let download = runtime.javaDownload, download.serverID == server.id {
                            // The Java a waiting start needs is downloading.
                            ProgressView(value: download.fraction ?? 0)
                                .progressViewStyle(.circular)
                                .controlSize(.small)
                                .help(L10n.t("native.java.downloading", ["major": download.major]))
                                .animation(Motion.value, value: download.fraction)
                        } else {
                            Button {
                                Task { await runtime.start(server.id) }
                            } label: {
                                Label(L10n.t("server.actions.start"), systemImage: "play.fill")
                                    .symbolEffect(.bounce, value: status == "online")
                            }
                            .help(L10n.t("server.actions.start"))
                            .disabled(!ServerStatusStyle.canStart(status))
                        }
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
                    // Server Settings for the selected server (⌘;). The app's own
                    // settings stay in the app menu (⌘,), as on macOS.
                    Button {
                        app.openServerSettings()
                    } label: {
                        Label(L10n.t("native.serverSettings.title"), systemImage: "gearshape")
                    }
                    .help(L10n.t("native.serverSettings.open"))
                }
            }
    }
}
