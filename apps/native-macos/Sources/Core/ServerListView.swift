import SwiftUI

/// Sidebar content for `RootView`'s `NavigationSplitView`: a two-section
/// `List` with the app's top-level navigation tabs (task 4-3) above the
/// user's configured servers, driven by `ServerListViewModel`.
///
/// Server selection and list identity both come from `Server.id` (via
/// `Identifiable`), so rows keep stable identity across reloads.
/// Navigation-tab selection is separate state, held in `NavigationState`
/// (owned by `RootView`, shared with `ContentRouter`) -- tapping a
/// navigation row never touches `viewModel.selection`, and picking a server
/// never touches `navigationState.currentView`, matching how the Tauri
/// sidebar keeps "current view" and "selected server" as independent pieces
/// of state.
struct ServerListView: View {
    @Bindable var viewModel: ServerListViewModel
    @Bindable var navigationState: NavigationState

    var body: some View {
        List(selection: self.$viewModel.selection) {
            Section {
                ForEach(NavigationItem.allItems) { item in
                    if item.showDividerBefore {
                        Divider()
                    }
                    Button {
                        self.navigationState.currentView = item.view
                    } label: {
                        Label(item.labelKey, systemImage: item.systemImage)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(
                        item.view == self.navigationState.currentView
                            ? Color.accentColor.opacity(0.15)
                            : Color.clear,
                    )
                }
            }

            Section("Servers") {
                ForEach(self.viewModel.servers) { server in
                    Text(server.name)
                        .tag(server.id)
                }
            }
        }
        .navigationTitle("MC-Vector")
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
            navigationState: NavigationState(),
        )
    } detail: {
        Text("Detail")
    }
}
