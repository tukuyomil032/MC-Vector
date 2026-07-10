import Foundation
import Testing
@testable import Core

@Test("AppView is Identifiable and id equals its raw value")
func appViewIdentifiableMatchesRawValue() {
    for view in AppView.allCases {
        #expect(view.id == view.rawValue)
    }
}

@Test("NavigationItem.allItems has 9 items in the documented order")
func navigationItemAllItemsOrder() {
    let expectedOrder: [AppView] = [
        .dashboard,
        .console,
        .users,
        .files,
        .plugins,
        .backups,
        .properties,
        .serverSettings,
        .proxyNetwork
    ]

    #expect(NavigationItem.allItems.map(\.view) == expectedOrder)
}

@Test("NavigationItem.allItems entries are unique and reference valid AppView cases")
func navigationItemAllItemsAreUnique() {
    let views = NavigationItem.allItems.map(\.view)
    #expect(Set(views).count == views.count)
}

@Test("Only proxyNetwork requests a divider before it")
func navigationItemDividerFlag() {
    for item in NavigationItem.allItems {
        #expect(item.showDividerBefore == (item.view == .proxyNetwork))
    }
}

/// `appSettings`, `proxyHelp`, and `ngrokGuide` are deliberately excluded
/// from the top-level sidebar -- see `AppView`'s and `NavigationItem`'s doc
/// comments. This test documents that exception explicitly rather than
/// asserting every `AppView` case has a `NavigationItem` (which would be
/// false by design).
@Test("AppView cases not covered by a NavigationItem are exactly the contextual-only views")
func appViewCasesWithoutNavigationItem() {
    let coveredViews = Set(NavigationItem.allItems.map(\.view))
    let uncoveredViews = Set(AppView.allCases).subtracting(coveredViews)

    #expect(uncoveredViews == [.appSettings, .proxyHelp, .ngrokGuide])
}

@Test("NavigationState defaults to .dashboard")
@MainActor
func navigationStateDefaultsToDashboard() {
    let state = NavigationState()
    #expect(state.currentView == .dashboard)
}

@Test("NavigationState.currentView can be reassigned")
@MainActor
func navigationStateCurrentViewIsSettable() {
    let state = NavigationState(currentView: .console)
    #expect(state.currentView == .console)

    state.currentView = .backups
    #expect(state.currentView == .backups)
}
