import Foundation

/// A single row in the sidebar's top "navigation tabs" section, pairing an
/// `AppView` destination with its SF Symbol and display label.
///
/// Not every `AppView` case has a `NavigationItem` -- `appSettings`,
/// `proxyHelp`, and `ngrokGuide` are reachable only as contextual
/// destinations (e.g. a settings/help button inside another view), not
/// top-level sidebar rows, mirroring the Tauri app's sidebar. See
/// `AppView`'s doc comment.
public struct NavigationItem: Hashable, Identifiable, Sendable {
    public let view: AppView
    public let labelKey: String
    public let systemImage: String
    /// When `true`, `ServerListView` renders a `Divider` immediately above
    /// this item -- used to visually separate `proxyNetwork` from the
    /// preceding server-management items, matching the Tauri sidebar's
    /// section break before its network-related entries.
    public let showDividerBefore: Bool

    public var id: AppView {
        self.view
    }

    public init(view: AppView, labelKey: String, systemImage: String, showDividerBefore: Bool = false) {
        self.view = view
        self.labelKey = labelKey
        self.systemImage = systemImage
        self.showDividerBefore = showDividerBefore
    }

    /// The sidebar's top navigation section, in display order. Excludes
    /// `appSettings`, `proxyHelp`, and `ngrokGuide` -- see this type's doc
    /// comment.
    public static let allItems: [NavigationItem] = [
        NavigationItem(view: .dashboard, labelKey: "Dashboard", systemImage: "gauge.with.dots.needle.bottom.50percent"),
        NavigationItem(view: .console, labelKey: "Console", systemImage: "terminal"),
        NavigationItem(view: .users, labelKey: "Users", systemImage: "person.2"),
        NavigationItem(view: .files, labelKey: "Files", systemImage: "folder"),
        NavigationItem(view: .plugins, labelKey: "Plugins / Mod", systemImage: "puzzlepiece"),
        NavigationItem(view: .backups, labelKey: "Backups", systemImage: "externaldrive"),
        NavigationItem(view: .properties, labelKey: "Properties", systemImage: "slider.horizontal.3"),
        NavigationItem(view: .serverSettings, labelKey: "Server Settings", systemImage: "gearshape"),
        NavigationItem(view: .proxyNetwork, labelKey: "Proxy Network", systemImage: "network", showDividerBefore: true)
    ]
}
