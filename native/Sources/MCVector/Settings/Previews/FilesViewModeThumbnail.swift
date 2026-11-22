// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// A small drawing of one Files view, for the default view picker in App Settings.
struct FilesViewModeThumbnail: View {
    let mode: FilesViewMode
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            PreviewPalette.window(scheme)
            Group {
                switch mode {
                case .icons: icons
                case .list: list
                case .columns: columns
                case .gallery: gallery
                }
            }
            .padding(7)
        }
    }

    private var faint: Color { PreviewPalette.faint(scheme) }

    private var icons: some View {
        VStack(spacing: 5) {
            ForEach(0..<2, id: \.self) { _ in
                HStack(spacing: 6) {
                    ForEach(0..<4, id: \.self) { column in
                        VStack(spacing: 2) {
                            RoundedRectangle(cornerRadius: 2).fill(column == 0 ? Color.accentColor : faint)
                                .frame(width: 11, height: 9)
                            Capsule().fill(faint).frame(width: 10, height: 2)
                        }
                    }
                }
            }
        }
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(0..<5, id: \.self) { row in
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 1).fill(row == 0 ? Color.accentColor : faint).frame(
                        width: 5, height: 5)
                    Capsule().fill(faint).frame(width: 30, height: 3)
                    Spacer(minLength: 0)
                    Capsule().fill(faint).frame(width: 12, height: 3)
                }
            }
        }
    }

    private var columns: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { column in
                VStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { row in
                        Capsule()
                            .fill(row == 1 && column < 2 ? Color.accentColor : faint)
                            .frame(height: 3)
                    }
                    Spacer(minLength: 0)
                }
                .frame(width: 18)
            }
            RoundedRectangle(cornerRadius: 2).fill(faint).frame(width: 16, height: 16)
        }
    }

    private var gallery: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3).fill(Color.accentColor.opacity(0.8)).frame(width: 30, height: 22)
            HStack(spacing: 3) {
                ForEach(0..<5, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(index == 2 ? Color.accentColor : faint)
                        .frame(width: 8, height: 8)
                }
            }
        }
    }
}
