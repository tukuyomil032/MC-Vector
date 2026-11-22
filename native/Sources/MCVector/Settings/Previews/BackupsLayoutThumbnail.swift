// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// The Backups view in miniature: stacked cards with tag pills, or a table
/// with a header and columns.
struct BackupsLayoutThumbnail: View {
    let layout: BackupsLayout
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack(alignment: .top) {
            PreviewPalette.window(scheme)
            switch layout {
            case .cards: cards
            case .table: table
            }
        }
    }

    private var cards: some View {
        VStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(Color.accentColor.opacity(0.85)).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 2) {
                        Capsule().fill(PreviewPalette.line(scheme)).frame(width: 26, height: 3)
                        HStack(spacing: 2) {
                            Capsule().fill(tagColors[index].opacity(0.8)).frame(width: 10, height: 3)
                            if index == 0 { Capsule().fill(Color.orange.opacity(0.8)).frame(width: 8, height: 3) }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)
                .frame(height: 14)
                .background(PreviewPalette.faint(scheme), in: RoundedRectangle(cornerRadius: 3))
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }

    private var table: some View {
        VStack(spacing: 0) {
            row(header: true)
            ForEach(0..<4, id: \.self) { index in
                row(header: false)
                    .background(index.isMultiple(of: 2) ? PreviewPalette.faint(scheme) : .clear)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }

    private func row(header: Bool) -> some View {
        HStack(spacing: 4) {
            Capsule().frame(width: 24, height: header ? 3 : 2.5)
            Capsule().frame(width: 14, height: header ? 3 : 2.5)
            Spacer(minLength: 0)
            Capsule().frame(width: 10, height: header ? 3 : 2.5)
        }
        .foregroundStyle(
            header ? AnyShapeStyle(Color.accentColor.opacity(0.8)) : AnyShapeStyle(PreviewPalette.line(scheme))
        )
        .padding(.horizontal, 3)
        .frame(height: 8)
    }

    private let tagColors: [Color] = [.green, .blue, .purple]
}
