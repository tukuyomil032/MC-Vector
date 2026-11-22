// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// The side pane of the column and gallery views: the focused entry's
/// thumbnail and facts. Empty when nothing is shown.
struct FilesDetailPane: View {
    let model: FilesModel
    let row: FileRow?

    private var locale: Locale { Locale(identifier: L10n.language) }

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
                        Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 6) {
                            fact("native.files.kind", L10n.t("native.files.group.\(FileKindGroup(row).rawValue)"))
                            fact("native.files.size", sizeText(row))
                            if let count = row.childCount {
                                fact("native.files.items", count.formatted(.number.locale(locale)))
                            }
                            if let created = row.created { fact("native.files.created", dateText(created)) }
                            fact("native.files.modified", dateText(row.modified))
                        }
                        .font(.callout)
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

    private func fact(_ key: String, _ value: String) -> some View {
        GridRow {
            Text(L10n.t(key))
                .foregroundStyle(.secondary)
                .gridColumnAlignment(.trailing)
            Text(value)
                .monospacedDigit()
                .textSelection(.enabled)
        }
    }

    private func sizeText(_ row: FileRow) -> String {
        guard row.isDirectory else { return FilesListView.bytes(row.size) }
        guard let size = model.folderSizes[model.relative(row.name)] else { return "…" }
        return FilesListView.bytes(size.bytes) + (size.complete ? "" : "+")
    }

    private func dateText(_ date: Date) -> String {
        date.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits).hour().minute().locale(locale))
    }
}
