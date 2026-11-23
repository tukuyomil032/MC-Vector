// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import SwiftUI

/// The icon view: thumbnails or icons with names below, in sections when the
/// folder is grouped. Click, ⌘-click, ⇧-click, drag a rectangle, arrow keys
/// and double-click work as in Finder.
struct FilesIconGridView: View {
    @Bindable var model: FilesModel
    @State private var frames: [String: CGRect] = [:]
    @State private var band: CGRect?
    @State private var bandBase: Set<String> = []
    @State private var viewport = CGSize.zero
    @State private var isDropTargeted = false
    @FocusState private var isFocused: Bool

    private static let space = "FilesIconGrid"
    private var tileWidth: CGFloat { model.iconSize + 44 }
    private var columnCount: Int { max(1, Int((viewport.width - 32 + 12) / (tileWidth + 12))) }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                grid
                    .padding(16)
                    .frame(maxWidth: .infinity, minHeight: viewport.height, alignment: .topLeading)
                    // Empty space: a click clears the selection, a drag draws a band.
                    .background {
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture {
                                isFocused = true
                                model.selection = []
                            }
                            .gesture(bandGesture)
                    }
                    .overlay(alignment: .topLeading) { bandOverlay }
                    .coordinateSpace(.named(Self.space))
            }
            .onGeometryChange(for: CGSize.self) {
                $0.size
            } action: {
                viewport = $0
            }
            FilesStateOverlay(model: model, isDropTargeted: isDropTargeted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            sizeSlider
        }
        .focusable()
        .focused($isFocused)
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { move(-1) }
        .onKeyPress(.rightArrow) { move(1) }
        .onKeyPress(.upArrow) { move(-columnCount) }
        .onKeyPress(.downArrow) { move(columnCount) }
        .onKeyPress(.return) {
            guard model.selection.count == 1, let name = model.selection.first else { return .ignored }
            Task { await model.rename(name) }
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

    // MARK: Grid

    private var grid: some View {
        LazyVStack(alignment: .leading, spacing: 18) {
            ForEach(model.sections) { section in
                if !section.title.isEmpty {
                    Text(section.title)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.fixed(tileWidth), spacing: 12, alignment: .top), count: columnCount),
                    alignment: .leading, spacing: 14
                ) {
                    ForEach(section.rows) { row in tile(row) }
                }
            }
        }
        .animation(Motion.standard, value: model.grouping)
    }

    private func tile(_ row: FileRow) -> some View {
        let selected = model.selection.contains(row.name)
        return VStack(spacing: 6) {
            FileThumbnailView(
                serverID: model.serverID, relative: model.relative(row.name), row: row, size: model.iconSize
            )
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(selected ? Color.primary.opacity(0.12) : .clear))
            Text(row.name)
                .font(.callout)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .truncationMode(.middle)
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .foregroundStyle(selected ? Color.white : .primary)
                .background(
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(selected ? Color.accentColor : .clear))
        }
        .frame(width: tileWidth)
        .opacity(row.isHidden ? 0.55 : 1)
        .contentShape(Rectangle())
        .onGeometryChange(for: CGRect.self) {
            $0.frame(in: .named(Self.space))
        } action: {
            frames[row.name] = $0
        }
        .onTapGesture(count: 2) { model.open(row.name) }
        .onTapGesture {
            isFocused = true
            model.click(row.name)
        }
        .contextMenu {
            FilesContextMenu(model: model, names: model.selection.contains(row.name) ? model.selection : [row.name])
        }
        .draggable(FileDrag.payload(row.name))
        .dropDestination(for: String.self) { dragged, _ in
            guard row.isDirectory else { return false }
            Task { await model.drop(dragged.compactMap(FileDrag.name(from:)), onto: row.name) }
            return true
        }
        .popover(isPresented: model.isShowingActivity(on: row.name), arrowEdge: .bottom) {
            if let activity = model.activity { FileActivityBubble(activity: activity) }
        }
        .fileInfoPopover(model, row: row, edge: .bottom)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
    }

    private func move(_ offset: Int) -> KeyPress.Result {
        model.moveSelection(by: offset)
        return .handled
    }

    // MARK: Rubber band

    private var bandGesture: some Gesture {
        DragGesture(minimumDistance: 4, coordinateSpace: .named(Self.space))
            .onChanged { drag in
                if band == nil {
                    let modifiers = NSEvent.modifierFlags
                    bandBase = modifiers.contains(.command) || modifiers.contains(.shift) ? model.selection : []
                }
                let rect = CGRect(
                    x: min(drag.startLocation.x, drag.location.x), y: min(drag.startLocation.y, drag.location.y),
                    width: abs(drag.location.x - drag.startLocation.x),
                    height: abs(drag.location.y - drag.startLocation.y))
                band = rect
                let inside = frames.filter { $0.value.intersects(rect) }.map(\.key)
                let visible = Set(model.visibleRows.map(\.name))
                model.selection = bandBase.union(inside.filter(visible.contains))
            }
            .onEnded { _ in
                band = nil
                isFocused = true
            }
    }

    @ViewBuilder
    private var bandOverlay: some View {
        if let band {
            Rectangle()
                .fill(Color.accentColor.opacity(0.12))
                .overlay(Rectangle().strokeBorder(Color.accentColor.opacity(0.7), lineWidth: 1))
                .frame(width: band.width, height: band.height)
                .offset(x: band.minX, y: band.minY)
                .allowsHitTesting(false)
        }
    }

    // MARK: Size

    private var sizeSlider: some View {
        HStack(spacing: 8) {
            Image(systemName: "square.grid.3x3").font(.caption)
            Slider(value: $model.iconSize, in: 32...128, step: 8)
                .frame(width: 120)
                .controlSize(.small)
            Image(systemName: "square.grid.2x2").font(.callout)
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .glassSurface(Capsule())
        .padding(12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(L10n.t("native.files.iconSize"))
        .help(L10n.t("native.files.iconSize"))
    }
}
