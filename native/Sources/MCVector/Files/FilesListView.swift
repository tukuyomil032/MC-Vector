// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// The list layout: a checkbox per row, then name, items, size, created and
/// modified. Columns can be hidden, reordered and resized from the header,
/// and the layout is remembered.
struct FilesListView: View {
    @Bindable var model: FilesModel
    @SceneStorage("files.columns") private var columns = TableColumnCustomization<FileRow>()
    @State private var isDropTargeted = false

    var body: some View {
        // No animation reaches the table: NSTableView re-measures rows while
        // SwiftUI animates and the window's constraint passes never settle.
        ZStack {
            table
            overlays
        }
    }

    private var locale: Locale { Locale(identifier: L10n.language) }

    private var table: some View {
        Table(
            of: FileRow.self, selection: $model.selection, sortOrder: $model.sortOrder,
            columnCustomization: $columns
        ) {
            TableColumn("") { row in
                Toggle(
                    L10n.t("native.files.select"),
                    isOn: Binding(get: { model.selection.contains(row.name) }, set: { _ in model.toggle(row.name) })
                )
                .toggleStyle(.checkbox)
                .labelsHidden()
            }
            .width(22)
            .customizationID("select")
            .disabledCustomizationBehavior(.all)

            TableColumn(L10n.t("native.files.name"), value: \.sortName) { row in
                FileNameCell(row: row, model: model)
            }
            .customizationID("name")
            .disabledCustomizationBehavior(.visibility)

            TableColumn(L10n.t("native.files.items"), value: \.sortChildCount) { row in
                Text(row.childCount.map { $0.formatted(.number.locale(locale)) } ?? "")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .width(min: 50, ideal: 60, max: 90)
            .customizationID("items")

            TableColumn(L10n.t("native.files.size"), value: \.size) { row in
                Text(sizeText(row))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            .width(min: 70, ideal: 90, max: 140)
            .customizationID("size")

            TableColumn(L10n.t("native.files.created"), value: \.sortCreated) { row in
                dateText(row.created)
            }
            .width(min: 130, ideal: 150, max: 220)
            .customizationID("created")

            TableColumn(L10n.t("native.files.modified"), value: \.modified) { row in
                dateText(row.modified)
            }
            .width(min: 130, ideal: 150, max: 220)
            .customizationID("modified")
        } rows: {
            // Drag and drop sit on the rows: per-cell drop targets observe their
            // window geometry and loop with the table's row measuring.
            ForEach(model.visibleRows) { row in
                TableRow(row)
                    .draggable(FileDrag.payload(row.name))
                    .dropDestination(for: String.self) { dragged in
                        guard row.isDirectory else { return }
                        Task { await model.drop(dragged.compactMap(FileDrag.name(from:)), onto: row.name) }
                    }
            }
        }
        .contextMenu(forSelectionType: String.self) { names in
            FilesContextMenu(model: model, names: names)
        } primaryAction: { names in
            if let name = names.first, names.count == 1 { model.open(name) }
        }
        .onKeyPress(.return) {
            guard model.selection.count == 1, let name = model.selection.first else { return .ignored }
            Task { await model.rename(name) }
            return .handled
        }
        .onDeleteCommand { Task { await model.trash(model.selection) } }
        // Finder drops import into the current folder.
        .dropDestination(for: URL.self) { urls, _ in
            let files = urls.filter(\.isFileURL)
            guard !files.isEmpty else { return false }
            Task { await model.importFiles(files) }
            return true
        } isTargeted: { targeted in
            isDropTargeted = targeted
        }
    }

    private func dateText(_ date: Date?) -> some View {
        Group {
            if let date {
                Text(date, format: .dateTime.year().month(.twoDigits).day(.twoDigits).hour().minute().locale(locale))
            } else {
                Text("")
            }
        }
        .foregroundStyle(.secondary)
        .monospacedDigit()
    }

    /// Empty folder, loading and drop highlight, drawn over the table without animation.
    @ViewBuilder
    private var overlays: some View {
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

    private func sizeText(_ row: FileRow) -> String {
        guard row.isDirectory else { return Self.bytes(row.size) }
        guard let size = model.folderSizes[model.relative(row.name)] else { return "…" }
        let text = Self.bytes(size.bytes)
        return size.complete ? text : "\(text)+"
    }

    /// File sizes in the app language (no animation: this is a Table).
    static func bytes(_ count: UInt64) -> String {
        Int64(count).formatted(.byteCount(style: .file).locale(Locale(identifier: L10n.language)))
    }
}

/// The icon and name, and the popover of an action running on this row.
private struct FileNameCell: View {
    let row: FileRow
    let model: FilesModel

    var body: some View {
        Label {
            Text(row.name)
                .lineLimit(1)
        } icon: {
            Image(systemName: row.isDirectory ? "folder.fill" : FileKind.symbol(for: row.name))
                .foregroundStyle(row.isDirectory ? Color.accentColor : .secondary)
        }
        .opacity(row.isHidden ? 0.55 : 1)
        // A fixed row height keeps size text updates from re-measuring rows.
        .frame(height: 20)
        .popover(isPresented: isShowingActivity, arrowEdge: .trailing) {
            if let activity = model.activity { FileActivityBubble(activity: activity) }
        }
    }

    private var isShowingActivity: Binding<Bool> {
        Binding(
            get: { model.activity?.anchor == .row(row.name) },
            set: { shown in
                if !shown, model.activity?.anchor == .row(row.name), model.activity?.state == .done {
                    model.activity = nil
                }
            }
        )
    }
}

/// The content of an action's popover: a spinner while it runs, a check when done.
struct FileActivityBubble: View {
    let activity: FileActivity

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                if activity.state == .running {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .frame(width: 16, height: 16)
            Text(activity.message)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: 320, alignment: .leading)
        .animation(Motion.snappy, value: activity.state)
    }
}
