// SPDX-License-Identifier: GPL-3.0-or-later
#if DEBUG
    import AppKit
    import SwiftUI

    extension CaptureState {
        static var highCpuNoticeCount = 0
        static func check(_ name: String, _ passed: Bool, _ detail: String = "") {
            signal(passed ? "[e2e] ok \(name)" : "[e2e] fail \(name): \(detail)")
        }

        static func verifyNavigation(app: AppState) async {
            let main = NSApp.windows.first { $0.isVisible && $0.canBecomeMain }
            for route in AppRoute.allCases {
                app.navigate(to: route)
                try? await Task.sleep(for: .milliseconds(500))
                // These routes intentionally open the Settings window instead of
                // replacing the main content (AppState.navigate).
                if route == .properties || route == .generalSettings {
                    let settings = NSApp.windows.first { $0.isVisible && $0 !== main && $0.frame.width > 500 }
                    check("route \(route.rawValue)", settings != nil, "Settings window did not open")
                    settings?.performClose(nil)
                    try? await Task.sleep(for: .milliseconds(100))
                } else {
                    check("route \(route.rawValue)", app.route == route, "actual=\(app.route.rawValue)")
                }
            }
            app.openSettings(.app(.general))
            try? await Task.sleep(for: .milliseconds(500))
            let settings = NSApp.windows.first { $0.isVisible && $0 !== main && $0.frame.width > 500 }
            check("Settings opened", settings != nil)
            settings?.performClose(nil)
            try? await Task.sleep(for: .milliseconds(500))
            check("Settings closed", settings != nil && settings?.isVisible == false)
            main?.makeKeyAndOrderFront(nil)
            check("navigation completed", NSApp.isRunning)
        }
    }
#endif
