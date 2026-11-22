// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The plugin browser in miniature: a grid that fades out over an arrow
/// (keeps loading), or a grid with page numbers under it.
struct PluginsPagingThumbnail: View {
    let paging: PluginsPaging
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack(alignment: .bottom) {
            PreviewPalette.window(scheme)
            VStack(spacing: 4) {
                grid
                Spacer(minLength: 0)
            }
            .padding(6)
            switch paging {
            case .infinite: more
            case .pages: pageNumbers
            }
        }
    }

    private var grid: some View {
        VStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: 4) {
                    ForEach(0..<3, id: \.self) { column in
                        RoundedRectangle(cornerRadius: 2.5)
                            .fill(PreviewPalette.faint(scheme))
                            .overlay(alignment: .topLeading) {
                                RoundedRectangle(cornerRadius: 1.5)
                                    .fill(colors[(row + column) % colors.count].opacity(0.8))
                                    .frame(width: 5, height: 5)
                                    .padding(2)
                            }
                            .frame(height: 11)
                    }
                }
            }
        }
    }

    /// The grid fades toward the bottom, where a spinner arrow sits.
    private var more: some View {
        ZStack(alignment: .bottom) {
            LinearGradient(
                colors: [PreviewPalette.window(scheme).opacity(0), PreviewPalette.window(scheme)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 24)
            Image(systemName: "arrow.down")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(Color.accentColor)
                .padding(.bottom, 4)
        }
    }

    private var pageNumbers: some View {
        HStack(spacing: 3) {
            ForEach(1..<4, id: \.self) { page in
                Text("\(page)")
                    .font(.system(size: 6.5, weight: .bold, design: .rounded))
                    .foregroundStyle(page == 1 ? Color.white : Color.secondary)
                    .frame(width: 10, height: 10)
                    .background(
                        page == 1 ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(PreviewPalette.faint(scheme)),
                        in: RoundedRectangle(cornerRadius: 2.5))
            }
        }
        .padding(.bottom, 5)
    }

    private let colors: [Color] = [.green, .orange, .blue, .purple, .pink]
}
