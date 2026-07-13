import SwiftUI

/// Top-level app shell: a `NavigationSplitView` with the two-section sidebar
/// (`ServerListView`: navigation tabs + server list) on one side and
/// `ContentRouter` -- which switches on `NavigationState.currentView` to
/// decide what to render, falling back to a "select a server" placeholder
/// for server-dependent views when nothing is selected or the selected id
/// no longer matches any loaded server -- as the detail pane.
public struct RootView: View {
    @State private var viewModel: ServerListViewModel
    /// Owns which top-level `AppView` the detail pane shows (task 4-4).
    /// Shared with both `ServerListView` (drives the top nav section's
    /// active-item highlight and taps) and `ContentRouter` (decides what to
    /// render), the same way `viewModel` is shared with both.
    @State private var navigationState = NavigationState()
    /// Toggles the Activity Drawer (task 3-10). Owned here, not by
    /// `ServerListViewModel` -- it's pure view-presentation state with no
    /// bearing on the view model's data, matching how `ServerDetailView`
    /// keeps its own console-panel visibility state locally rather than
    /// hoisting it.
    @State private var isActivityDrawerPresented = false
    /// Shared 1 Hz CPU/memory sampler service (task 5-4). Held here as
    /// `@State` so it survives every re-render of `ContentRouter` and
    /// so a single instance is shared across every server's Dashboard
    /// subscription -- the actor itself is stateless per-server (all
    /// per-server state lives inside the returned `AsyncStream`s), so
    /// one service instance handles them all.
    @State private var performanceService = ServerPerformanceService()

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
            ServerListView(viewModel: self.viewModel, navigationState: self.navigationState)
        } detail: {
            // `ContentRouter` switches on `navigationState.currentView` to
            // decide what to render (task 4-4) -- `RootView` no longer
            // hard-codes `ServerDetailView` as the only possible detail
            // content. Start/Stop moved into `ContentRouter` too, so they
            // stay attached to the detail pane across every `AppView`, not
            // just `.serverSettings`.
            ContentRouter(
                navigationState: self.navigationState,
                viewModel: self.viewModel,
                performanceService: self.performanceService,
            )
        }
        // Attached to the outer `NavigationSplitView` (not inside the
        // `detail` closure) so the Activity Drawer is a global, all-servers
        // panel available regardless of sidebar selection -- unlike
        // Start/Stop (attached inside `ContentRouter` as of task 4-4, since
        // those act on `viewModel.selectedServer` and are meaningless with
        // nothing selected). SwiftUI merges this `.toolbar` with
        // `ContentRouter`'s own Start/Stop toolbar (and, when `.serverSettings`
        // is active, `ServerDetailView`'s console-toggle toolbar nested
        // inside it) into one unified toolbar.
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
