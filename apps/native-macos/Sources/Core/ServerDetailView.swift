import SwiftUI

/// Read-only detail pane for a single `Server`, shown in `RootView`'s
/// `NavigationSplitView` detail column once a sidebar row is selected.
///
/// Takes a resolved `Server` value rather than the whole
/// `ServerListViewModel` -- this view has no dependency on selection state
/// or the underlying store, only the data it renders, which keeps it simple
/// and independently previewable/testable in isolation.
///
/// Shows the identifying/operational fields that are always meaningful for
/// a hand-authored server entry today (name, status, version, software,
/// port, memory, path, Java path). Auto-restart, auto-backup, and
/// notification settings are left for a later settings-focused task -- this
/// app has no server-creation flow yet, so surfacing 19 more optional
/// fields here would mostly be clutter with no data ever populated.
struct ServerDetailView: View {
    let server: Server

    var body: some View {
        Form {
            Section {
                LabeledContent("Status") {
                    Text(self.server.status.rawValue.capitalized)
                }
            }

            Section("Configuration") {
                LabeledContent("Version", value: self.server.version)
                LabeledContent("Software", value: self.server.software)
                LabeledContent("Port", value: String(self.server.port))
                LabeledContent("Memory", value: "\(self.server.memory) MB")
                LabeledContent("Path", value: self.server.path)
                if let javaPath = self.server.javaPath {
                    LabeledContent("Java Path", value: javaPath)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(self.server.name)
    }
}

#Preview {
    NavigationStack {
        ServerDetailView(
            server: Server(
                id: "srv-1",
                name: "Survival",
                version: "1.21.1",
                software: "paper",
                port: 25565,
                memory: 4096,
                path: "/servers/srv-1",
                status: .online,
                javaPath: "/usr/bin/java",
            ),
        )
    }
}
