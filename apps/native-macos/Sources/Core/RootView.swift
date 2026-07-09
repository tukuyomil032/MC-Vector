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
                ServerDetailView(server: server)
            } else {
                ContentUnavailableView(
                    "Select a Server",
                    systemImage: "server.rack",
                    description: Text("Choose a server from the sidebar to see its details."),
                )
            }
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
