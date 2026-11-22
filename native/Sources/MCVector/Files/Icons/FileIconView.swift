// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A file's or folder's icon in the style chosen in App Settings: Material Icon
/// Theme's colored icon, or the app's SF Symbol for the kind.
struct FileIconView: View {
    let name: String
    let isDirectory: Bool
    var size: CGFloat = 16
    /// A fixed style (settings previews); nil follows App Settings.
    var style: FileIconStyle?

    @AppStorage(FileIconStyle.filesKey) private var fileStyle = FileIconStyle.color
    @AppStorage(FileIconStyle.foldersKey) private var folderStyle = FileIconStyle.color

    var body: some View {
        Group {
            if let image = coloredImage {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
            } else {
                Image(systemName: isDirectory ? "folder.fill" : FileKind.symbol(for: name))
                    .font(.system(size: size * 0.8))
                    .foregroundStyle(isDirectory ? Color.accentColor : .secondary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// The colored icon, or nil for the simple style (or a missing SVG).
    private var coloredImage: NSImage? {
        guard (style ?? (isDirectory ? folderStyle : fileStyle)) == .color else { return nil }
        return FileIconImages.image(named: FileIconCatalog.iconName(for: name, isDirectory: isDirectory))
    }
}
