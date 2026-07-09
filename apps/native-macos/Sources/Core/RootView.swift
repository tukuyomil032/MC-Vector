import SwiftUI

/// Top-level app shell: a `NavigationSplitView` with the server list as the
/// sidebar and the selected server's detail as the detail pane, falling
/// back to a "select a server" placeholder when nothing is selected or the
/// selected id no longer matches any loaded server.
public struct RootView: View {
    @State private var viewModel: ServerListViewModel

    public init() {
        self.init(viewModel: ServerListViewModel())
    }

    /// Test/preview-only injection point: lets a caller supply a
    /// `ServerListViewModel` backed by a temp-file `ServerStore` instead of
    /// the real Application Support location. Not `public` -- production
    /// callers always use `init()`.
    init(viewModel: ServerListViewModel) {
        self._viewModel = State(initialValue: viewModel)
    }

    public var body: some View {
        NavigationSplitView {
            ServerListView(viewModel: self.viewModel)
        } detail: {
            if let server = self.viewModel.selectedServer {
                // `.id(server.id)` forces a fresh `ServerDetailView`
                // instance (and therefore a fresh `ServerLogViewModel`, per
                // that view's `@State` init) whenever the sidebar selection
                // changes to a different server -- without it, SwiftUI
                // would reuse the existing `@State` across selections and
                // the log view would keep streaming the *previous*
                // server's stdout.
                ServerDetailView(server: server, processService: self.viewModel.processService)
                    .id(server.id)
                    .toolbar {
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
            } else {
                ContentUnavailableView(
                    "Select a Server",
                    systemImage: "server.rack",
                    description: Text("Choose a server from the sidebar to see its details."),
                )
            }
        }
    }

    /// Start is only meaningful from a fully-stopped state. `.stopping` and
    /// `.restarting` are deliberately excluded too (not just the task's
    /// explicitly called-out `.online`/`.starting`) -- starting a server
    /// that's already mid-transition would race the in-flight operation.
    private static func canStart(_ server: Server) -> Bool {
        switch server.status {
        case .offline, .crashed:
            true
        case .online, .starting, .stopping, .restarting:
            false
        }
    }

    /// Stop is meaningful whenever a process might plausibly be running or
    /// coming up. Matches the task's explicit disabled set
    /// (`.offline`/`.crashed`/`.stopping`) exactly.
    private static func canStop(_ server: Server) -> Bool {
        switch server.status {
        case .online, .starting, .restarting:
            true
        case .offline, .crashed, .stopping:
            false
        }
    }
}

#Preview {
    // Avoid `RootView()`'s production default here -- it would touch the
    // real Application Support directory on whatever machine renders this
    // preview. Point the view model's store at a scratch temp file instead.
    RootView(
        viewModel: ServerListViewModel(
            store: ServerStore(
                fileURL: FileManager.default.temporaryDirectory
                    .appendingPathComponent("mc-vector-preview-servers-\(UUID().uuidString).json"),
            ),
        ),
    )
}
