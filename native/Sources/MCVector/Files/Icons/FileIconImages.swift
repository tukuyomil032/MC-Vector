// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit

/// The colored icons' SVGs from Contents/Resources/MaterialIcons, loaded once
/// each and kept as vector images (NSImage reads SVG natively).
@MainActor
enum FileIconImages {
    private static var cache: [String: NSImage] = [:]
    private static var missing: Set<String> = []

    static func image(named name: String) -> NSImage? {
        if let cached = cache[name] { return cached }
        if missing.contains(name) { return nil }
        guard
            let url = Bundle.main.url(forResource: name, withExtension: "svg", subdirectory: "MaterialIcons"),
            let image = NSImage(contentsOf: url)
        else {
            missing.insert(name)
            return nil
        }
        cache[name] = image
        return image
    }
}
