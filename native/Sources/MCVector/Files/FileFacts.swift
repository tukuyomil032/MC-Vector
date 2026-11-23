// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorCore
import SwiftUI

/// What the Files view tells about one entry: kind, size, item count, dates
/// and its path (click to copy), plus lines, encoding and line endings for
/// text files. Shared by the column/gallery side pane and the ⌘I popover.
struct FileFacts: View {
    let model: FilesModel
    let row: FileRow
    @State private var text: TextFacts?
    @State private var minecraft: MinecraftFacts?
    @State private var copied = false

    private var locale: Locale { Locale(identifier: L10n.language) }
    private var relativePath: String { model.relative(row.name) }

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 6) {
            fact("native.files.kind", L10n.t("native.files.group.\(FileKindGroup(row).rawValue)"))
            fact("native.files.size", sizeText)
            if let count = row.childCount {
                fact("native.files.items", count.formatted(.number.locale(locale)))
            }
            if let created = row.created { fact("native.files.created", dateText(created)) }
            fact("native.files.modified", dateText(row.modified))
            if let text {
                fact("native.files.lines", text.lines.formatted(.number.locale(locale)))
                fact(
                    "native.files.encoding",
                    L10n.t(text.hasBOM ? "native.files.encoding.utf8bom" : "native.files.encoding.utf8"))
                fact("native.files.lineEndings", L10n.t(text.lineEndingKey))
            }
            minecraftFacts
            GridRow {
                Text(L10n.t("native.files.where"))
                    .foregroundStyle(.secondary)
                    .gridColumnAlignment(.trailing)
                pathButton
            }
        }
        .font(.callout)
        .animation(Motion.standard, value: text)
        .animation(Motion.standard, value: minecraft)
        .task(id: "\(relativePath)@\(row.modified.timeIntervalSince1970)") {
            text = await TextFacts.load(serverID: model.serverID, relative: relativePath, row: row)
            minecraft = await MinecraftFacts.load(serverID: model.serverID, relative: relativePath, row: row)
        }
    }

    /// A world folder's level.dat, a region file's chunks or an NBT file's tags.
    @ViewBuilder
    private var minecraftFacts: some View {
        switch minecraft {
        case .world(let world):
            if let name = world.levelName { fact("native.world.name", name) }
            if let seed = world.seed { fact("native.world.seed", String(seed)) }
            if let version = world.versionName { fact("native.world.version", version) }
            if let mode = world.gameType.flatMap({ NbtKind.gameMode(Int($0)) }) {
                fact("native.world.gameMode", mode)
            }
            if let hardcore = world.hardcore {
                fact("native.world.hardcore", L10n.t(hardcore ? "native.nbt.yes" : "native.nbt.no"))
            }
            if let lastPlayed = world.lastPlayed, lastPlayed > 0 {
                fact("native.world.lastPlayed", dateText(Date(timeIntervalSince1970: TimeInterval(lastPlayed) / 1000)))
            }
        case .regionChunks(let count):
            fact("native.files.chunks", count.formatted(.number.locale(locale)))
        case .nbtTags(let count):
            fact("native.files.nbtTags", count.formatted(.number.locale(locale)))
        case nil:
            EmptyView()
        }
    }

    private var pathButton: some View {
        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(relativePath, forType: .string)
            withAnimation(Motion.snappy) { copied = true }
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                withAnimation(Motion.snappy) { copied = false }
            }
        } label: {
            HStack(spacing: 4) {
                Text(relativePath)
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .multilineTextAlignment(.leading)
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .foregroundStyle(copied ? Color.green : .secondary)
                    .contentTransition(.symbolEffect(.replace))
            }
        }
        .buttonStyle(.plain)
        .help(L10n.t("native.files.copyPath"))
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

    private var sizeText: String {
        guard row.isDirectory else { return FilesListView.bytes(row.size) }
        guard let size = model.folderSizes[relativePath] else { return "…" }
        return FilesListView.bytes(size.bytes) + (size.complete ? "" : "+")
    }

    private func dateText(_ date: Date) -> String {
        date.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits).hour().minute().locale(locale))
    }
}

/// Lines, BOM and line endings of a UTF-8 text file, read like the editor
/// reads it. Nil for folders, binaries, non-UTF-8 and files over 5 MB.
struct TextFacts: Equatable {
    let lines: Int
    let hasBOM: Bool
    let lineEnding: LineEnding
    let mixed: Bool

    var lineEndingKey: String {
        if mixed { return "native.files.lineEndings.mixed" }
        return lineEnding == .crlf ? "native.files.lineEndings.crlf" : "native.files.lineEndings.lf"
    }

    @MainActor
    static func load(serverID: String, relative: String, row: FileRow) async -> TextFacts? {
        guard !row.isDirectory, !FileKind.isBinary(row.name), !FileKind.isNbt(row.name),
            row.size <= EditorDocument.maxEditableBytes,
            let document = try? await CoreClient.readTextDocument(serverID: serverID, relative: relative)
        else { return nil }
        let text = document.text
        let lines = text.isEmpty ? 0 : text.split(separator: "\n", omittingEmptySubsequences: false).count
        return TextFacts(
            lines: text.hasSuffix("\n") ? lines - 1 : lines, hasBOM: document.hasBom,
            lineEnding: document.lineEnding, mixed: document.mixedLineEndings)
    }
}
