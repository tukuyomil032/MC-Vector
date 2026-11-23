// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorCore
import SwiftUI

/// An NBT file as a read-only tree of tags, in place of the editor: name,
/// type and value per row, a search over names and values, and copying of
/// values and tag paths.
struct NbtTreeView: View {
    let file: OpenedFile
    let close: () -> Void
    @State private var model: NbtTreeModel

    init(serverID: String, file: OpenedFile, close: @escaping () -> Void) {
        self.file = file
        self.close = close
        _model = State(initialValue: NbtTreeModel(serverID: serverID, relativePath: file.relative))
    }

    private var locale: Locale { Locale(identifier: L10n.language) }

    #if DEBUG
        /// Capture tooling: a search to type once the tree has loaded.
        static var captureQuery: String?
    #endif

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            content
        }
        .task {
            await model.load()
            #if DEBUG
                if let query = Self.captureQuery {
                    Self.captureQuery = nil
                    model.query = query
                }
            #endif
        }
        .onExitCommand(perform: close)
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 8) {
            Button(L10n.t("files.editor.close"), systemImage: "chevron.left", action: close)
                .labelStyle(.iconOnly)
                .help(L10n.t("files.editor.close"))
            FileIconView(name: file.name, isDirectory: false)
            Text(file.name)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
                .help(file.relative)
            Text(L10n.t("native.nbt.readOnly"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.primary.opacity(0.08), in: Capsule())
            Spacer(minLength: 8)
            GlassSearchField(
                text: $model.query, prompt: L10n.t("native.nbt.search"),
                clearLabel: L10n.t("native.settings.clearSearch")
            )
            .frame(width: 240)
            Button(L10n.t("native.nbt.expandAll"), systemImage: "arrow.down.right.and.arrow.up.left") {
                withAnimation(Motion.standard) { model.expandAll() }
            }
            .help(L10n.t("native.nbt.expandAll"))
            Button(L10n.t("native.nbt.collapseAll"), systemImage: "arrow.up.left.and.arrow.down.right") {
                withAnimation(Motion.standard) { model.collapseAll() }
            }
            .help(L10n.t("native.nbt.collapseAll"))
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .disabled(model.phase != .ready)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ProgressView(L10n.t("files.loading"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            ContentUnavailableView {
                Label(L10n.t("native.nbt.unreadable"), systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button(L10n.t("properties.retry")) { Task { await model.load() } }
            }
        case .ready:
            VStack(spacing: 0) {
                if model.truncated {
                    Label(
                        L10n.t("native.nbt.truncated", ["count": model.nodeCount.formatted(.number.locale(locale))]),
                        systemImage: "scissors"
                    )
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.yellow.opacity(0.12))
                }
                tree
            }
        }
    }

    private var tree: some View {
        let rows = model.rows
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    line(row)
                        .background(index.isMultiple(of: 2) ? Color.clear : Color.primary.opacity(0.035))
                }
            }
            .padding(.vertical, 4)
        }
        .overlay {
            if rows.isEmpty && !model.query.isEmpty {
                ContentUnavailableView.search(text: model.query)
            }
        }
    }

    private func line(_ row: NbtTreeModel.Row) -> some View {
        let node = row.node
        let open = !model.query.isEmpty || model.expanded.contains(node.id)
        return HStack(spacing: 6) {
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .rotationEffect(.degrees(open ? 90 : 0))
                .opacity(row.isContainer && node.childCount > 0 ? 1 : 0)
                .frame(width: 12)
            Image(systemName: NbtKind.symbol(node.kind))
                .font(.caption)
                .foregroundStyle(NbtKind.tint(node.kind))
                .frame(width: 16)
                .help(L10n.t("native.nbt.kind.\(node.kind)"))
            Text(node.name)
                .fontWeight(.medium)
                .lineLimit(1)
            if row.isContainer {
                Text("(\(node.childCount.formatted(.number.locale(locale))))")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            } else {
                Text(node.value)
                    .font(.system(.body, design: .monospaced))
                    .foregroundStyle(node.kind == "string" ? Color.green : .primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .textSelection(.enabled)
                if let meaning = NbtKind.meaning(of: node, locale: locale) {
                    Text(meaning)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .font(.callout)
        .padding(.leading, 12 + CGFloat(row.depth) * 18)
        .padding(.trailing, 12)
        .frame(height: 24)
        .contentShape(Rectangle())
        .onTapGesture {
            guard row.isContainer, model.query.isEmpty else { return }
            withAnimation(Motion.snappy) { model.toggle(node.id) }
        }
        .contextMenu {
            if !row.isContainer {
                Button(L10n.t("native.nbt.copyValue"), systemImage: "doc.on.doc") { copy(node.value) }
            }
            Button(L10n.t("native.nbt.copyPath"), systemImage: "point.topleft.down.to.point.bottomright.curvepath") {
                copy(model.path(of: node.id))
            }
        }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}

/// How each tag type looks, and what some well-known values mean.
enum NbtKind {
    static func symbol(_ kind: String) -> String {
        switch kind {
        case "compound": "curlybraces"
        case "list": "list.bullet"
        case "string": "quote.opening"
        case "byte_array", "int_array", "long_array": "square.grid.3x1.below.line.grid.1x2"
        case "float", "double": "number.circle"
        default: "number"
        }
    }

    static func tint(_ kind: String) -> Color {
        switch kind {
        case "compound": .orange
        case "list": .purple
        case "string": .green
        case "byte_array", "int_array", "long_array": .teal
        default: .blue
        }
    }

    /// Dates for epoch-millisecond longs and names for game modes and flags.
    static func meaning(of node: NbtNode, locale: Locale) -> String? {
        switch (node.name, node.kind) {
        case ("LastPlayed", "long"):
            guard let millis = Int64(node.value), millis > 0 else { return nil }
            return Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
                .formatted(.dateTime.year().month(.twoDigits).day(.twoDigits).hour().minute().locale(locale))
        case ("GameType", "int"), ("playerGameType", "int"):
            return Int(node.value).flatMap(gameMode)
        case ("hardcore", "byte"), ("allowCommands", "byte"):
            return L10n.t(node.value == "0" ? "native.nbt.no" : "native.nbt.yes")
        default:
            return nil
        }
    }

    static func gameMode(_ value: Int) -> String? {
        switch value {
        case 0: L10n.t("native.world.gameMode.survival")
        case 1: L10n.t("native.world.gameMode.creative")
        case 2: L10n.t("native.world.gameMode.adventure")
        case 3: L10n.t("native.world.gameMode.spectator")
        default: nil
        }
    }
}
