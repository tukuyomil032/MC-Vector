import SwiftUI

/// Sidebar content for `RootView`'s `NavigationSplitView`: a `List` of the
/// user's configured servers, driven by `ServerListViewModel`.
///
/// Selection and list identity both come from `Server.id` (via
/// `Identifiable`), so rows keep stable identity across reloads.
struct ServerListView: View {
    @Bindable var viewModel: ServerListViewModel

    var body: some View {
        List(self.viewModel.servers, selection: self.$viewModel.selection) { server in
            Text(server.name)
        }
        .navigationTitle("Servers")
        .task {
            await self.viewModel.load()
        }
    }
}

#Preview {
    // No servers.json exists at this path, so `.task { load() }` resolves
    // to the deterministic "missing file -> empty list" path instantly --
    // no live service, no flakiness, nothing to hang on.
    NavigationSplitView {
        ServerListView(
            viewModel: ServerListViewModel(
                store: ServerStore(
                    fileURL: FileManager.default.temporaryDirectory
                        .appendingPathComponent("mc-vector-preview-servers-\(UUID().uuidString).json"),
                ),
            ),
        )
    } detail: {
        Text("Detail")
    }
}
