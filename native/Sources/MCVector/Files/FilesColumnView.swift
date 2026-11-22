// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// The column view: one column per folder from the server folder down to the
/// current one, then the focused file's details. The last column is the
/// current folder (its rows, selection and actions are the model's); the ones
/// before it come from `model.columnListings` and show which folder was opened.
struct FilesColumnView: View {
    @Bindable var model: FilesModel
    @State private var isDropTargeted = false
    @FocusState private var isFocused: Bool

    private static let columnWidth: CGFloat = 230

    var body: some View {
        ScrollViewReader { reader in
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    ForEach(0...model.path.count, id: \.self) { depth in
                        column(depth)
                            .frame(width: Self.columnWidth)
                            .id(depth)
                        Divider()
                    }
                    FilesDetailPane(model: model, row: previewRow)
                        .id("preview")
                }
                .frame(maxHeight: .infinity)
            }
            .onChange(of: model.path) {
                withAnimation(Motion.standard) { reader.scrollTo("preview", anchor: .trailing) }
            }
            .onAppear { reader.scrollTo("preview", anchor: .trailing) }
        }
        .overlay { FilesStateOverlay(model: model, isDropTargeted: isDropTargeted).allowsHitTesting(false) }
        .focusable()
        .focused($isFocused)
        .focusEffectDisabled()
        .onKeyPress(.upArrow) {
            model.moveSelection(by: -1)
            return .handled
        }
        .onKeyPress(.downArrow) {
            model.moveSelection(by: 1)
            return .handled
        }
        .onKeyPress(.leftArrow) { goLeft() }
        .onKeyPress(.rightArrow) { goRight() }
        .onDeleteCommand { Task { await model.trash(model.selection) } }
        .onChange(of: model.showsHidden) { model.columnListings = [:] }
        .dropDestination(for: URL.self) { urls, _ in
            let files = urls.filter(\.isFileURL)
            guard !files.isEmpty else { return false }
            Task { await model.importFiles(files) }
            return true
        } isTargeted: {
            isDropTargeted = $0
        }
        .onAppear { isFocused = true }
    }

    /// The single selected file of the current folder.
    private var previewRow: FileRow? {
        guard model.selection.count == 1, let name = model.selection.first else { return nil }
        return model.visibleRows.first { $0.name == name && !$0.isDirectory }
    }

    // MARK: Columns

    @ViewBuilder
    private func column(_ depth: Int) -> some View {
        let isCurrent = depth == model.path.count
        let folder = Array(model.path.prefix(depth))
        let rows = isCurrent ? model.visibleRows : (model.columnListings[key(folder)] ?? [])
        let opened = isCurrent ? nil : model.path[depth]
        ScrollView {
            LazyVStack(spacing: 1) {
                ForEach(rows) { row in
                    entry(row, folder: folder, isCurrent: isCurrent, isOpened: row.name == opened)
                }
            }
            .padding(6)
        }
        // Keyed by the role too: a column that stops being the current folder
        // keeps its folder path, so a task keyed by the path alone never reruns.
        .task(id: "\(key(folder))|\(isCurrent)|\(model.showsHidden)") {
            guard !isCurrent else { return }
            await model.loadColumn(folder)
        }
    }

    private func entry(_ row: FileRow, folder: [String], isCurrent: Bool, isOpened: Bool) -> some View {
        let selected = isCurrent && model.selection.contains(row.name)
        let highlighted = selected || isOpened
        return HStack(spacing: 6) {
            FileIconView(name: row.name, isDirectory: row.isDirectory)
            Text(row.name)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 4)
            if row.isDirectory {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(selected ? Color.white.opacity(0.8) : Color.secondary)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 24)
        .foregroundStyle(selected ? Color.white : .primary)
        .background(
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(selected ? Color.accentColor : isOpened ? Color.primary.opacity(0.12) : .clear)
        )
        .opacity(row.isHidden ? 0.55 : 1)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            guard !row.isDirectory else { return }
            if !isCurrent { model.navigate(to: folder) }
            model.open(row.name)
        }
        .onTapGesture {
            isFocused = true
            choose(row, in: folder, isCurrent: isCurrent)
        }
        .contextMenu {
            if isCurrent {
                FilesContextMenu(model: model, names: model.selection.contains(row.name) ? model.selection : [row.name])
            }
        }
        .draggable(FileDrag.payload(row.name))
        .popover(isPresented: model.isShowingActivity(on: isCurrent ? row.name : ""), arrowEdge: .trailing) {
            if let activity = model.activity { FileActivityBubble(activity: activity) }
        }
    }

    /// A folder opens to the right; a file is selected in its own column.
    private func choose(_ row: FileRow, in folder: [String], isCurrent: Bool) {
        if row.isDirectory {
            model.navigate(to: folder + [row.name])
        } else if isCurrent {
            model.click(row.name)
        } else {
            model.navigate(to: folder)
            model.selection = [row.name]
            model.selectionAnchor = row.name
        }
    }

    private func goLeft() -> KeyPress.Result {
        guard let last = model.path.last else { return .ignored }
        model.goUp()
        model.selection = [last]
        model.selectionAnchor = last
        return .handled
    }

    private func goRight() -> KeyPress.Result {
        guard model.selection.count == 1, let name = model.selection.first,
            model.visibleRows.contains(where: { $0.name == name && $0.isDirectory })
        else { return .ignored }
        model.open(name)
        return .handled
    }

    private func key(_ folder: [String]) -> String { folder.joined(separator: "/") }
}
