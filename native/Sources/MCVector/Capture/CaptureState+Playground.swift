// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import AppKit
    import SwiftUI

    extension CaptureState {
        /// PLAYGROUND-<part>[-option…]: the UI Playground on one part, in front of
        /// the main window. Options, in any order: light (dark otherwise),
        /// macos15, simple (SF Symbol icons; colored otherwise) and small (20 pt
        /// icons). The morphing bar opens with several items selected.
        @MainActor
        static func showPlayground(_ id: String) async {
            let words = id.dropFirst("PLAYGROUND-".count).split(separator: "-").map(String.init)
            guard let name = words.first, let part = PlaygroundPart(rawValue: name) else {
                signal("[capture] unknown playground part: \(id)")
                return
            }
            let options = Set(words.dropFirst())
            var preset = PlaygroundWindow.CapturePreset(
                part: part, fallback: options.contains("macos15"), selection: .many,
                isDark: !options.contains("light"))
            if options.contains("simple") { preset.iconStyle = .simple }
            if options.contains("small") { preset.iconSize = 20 }
            PlaygroundWindow.capturePreset = preset
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
