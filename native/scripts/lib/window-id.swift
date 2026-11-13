// SPDX-License-Identifier: GPL-3.0-or-later
//
// Prints the CGWindowID of the frontmost normal window owned by <pid>, or exits 1.
// Usage: swift native/scripts/lib/window-id.swift <pid>
// (run by native/scripts/capture.sh with TMPDIR and the module cache inside native/.build)

import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else {
    FileHandle.standardError.write(Data("usage: window-id.swift <pid>\n".utf8))
    exit(2)
}

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
let match = windows.first { info in
    (info[kCGWindowOwnerPID as String] as? Int32) == pid
        && (info[kCGWindowLayer as String] as? Int) == 0
        && ((info[kCGWindowBounds as String] as? [String: Double])?["Width"] ?? 0) > 300
}
guard let id = match?[kCGWindowNumber as String] as? Int else { exit(1) }
print(id)
