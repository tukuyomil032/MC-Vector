// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// The side pane of the column and gallery views: the focused entry's
/// thumbnail and facts. Empty when nothing is shown.
struct FilesDetailPane: View {
    let model: FilesModel
    let row: FileRow?

    var body: some View {
        Group {
            if let row {
                ScrollView {
                    VStack(spacing: 14) {
                        FileThumbnailView(
                            serverID: model.serverID, relative: model.relative(row.name), row: row, size: 128
                        )
                        .padding(.top, 24)
                        Text(row.name)
                            .font(.headline)
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                            .textSelection(.enabled)
                        FileFacts(model: model, row: row)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                    .frame(maxWidth: .infinity)
                }
                .id(row.name)
                .transition(.motionFade)
            } else {
                Color.clear
            }
        }
        .frame(minWidth: 220, idealWidth: 260, maxWidth: 320)
        .animation(Motion.standard, value: row?.name)
    }
}

extension View {
    /// The ⌘I popover for this entry, on a layer of its own so it never
    /// competes with the entry's action popover.
    /// `isEnabled` is false for entries outside the current folder (earlier
    /// columns), whose names may repeat the current folder's.
    func fileInfoPopover(_ model: FilesModel, row: FileRow, edge: Edge = .trailing, isEnabled: Bool = true)
        -> some View
    {
        background {
            Color.clear.popover(
                isPresented: Binding(
                    get: { isEnabled && model.infoTarget == row.name },
                    set: { if !$0, model.infoTarget == row.name { model.infoTarget = nil } }),
                arrowEdge: edge
            ) {
                FileInfoPopover(model: model, row: row)
            }
        }
    }
}

/// The ⌘I popover: the entry's icon and name over its facts.
struct FileInfoPopover: View {
    let model: FilesModel
    let row: FileRow

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                FileIconView(name: row.name, isDirectory: row.isDirectory, size: 32)
                Text(row.name)
                    .font(.headline)
                    .lineLimit(2)
                    .textSelection(.enabled)
            }
            Divider()
            FileFacts(model: model, row: row)
        }
        .padding(14)
        .frame(width: 320, alignment: .leading)
    }
}
