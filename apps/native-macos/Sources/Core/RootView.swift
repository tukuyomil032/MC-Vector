import SwiftUI

/// Top-level app shell: a `NavigationSplitView` with the server list as the
/// sidebar. The detail pane is a trivial "select a server" placeholder --
/// task 3-6 replaces it with the real per-server detail screen.
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
            ContentUnavailableView(
                "Select a Server",
                systemImage: "server.rack",
                description: Text("Choose a server from the sidebar to see its details."),
            )
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
