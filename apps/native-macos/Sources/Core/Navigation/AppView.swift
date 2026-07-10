import Foundation

/// The set of top-level views the native app's sidebar can route to.
///
/// String-backed (rather than `Int`-backed) so a raw value is stable across
/// case reordering and legible in logs/debugging -- mirrors the Tauri app's
/// `AppView` union type (`src/lib/...`), which is also a set of string
/// literals. This enum is the native equivalent of that union: every case
/// here corresponds 1:1 with a value the web app's `useUiStore.currentView`
/// can hold.
///
/// `serverSettings` is deliberately a distinct case from `properties` --
/// mirroring the Tauri app, which keeps "Properties" (raw `server.properties`
/// editing) and "Server Settings" (structured config: auto-restart,
/// auto-backup, notifications) as separate views rather than folding one
/// into the other.
///
/// `proxyHelp` and `ngrokGuide` have no corresponding `NavigationItem` --
/// like the Tauri app, they're reachable only as contextual help screens
/// (e.g. a "?" button inside `proxyNetwork`/`appSettings`), not top-level
/// sidebar destinations.
public enum AppView: String, Hashable, Identifiable, Sendable, CaseIterable {
    case dashboard
    case console
    case users
    case files
    case plugins
    case backups
    case properties
    case serverSettings
    case proxyNetwork
    case appSettings
    case proxyHelp
    case ngrokGuide

    public var id: String {
        self.rawValue
    }
}
