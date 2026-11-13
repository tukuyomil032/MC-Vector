// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Server status words and colors. Words come from the React keys
/// (`server.status.*`); colors are the system ones, so they follow the user's
/// accent and appearance settings (the web color tokens are not copied).
enum ServerStatusStyle {
    static func labelKey(_ status: String) -> String {
        switch status {
        case "online", "offline", "starting", "stopping", "restarting", "crashed":
            "server.status.\(status)"
        default:
            "server.status.offline"
        }
    }

    static func color(_ status: String) -> Color {
        switch status {
        case "online": .green
        case "starting", "stopping", "restarting": .orange
        case "crashed": .red
        default: .secondary
        }
    }

    /// React `canStartServer`: a stopped or crashed server can be started.
    static func canStart(_ status: String) -> Bool {
        status == "offline" || status == "crashed"
    }
}
