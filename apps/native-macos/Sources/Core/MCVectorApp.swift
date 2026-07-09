import SwiftUI

/// The Native app's real, persistent window.
///
/// `Main.swift` invokes `MCVectorApp.main()` for normal (non-spike)
/// launches -- mirroring how spike windows are launched via their own
/// `App`-conforming types (see `PanelSpikeRunner.runSwiftUIWindowLevel()`).
/// This is the first task where the app becomes runnable as a real windowed
/// app, so it's kept intentionally minimal: no menu bar customization, no
/// app delegate logic, just `RootView` in a `WindowGroup`.
public struct MCVectorApp: App {
    public init() {}

    public var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
