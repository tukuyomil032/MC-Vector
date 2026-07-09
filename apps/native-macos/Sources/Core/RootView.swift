import SwiftUI

/// Top-level app shell: a `NavigationSplitView` with the server list as the
/// sidebar and the selected server's detail as the detail pane, falling
/// back to a "select a server" placeholder when nothing is selected or the
/// selected id no longer matches any loaded server.
public struct RootView: View {
    @State private var viewModel: ServerListViewModel
    /// Toggles the Activity Drawer (task 3-10). Owned here, not by
    /// `ServerListViewModel` -- it's pure view-presentation state with no
    /// bearing on the view model's data, matching how `ServerDetailView`
    /// keeps its own console-panel visibility state locally rather than
    /// hoisting it.
    @State private var isActivityDrawerPresented = false

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
        // Attached to the outer `NavigationSplitView` (not inside the
        // `detail` closure) so the Activity Drawer is a global, all-servers
        // panel available regardless of sidebar selection -- unlike
        // Start/Stop (attached inside `detail`, since those act on
        // `viewModel.selectedServer` and are meaningless with nothing
        // selected). SwiftUI merges this `.toolbar` with `ServerDetailView`'s
        // own `.toolbar` (the 3-9 console toggle) into one unified toolbar
        // when a server is selected, the same way `ServerDetailView`'s
        // toolbar already merges with the Start/Stop toolbar above.
        .inspector(isPresented: self.$isActivityDrawerPresented) {
            ActivityDrawerView(entries: self.viewModel.activityLog)
                .inspectorColumnWidth(min: 220, ideal: 280, max: 380)
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button(
                    self.isActivityDrawerPresented ? "Hide Activity" : "Show Activity",
                    systemImage: "clock.arrow.circlepath",
                ) {
                    self.isActivityDrawerPresented.toggle()
                }
            }
        }
        // Surfaces `ServerListViewModel.error` (task 3-12 code-review fix):
        // previously `load()`/`startSelectedServer()`/`stopSelectedServer()`
        // all set that property on failure, but no View ever read it, so a
        // failed start/stop (e.g. a missing Java path) had zero user-visible
        // signal beyond the status silently reverting.
        //
        // Uses `.alert(_:isPresented:presenting:actions:message:)` -- the
        // current, non-deprecated alert API -- rather than the older
        // `alert(item:content:) -> Alert` overload: that one predates this
        // API and is itself soft-deprecated (it returns the also-deprecated
        // `Alert` type; see `references/soft-deprecation.md` in
        // `swiftui-expert-skill`, which calls out `Alert`/`ActionSheet` by
        // name). `presenting:` still takes `viewModel.error` as a snapshot,
        // so `message` reads a value captured at presentation time rather
        // than re-reading a since-possibly-cleared view model property.
        //
        // `isPresented` still needs an explicit `Binding<Bool>` -- that's an
        // inherent part of this API's shape, not an avoidable synthesis --
        // but unlike the anti-pattern the review flagged, it only decides
        // *whether* to show the alert; the message content itself never
        // flows through it, so there is no risk of the boolean and the
        // string momentarily disagreeing about what happened.
        .alert(
            "Something Went Wrong",
            isPresented: Binding(
                get: { self.viewModel.error != nil },
                set: { isPresented in
                    if !isPresented {
                        self.viewModel.clearError()
                    }
                },
            ),
            presenting: self.viewModel.error,
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { error in
            Text(error.message)
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
