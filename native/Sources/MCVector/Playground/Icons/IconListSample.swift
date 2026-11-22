// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import GlassKit
    import SwiftUI

    /// A Files list as it looks in a server folder, with the chosen icon style,
    /// to judge row height and how the icons sit beside the names.
    struct IconListSample: View {
        @Bindable var state: PlaygroundState

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                GlassSegmentedPicker(
                    FileIconStyle.allCases, selection: $state.iconStyle, title: { L10n.t($0.titleKey) })
                VStack(spacing: 0) {
                    columnTitles
                    Divider()
                    ForEach(Array(Self.rows.enumerated()), id: \.element.name) { index, row in
                        line(row)
                            .background(index.isMultiple(of: 2) ? Color.clear : Color.primary.opacity(0.04))
                    }
                }
                .frame(width: 620)
                .background(.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }

        private var columnTitles: some View {
            HStack(spacing: 0) {
                Text(playgroundText("名前", "Name")).frame(maxWidth: .infinity, alignment: .leading)
                Text(playgroundText("サイズ", "Size")).frame(width: 90, alignment: .trailing)
                Text(playgroundText("更新日", "Modified")).frame(width: 130, alignment: .trailing)
            }
            .font(.callout.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }

        private func line(_ row: Row) -> some View {
            HStack(spacing: 0) {
                Label {
                    Text(row.name).lineLimit(1)
                } icon: {
                    FileIconView(name: row.name, isDirectory: row.isFolder, style: state.iconStyle)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(row.size).foregroundStyle(.secondary).frame(width: 90, alignment: .trailing)
                Text(row.modified).foregroundStyle(.secondary).frame(width: 130, alignment: .trailing)
            }
            .monospacedDigit()
            .frame(height: 20)
            .padding(.horizontal, 12)
            .padding(.vertical, 2)
        }

        private struct Row {
            let name: String
            let isFolder: Bool
            let size: String
            let modified: String

            init(_ name: String, folder: Bool = false, _ size: String, _ modified: String) {
                self.name = name
                self.isFolder = folder
                self.size = size
                self.modified = modified
            }
        }

        /// A Paper server's root folder.
        private static let rows: [Row] = [
            Row("world", folder: true, "412 MB", "11/22 20:31"),
            Row("world_nether", folder: true, "38 MB", "11/22 20:31"),
            Row("world_the_end", folder: true, "12 MB", "11/21 22:05"),
            Row("plugins", folder: true, "86 MB", "11/22 19:12"),
            Row("config", folder: true, "64 KB", "11/20 14:02"),
            Row("logs", folder: true, "3.1 MB", "11/22 20:30"),
            Row("libraries", folder: true, "54 MB", "11/18 09:44"),
            Row("versions", folder: true, "48 MB", "11/18 09:44"),
            Row("crash-reports", folder: true, "220 KB", "11/21 23:58"),
            Row("backups", folder: true, "1.2 GB", "11/22 04:00"),
            Row("bukkit.yml", "1 KB", "11/20 14:02"),
            Row("server.properties", "1 KB", "11/22 18:47"),
            Row("ops.json", "312 B", "11/19 10:11"),
            Row("eula.txt", "158 B", "11/18 09:44"),
            Row("paper.jar", "51 MB", "11/18 09:44"),
            Row("server-icon.png", "9 KB", "11/18 09:50"),
            Row("start.sh", "96 B", "11/18 09:45"),
            Row("backup.zip", "640 MB", "11/21 04:00"),
        ]
    }
#endif
