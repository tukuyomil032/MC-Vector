import SwiftUI

public struct SwiftUIWindowLevelSpike: App {
    public init() {}

    public var body: some Scene {
        Window("Glass Spike", id: "glass-spike-window") {
            GlassSpikeContent(title: "SwiftUI Window level")
        }
        .windowLevel(.floating)
    }
}
