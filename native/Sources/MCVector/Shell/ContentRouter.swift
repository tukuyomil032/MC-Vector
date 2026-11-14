// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Content card router (React `AppContentRouter`):
/// 1. app-wide ("static") routes render regardless of the selected server;
/// 2. without a selected server: one centered line + Add Server (CONTENT-noserver-*);
/// 3. otherwise the per-server view.
/// Views not ported yet show `NotPortedView` and are replaced phase by phase.
struct ContentRouter: View {
    @Environment(AppState.self) private var app

    var body: some View {
        ZStack {
            Group {
                if let staticView = staticRoute {
                    staticView
                } else if case let .failed(error) = app.serversLoad {
                    ContentStateView(title: error.uiText)
                } else if app.serversLoad == .loading {
                    ProgressView(L10n.t("common.loadingView"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let server = app.selectedServer {
                    serverView(serverID: server.id)
                } else {
                    noServerState
                }
            }
            // One identity per screen, so switching views or servers cross-fades
            // the old content out while the new one rises in.
            .id(contentKey)
            .transition(.motionRise)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(Motion.standard, value: contentKey)
    }

    private var contentKey: String {
        let load: String = switch app.serversLoad {
        case .loading: "loading"
        case .loaded: "loaded"
        case .failed: "failed"
        }
        return "\(load)-\(app.selectedServerID ?? "none")-\(app.route.rawValue)"
    }

    private var staticRoute: AnyView? {
        switch app.route {
        case .proxy, .proxyHelp, .ngrokGuide: AnyView(NotPortedView(route: app.route))
        default: nil
        }
    }

    @ViewBuilder
    private func serverView(serverID: String) -> some View {
        // One identity per server + route, like React's `${server.id}-${view}` key.
        Group {
            switch app.route {
            case .console: ConsoleView(serverID: serverID)
            default: NotPortedView(route: app.route)
            }
        }
        .id("\(serverID)-\(app.route.rawValue)")
    }

    /// No server yet, or none selected (React CONTENT-noserver-*), as the standard
    /// empty-state view with Add Server as its action.
    private var noServerState: some View {
        ContentUnavailableView {
            Label(
                app.servers.isEmpty ? L10n.t("server.list.emptyTitle") : L10n.t("server.list.selectOrCreate"),
                systemImage: "server.rack"
            )
        } actions: {
            Button(L10n.t("nav.addServer")) {
                app.activeSheet = .addServerChoice
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

/// React `ContentState`: a centered single line with an optional action.
struct ContentStateView<Action: View>: View {
    let title: String
    let action: Action

    init(title: String, @ViewBuilder action: () -> Action) {
        self.title = title
        self.action = action()
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(title).foregroundStyle(.secondary)
            action
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension ContentStateView where Action == EmptyView {
    init(title: String) {
        self.init(title: title) { EmptyView() }
    }
}

/// Placeholder for screens that a later phase ports.
struct NotPortedView: View {
    let route: AppRoute

    var body: some View {
        ContentUnavailableView(
            L10n.t(route.labelKey),
            systemImage: route.symbol,
            description: Text(L10n.t("native.notPorted"))
        )
    }
}
