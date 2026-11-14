// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Standard source-list sidebar with the same contents as the React sidebar:
/// the per-server views, Proxy Network, then the servers (grouped by
/// `groupName`) and Add Server.
///
/// The list selection is the view. Server rows switch the active server and show
/// it with a checkmark, so the selected view stays highlighted.
struct SidebarView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        List(selection: Binding(
            get: { app.route },
            set: { if let route = $0 { app.navigate(to: route) } }
        )) {
            Section {
                ForEach(AppRoute.serverViews, id: \.self) { route in
                    Label(L10n.t(route.labelKey), systemImage: route.symbol)
                        .tag(route)
                }
            }
            Section {
                Label(L10n.t(AppRoute.proxy.labelKey), systemImage: AppRoute.proxy.symbol)
                    .tag(AppRoute.proxy)
            }
            ForEach(serverGroups, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.servers, id: \.id) { server in
                        ServerRow(server: server, isActive: server.id == app.selectedServerID)
                    }
                }
            }
            Section {
                Button {
                    app.activeSheet = .addServerChoice
                } label: {
                    Label(L10n.t("nav.addServer"), systemImage: "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
        .listStyle(.sidebar)
    }

    /// Named groups in first-seen order, then servers without a group. With no
    /// named group at all, everything sits under "Servers" (React server panel).
    private var serverGroups: [(title: String, servers: [ServerProfile])] {
        var order: [String] = []
        var byGroup: [String: [ServerProfile]] = [:]
        var ungrouped: [ServerProfile] = []
        for server in app.servers {
            guard let group = server.groupName?.trimmingCharacters(in: .whitespaces), !group.isEmpty else {
                ungrouped.append(server)
                continue
            }
            if byGroup[group] == nil { order.append(group) }
            byGroup[group, default: []].append(server)
        }
        var result = order.map { (title: $0, servers: byGroup[$0] ?? []) }
        if !ungrouped.isEmpty {
            let title = order.isEmpty ? L10n.t("nav.servers") : L10n.t("server.list.ungrouped")
            result.append((title: title, servers: ungrouped))
        }
        return result
    }
}

/// One server: status dot, name, software and version. Clicking makes it the
/// active server; the context menu holds the React server actions.
private struct ServerRow: View {
    let server: ServerProfile
    let isActive: Bool
    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime

    var body: some View {
        Button {
            app.selectedServerID = server.id
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "circle.fill")
                    .font(.system(size: 7))
                    .foregroundStyle(ServerStatusStyle.color(runtime.status(of: server.id)))
                    .frame(width: 16)
                    .accessibilityLabel(Text(L10n.t(ServerStatusStyle.labelKey(runtime.status(of: server.id)))))
                VStack(alignment: .leading, spacing: 1) {
                    Text(server.name)
                        .fontWeight(isActive ? .semibold : .regular)
                        .lineLimit(1)
                    Text("\(server.software) \(server.version)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if isActive {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tint)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(L10n.t("nav.selectServer", ["name": server.name]))
        .contextMenu { ServerContextMenu(server: server) }
    }
}

/// The React server context menu: clone, save as template, delete.
private struct ServerContextMenu: View {
    let server: ServerProfile
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback

    var body: some View {
        let actions = ServerActions(app: app, feedback: feedback)
        Button(L10n.t("server.actions.clone"), systemImage: "doc.on.doc") {
            Task { await actions.clone(server) }
        }
        Button(L10n.t("server.actions.saveTemplate"), systemImage: "rectangle.stack") {
            Task { await actions.saveAsTemplate(server) }
        }
        Divider()
        Button(L10n.t("common.delete"), systemImage: "trash", role: .destructive) {
            Task { await actions.delete(server) }
        }
    }
}
