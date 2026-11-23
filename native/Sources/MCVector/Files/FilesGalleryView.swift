// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// The gallery view: the focused entry large, a strip of every entry below
/// (← → move along it) and its details on the right.
struct FilesGalleryView: View {
    @Bindable var model: FilesModel
    @State private var isDropTargeted = false
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                stage
                Divider()
                strip
            }
            Divider()
            FilesDetailPane(model: model, row: model.focusedRow)
        }
        .overlay { FilesStateOverlay(model: model, isDropTargeted: isDropTargeted).allowsHitTesting(false) }
        .focusable()
        .focused($isFocused)
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) {
            model.moveSelection(by: -1)
            return .handled
        }
        .onKeyPress(.rightArrow) {
            model.moveSelection(by: 1)
            return .handled
        }
        .onKeyPress(.return) {
            guard let row = model.focusedRow else { return .ignored }
            model.open(row.name)
            return .handled
        }
        .onDeleteCommand { Task { await model.trash(model.selection) } }
        .filesQuickLook(model)
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

    /// The focused entry, as large as the space allows (up to 512 pt).
    private var stage: some View {
        GeometryReader { proxy in
            let side = min(512, max(64, min(proxy.size.width, proxy.size.height) - 48))
            ZStack {
                if let row = model.focusedRow {
                    FileThumbnailView(
                        serverID: model.serverID, relative: model.relative(row.name), row: row, size: side
                    )
                    .id(row.name)
                    .transition(.motionFade)
                    .onTapGesture(count: 2) { model.open(row.name) }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(Motion.standard, value: model.focusedRow?.name)
        }
    }

    private var strip: some View {
        ScrollViewReader { reader in
            ScrollView(.horizontal) {
                LazyHStack(spacing: 8) {
                    ForEach(model.visibleRows) { row in
                        thumbnail(row).id(row.name)
                    }
                }
                .padding(10)
            }
            .frame(height: 96)
            .onChange(of: model.focusedRow?.name) { _, name in
                guard let name else { return }
                withAnimation(Motion.standard) { reader.scrollTo(name, anchor: .center) }
            }
        }
    }

    private func thumbnail(_ row: FileRow) -> some View {
        let focused = row.name == model.focusedRow?.name && !model.selection.isEmpty
        let selected = model.selection.contains(row.name)
        return FileThumbnailView(serverID: model.serverID, relative: model.relative(row.name), row: row, size: 56)
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(selected ? Color.primary.opacity(0.12) : .clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(focused ? Color.accentColor : .clear, lineWidth: 2)
            )
            .opacity(row.isHidden ? 0.55 : 1)
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { model.open(row.name) }
            .onTapGesture {
                isFocused = true
                model.click(row.name)
            }
            .contextMenu {
                FilesContextMenu(model: model, names: model.selection.contains(row.name) ? model.selection : [row.name])
            }
            .draggable(FileDrag.payload(row.name))
            .popover(isPresented: model.isShowingActivity(on: row.name), arrowEdge: .top) {
                if let activity = model.activity { FileActivityBubble(activity: activity) }
            }
            .fileInfoPopover(model, row: row, edge: .top)
            .help(row.name)
    }
}
