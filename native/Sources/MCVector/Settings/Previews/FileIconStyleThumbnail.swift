// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A three-row Files list drawn with one icon style, for the file and folder
/// icon pickers in App Settings.
struct FileIconStyleThumbnail: View {
    let style: FileIconStyle
    let isDirectory: Bool
    @Environment(\.colorScheme) private var scheme

    private var names: [String] {
        isDirectory ? ["world", "plugins", "logs"] : ["server.properties", "bukkit.yml", "paper.jar"]
    }

    var body: some View {
        ZStack {
            PreviewPalette.window(scheme)
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(names.enumerated()), id: \.offset) { index, name in
                    HStack(spacing: 5) {
                        FileIconView(name: name, isDirectory: isDirectory, size: 12, style: style)
                        Capsule()
                            .fill(PreviewPalette.faint(scheme))
                            .frame(width: [38, 30, 34][index], height: 4)
                    }
                }
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
