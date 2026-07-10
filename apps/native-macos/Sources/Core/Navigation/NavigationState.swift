import SwiftUI

/// Owns which top-level `AppView` the detail pane is currently showing.
///
/// Equivalent to the Tauri app's `useUiStore.currentView` -- a single piece
/// of routing state, independent of server selection (`ServerListViewModel
/// .selection`) or any individual view's own local state. `RootView` owns
/// one instance and passes it down to both `ServerListView` (to drive the
/// top navigation section's active-item highlight and taps) and
/// `ContentRouter` (to decide what to render in the detail pane).
@Observable
@MainActor
public final class NavigationState {
    public var currentView: AppView = .dashboard

    public init(currentView: AppView = .dashboard) {
        self.currentView = currentView
    }
}
