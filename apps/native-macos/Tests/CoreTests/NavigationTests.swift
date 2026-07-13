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

@MainActor
private func makeContentRouter(currentView: AppView) -> ContentRouter {
    let store = ServerStore(
        fileURL: FileManager.default.temporaryDirectory
            .appendingPathComponent("mc-vector-content-router-test-\(UUID().uuidString).json"),
    )
    return ContentRouter(
        navigationState: NavigationState(currentView: currentView),
        viewModel: ServerListViewModel(store: store),
        performanceService: ServerPerformanceService(),
    )
}

@Test(
    "ContentRouter.currentLabel/currentSystemImage resolve to the matching NavigationItem for every top-level view",
    arguments: NavigationItem.allItems,
)
@MainActor
func contentRouterResolvesLabelAndImageFromNavigationItem(item: NavigationItem) {
    let router = makeContentRouter(currentView: item.view)

    #expect(router.currentLabel == item.labelKey)
    #expect(router.currentSystemImage == item.systemImage)
}

@Test("ContentRouter falls back to a capitalized raw value and placeholder symbol for views with no NavigationItem")
@MainActor
func contentRouterFallsBackForViewsWithoutNavigationItem() {
    let router = makeContentRouter(currentView: .appSettings)

    #expect(router.currentLabel == "Appsettings")
    #expect(router.currentSystemImage == "questionmark.square.dashed")
}

@Test("ContentRouter.canStart mirrors the pre-4-4 RootView logic")
func contentRouterCanStart() {
    let startable: [ServerStatus] = [.offline, .crashed]
    let notStartable: [ServerStatus] = [.online, .starting, .stopping, .restarting]

    for status in startable {
        #expect(ContentRouter.canStart(makeServer(withStatus: status)))
    }
    for status in notStartable {
        #expect(!ContentRouter.canStart(makeServer(withStatus: status)))
    }
}

@Test("ContentRouter.canStop mirrors the pre-4-4 RootView logic")
func contentRouterCanStop() {
    let stoppable: [ServerStatus] = [.online, .starting, .restarting]
    let notStoppable: [ServerStatus] = [.offline, .crashed, .stopping]

    for status in stoppable {
        #expect(ContentRouter.canStop(makeServer(withStatus: status)))
    }
    for status in notStoppable {
        #expect(!ContentRouter.canStop(makeServer(withStatus: status)))
    }
}

private func makeServer(withStatus status: ServerStatus) -> Server {
    Server(
        id: "srv-1",
        name: "Survival",
        version: "1.21.1",
        software: "paper",
        port: 25565,
        memory: 4096,
        path: "/servers/srv-1",
        status: status,
    )
}
