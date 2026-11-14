// SPDX-License-Identifier: GPL-3.0-or-later
//
// Prints the CGWindowID of the frontmost normal window owned by <pid>, or exits 1.
// Usage: swift native/scripts/lib/window-id.swift <pid> [min-width]
// min-width defaults to 300; alerts (CONFIRM-* captures) are narrower.
// (run by native/scripts/capture.sh with TMPDIR and the module cache inside native/.build)

import CoreGraphics
import Foundation

guard (2...3).contains(CommandLine.arguments.count), let pid = Int32(CommandLine.arguments[1]) else {
    FileHandle.standardError.write(Data("usage: window-id.swift <pid> [min-width]\n".utf8))
    exit(2)
}
let minWidth = CommandLine.arguments.count == 3 ? Double(CommandLine.arguments[2]) ?? 300 : 300

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
let match = windows.first { info in
    (info[kCGWindowOwnerPID as String] as? Int32) == pid
        // With an explicit min-width, modal alerts (a higher layer) count too.
        && (CommandLine.arguments.count == 3 || (info[kCGWindowLayer as String] as? Int) == 0)
        && ((info[kCGWindowBounds as String] as? [String: Double])?["Width"] ?? 0) > minWidth
}
guard let id = match?[kCGWindowNumber as String] as? Int else { exit(1) }
print(id)
