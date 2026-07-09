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
///
/// Below the configuration `Form`, a "Console Output" section (task 3-8)
/// streams the server's live stdout via `ServerLogView`/`ServerLogViewModel`
/// -- added additively alongside the existing fields and the 3-7 toolbar
/// (`RootView` still owns Start/Stop), not folded into the `Form` itself,
/// since log lines have nothing in common with the labeled-field rows above
/// them.
///
/// This view now also owns the single `.task(id: server.status)` that
/// drives `logViewModel.streamLogs()` (task 3-9's "Floating Console Panel"
/// moved this up from `ServerLogView` itself). That's what makes it safe to
/// show the same log stream in two places at once -- inline here *and* in
/// `FloatingConsolePanel` -- without ever calling `streamLogs()` (and
/// transitively `ServerProcessService.stdoutLines(serverId:)`) more than
/// once for the same running server; see `ServerLogView`'s and
/// `FloatingConsolePanelController`'s doc comments for the full rationale.
struct ServerDetailView: View {
    let server: Server
    @State private var logViewModel: ServerLogViewModel
    @State private var consolePanelController: FloatingConsolePanelController?

    /// `processService` is threaded in from `RootView`'s
    /// `ServerListViewModel` (see that class's `processService` doc
    /// comment) rather than this view creating its own, so the log view
    /// reads from the same tracked process that Start/Stop act on.
    init(server: Server, processService: ServerProcessService) {
        self.server = server
        self._logViewModel = State(
            initialValue: ServerLogViewModel(serverId: server.id, processService: processService),
        )
    }

    var body: some View {
        VStack(spacing: 0) {
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
            .fixedSize(horizontal: false, vertical: true)

            Divider()

            VStack(alignment: .leading, spacing: 0) {
                Text("Console Output")
                    .font(.headline)
                    .padding([.horizontal, .top], 12)
                    .padding(.bottom, 4)
                ServerLogView(viewModel: self.logViewModel)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle(self.server.name)
        .task(id: self.server.status) {
            await self.logViewModel.streamLogs()
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button(
                    self.consolePanelController?.isVisible == true ? "Hide Console Panel" : "Show Console Panel",
                    systemImage: "terminal",
                ) {
                    self.consolePanel().toggle()
                }
            }
        }
        .onDisappear {
            self.consolePanelController?.dismiss()
        }
    }

    /// Lazily creates `consolePanelController` on first use (first toolbar
    /// tap), passing it the same `logViewModel` instance driving the inline
    /// "Console Output" section above -- never a second
    /// `ServerLogViewModel`. Subsequent calls return the already-created
    /// controller so repeated toggling reuses the same panel.
    private func consolePanel() -> FloatingConsolePanelController {
        if let controller = self.consolePanelController {
            return controller
        }
        let controller = FloatingConsolePanelController(serverName: self.server.name, viewModel: self.logViewModel)
        self.consolePanelController = controller
        return controller
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
            processService: ServerProcessService(),
        )
    }
}
