import SwiftUI

/// `RootView`'s detail-pane router: switches on `navigationState.currentView`
/// to decide what to show, given the currently selected server (if any).
///
/// Only `.serverSettings` is wired to a real screen today
/// (`ServerDetailView`, ported forward unchanged from before task 4-4) --
/// every other `AppView` case renders a placeholder
/// `ContentUnavailableView`, since Dashboard/Console/Users/Files/Plugins/
/// Backups/Properties/Proxy Network are all later Phase 4+ tasks' work.
/// `.dashboard` gets its own "Coming Soon" placeholder per the task spec;
/// the rest share a generic "under construction" placeholder keyed off the
/// view's own navigation label where one exists.
///
/// Also owns the Start/Stop toolbar buttons that previously lived directly
/// in `RootView`'s `detail:` closure (task 3-7) -- moved here so they stay
/// attached to the detail pane regardless of which `AppView` is active, as
/// long as a server is selected, matching this task's requirement that
/// Start/Stop "appear regardless of which view is active."
struct ContentRouter: View {
    let navigationState: NavigationState
    let viewModel: ServerListViewModel

    var body: some View {
        Group {
            switch self.navigationState.currentView {
            case .serverSettings:
                self.serverDependent { server in
                    ServerDetailView(server: server, processService: self.viewModel.processService)
                        .id(server.id)
                }
            case .dashboard:
                ContentUnavailableView(
                    "Dashboard",
                    systemImage: "gauge.with.dots.needle.bottom.50percent",
                    description: Text("Coming Soon"),
                )
            default:
                self.serverDependent { _ in
                    ContentUnavailableView(
                        self.currentLabel,
                        systemImage: self.currentSystemImage,
                        description: Text("Coming Soon"),
                    )
                }
            }
        }
        .toolbar {
            if let server = self.viewModel.selectedServer {
                ToolbarItem(placement: .primaryAction) {
                    Button("Start", systemImage: "play.fill") {
                        Task { await self.viewModel.startSelectedServer() }
                    }
                    .disabled(!Self.canStart(server))
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Stop", systemImage: "stop.fill") {
                        Task { await self.viewModel.stopSelectedServer() }
                    }
                    .disabled(!Self.canStop(server))
                }
            }
        }
    }

    /// Views other than `.dashboard` need a selected server before they have
    /// anything meaningful to show -- there's no server-independent content
    /// for Console/Users/Files/etc. today. Falls back to the same
    /// "Select a Server" placeholder `RootView` used pre-4-4 when nothing
    /// (or a since-deleted server) is selected.
    @ViewBuilder
    private func serverDependent(@ViewBuilder content: (Server) -> some View) -> some View {
        if let server = self.viewModel.selectedServer {
            content(server)
        } else {
            ContentUnavailableView(
                "Select a Server",
                systemImage: "server.rack",
                description: Text("Choose a server from the sidebar to see its details."),
            )
        }
    }

    /// Not `private` -- `ContentRouterTests` exercises this directly (it's
    /// the pure, testable half of the `default:` branch's view resolution;
    /// the `Group`/`switch` in `body` itself needs a SwiftUI rendering
    /// context to exercise meaningfully).
    var currentLabel: String {
        NavigationItem.allItems.first(where: { $0.view == self.navigationState.currentView })?.labelKey
            ?? self.navigationState.currentView.rawValue.capitalized
    }

    /// See `currentLabel`'s doc comment.
    var currentSystemImage: String {
        NavigationItem.allItems.first(where: { $0.view == self.navigationState.currentView })?.systemImage
            ?? "questionmark.square.dashed"
    }

    /// Ported unchanged from `RootView` (pre-4-4) -- see that type's git
    /// history for the original doc comment explaining the excluded
    /// mid-transition statuses. Not `private` for the same reason as
    /// `currentLabel` above.
    static func canStart(_ server: Server) -> Bool {
        switch server.status {
        case .offline, .crashed:
            true
        case .online, .starting, .stopping, .restarting:
            false
        }
    }

    /// Ported unchanged from `RootView` (pre-4-4) -- see that type's git
    /// history for the original doc comment explaining the excluded
    /// mid-transition statuses. Not `private` for the same reason as
    /// `currentLabel` above.
    static func canStop(_ server: Server) -> Bool {
        switch server.status {
        case .online, .starting, .restarting:
            true
        case .offline, .crashed, .stopping:
            false
        }
    }
}
