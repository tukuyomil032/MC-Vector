// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import AppKit
    import SwiftUI

    extension CaptureState {
        /// PLAYGROUND-<part>[-macos15]: the UI Playground on one part, in front
        /// of the main window. The morphing bar opens with several items selected.
        @MainActor
        static func showPlayground(_ id: String) async {
            var name = String(id.dropFirst("PLAYGROUND-".count))
            let fallback = name.hasSuffix("-macos15")
            if fallback { name = String(name.dropLast("-macos15".count)) }
            guard let part = PlaygroundPart(rawValue: name) else {
                signal("[capture] unknown playground part: \(name)")
                return
            }
            PlaygroundWindow.capturePreset = (part, fallback, .many)
            let main = NSApp.windows.first { $0.isVisible && $0.canBecomeMain }
            NotificationCenter.default.post(name: .openPlayground, object: nil)
            try? await Task.sleep(for: .milliseconds(1200))
            if let playground = NSApp.windows.first(where: { $0.isVisible && $0 !== main && $0.frame.width > 500 }) {
                main?.orderOut(nil)
                NSApp.activate()
                playground.makeKeyAndOrderFront(nil)
            } else {
                signal("[capture] UI Playground did not open")
            }
        }
    }
#endif
