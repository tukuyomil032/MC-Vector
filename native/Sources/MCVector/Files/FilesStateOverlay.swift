// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// Loading, empty-folder and no-match states drawn over any Files view, and
/// the highlight while Finder files are dragged in.
struct FilesStateOverlay: View {
    let model: FilesModel
    var isDropTargeted = false

    var body: some View {
        ZStack {
            if model.isLoading && model.items.isEmpty {
                ProgressView(L10n.t("files.loading"))
            } else if model.visibleRows.isEmpty && !model.isLoading {
                ContentUnavailableView(
                    L10n.t(model.filter.isEmpty ? "files.emptyFolder" : "native.files.noMatches"),
                    systemImage: model.filter.isEmpty ? "folder" : "magnifyingglass"
                )
                .allowsHitTesting(false)
            }
            if isDropTargeted {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(Color.accentColor, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                    .background(Color.accentColor.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                    .overlay(alignment: .bottom) {
                        Label(L10n.t("files.dropHint"), systemImage: "square.and.arrow.down")
                            .padding(10)
                            .background(.regularMaterial, in: Capsule())
                            .padding(16)
                    }
                    .padding(6)
                    .allowsHitTesting(false)
            }
        }
    }
}
