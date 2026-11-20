// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// Backups (UI-011, React BackupsView): the server's ZIP backups as cards or a
/// table (Settings › General › Display), with search, sort, create, restore,
/// tags, delete and Show in Finder. Create and restore show their progress.
struct BackupsView: View {
    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    @Environment(FeedbackCenter.self) private var feedback
    @AppStorage(BackupsLayout.storageKey) private var layout: BackupsLayout = .cards
    @State private var model: BackupsModel
    @State private var showsCreate = false
    @State private var editingTags: BackupItem?
    @State private var pendingRestore: BackupItem?
    @State private var pendingDelete: BackupItem?
    @State private var tableSelection: BackupItem.ID?

    #if DEBUG
        struct CaptureScript {
            let id: String
        }

        static var captureScript: CaptureScript?
    #endif

    init(serverID: String) {
        _model = State(initialValue: BackupsModel(serverID: serverID))
    }

    private var serverName: String {
        app.servers.first { $0.id == model.serverID }?.name ?? ""
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            if let activity = model.activity {
                ActivityBar(activity: activity)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .animation(Motion.standard, value: model.activity != nil)
        .task { await loadAndApplyCaptureState() }
        .onChange(of: app.backupsRevision[model.serverID]) { Task { await model.reload() } }
        .sheet(isPresented: $showsCreate) {
            CreateBackupSheet(model: model, serverName: serverName)
        }
        .sheet(item: $editingTags) { item in
            BackupTagsSheet(model: model, item: item)
        }
        .confirmationDialog(
            L10n.t("backups.restoreTitle"),
            isPresented: Binding(get: { pendingRestore != nil }, set: { if !$0 { pendingRestore = nil } }),
            presenting: pendingRestore
        ) { item in
            Button(L10n.t("backups.actions.restore"), role: .destructive) {
                Task { await model.restore(item, feedback: feedback) }
            }
            // Without an explicit button, macOS adds a Cancel in the system
            // language, not the app's.
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: { item in
            Text(L10n.t("backups.confirmRestore", ["name": item.name]))
        }
        .confirmationDialog(
            L10n.t("backups.deleteTitle"),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { item in
            Button(L10n.t("common.delete"), role: .destructive) {
                Task { await model.delete(item, feedback: feedback) }
            }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: { item in
            Text(L10n.t("backups.confirmDelete", ["name": item.name]))
        }
    }

    private func loadAndApplyCaptureState() async {
        #if DEBUG
            guard let requestedID = CaptureState.requestedID,
                let script = Self.captureScript, script.id == requestedID
            else {
                await model.reload()
                return
            }
            if script.id == "BACKUPS-loading" {
                try? await Task.sleep(for: .milliseconds(400))
                CaptureState.markViewReady(for: script.id)
                // Hold the first load in its initial state for the screenshot.
                try? await Task.sleep(for: .seconds(30))
                return
            }
        #endif

        await model.reload()

        #if DEBUG
            guard let requestedID = CaptureState.requestedID,
                let script = Self.captureScript, script.id == requestedID
            else { return }
            await applyCaptureScript(script)
        #endif
    }

    #if DEBUG
        private func applyCaptureScript(_ script: CaptureScript) async {
            switch script.id {
            case "BACKUPS-search":
                model.search = "night"
                await markCaptureReady(script.id)
            case "BACKUPS-sort-size":
                model.setSort(.size, ascending: false)
                await markCaptureReady(script.id)
            case "BACKUPS-create-sheet":
                showsCreate = true
            case "BACKUPS-create-stop-confirm":
                showsCreate = true
            case "BACKUPS-creating":
                model.captureProgressHold = .seconds(8)
                Task {
                    _ = await model.create(
                        name: "capture-in-progress.zip", compression: 5,
                        stopServer: false, feedback: feedback)
                }
                guard await waitForCapture({ model.activity != nil }) else {
                    CaptureState.note("[capture] create activity did not start")
                    return
                }
                await markCaptureReady(script.id)
            case "BACKUPS-restore-confirm":
                pendingRestore = model.items.first(where: { $0.name == "before-update.zip" }) ?? model.items.first
                await markCaptureReady(script.id)
            case "BACKUPS-restoring":
                guard let item = model.items.first(where: { $0.name == "before-update.zip" }) ?? model.items.first
                else {
                    CaptureState.note("[capture] no backup available for restore")
                    return
                }
                model.captureProgressHold = .seconds(8)
                Task { await model.restore(item, feedback: feedback) }
                guard await waitForCapture({ model.activity != nil }) else {
                    CaptureState.note("[capture] restore activity did not start")
                    return
                }
                await markCaptureReady(script.id)
            case "BACKUPS-tag-sheet":
                editingTags = model.items.first(where: { $0.name == "before-update.zip" }) ?? model.items.first
                await markCaptureReady(script.id)
            case "BACKUPS-delete-confirm":
                pendingDelete = model.items.first(where: { $0.name == "before-update.zip" }) ?? model.items.first
                await markCaptureReady(script.id)
            case "BACKUPS-context-menu":
                await CaptureState.rightClickFirstBackup(id: script.id)
            case "BACKUPS-toast-created":
                let name = "capture-created.zip"
                Task { _ = await model.create(name: name, compression: 5, stopServer: false, feedback: feedback) }
                guard await waitForCapture({ model.activity != nil }) else {
                    CaptureState.note("[capture] create activity did not start")
                    return
                }
                guard await waitForCapture({ !model.isBusy && model.items.contains(where: { $0.name == name }) }) else {
                    CaptureState.note("[capture] created backup did not enter the list")
                    return
                }
                await markCaptureReady(script.id)
            case "BACKUPS-auto":
                await CaptureState.runAutomaticBackupCapture(serverID: model.serverID, runtime: runtime)
                guard await waitForCapture({ model.items.contains(where: { $0.record.origin == "automatic" }) }) else {
                    CaptureState.note("[capture] automatic backup did not enter the list")
                    return
                }
                await markCaptureReady(script.id)
            default:
                await markCaptureReady(script.id)
            }
        }

        private func markCaptureReady(_ id: String) async {
            try? await Task.sleep(for: .milliseconds(450))
            CaptureState.markViewReady(for: id)
        }

        private func waitForCapture(_ predicate: () -> Bool) async -> Bool {
            for _ in 0..<150 {
                if predicate() { return true }
                try? await Task.sleep(for: .milliseconds(100))
            }
            return false
        }
    #endif

    // MARK: Header

    private var header: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField(L10n.t("native.backups.search"), text: $model.search)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .frame(maxWidth: 280)

            Menu {
                Picker(L10n.t("native.backups.sortBy"), selection: sortBinding) {
                    ForEach(BackupSort.allCases) { sort in
                        Text(L10n.t(sort.titleKey)).tag(sort)
                    }
                }
                .pickerStyle(.inline)
                Divider()
                Picker(L10n.t("native.backups.order"), selection: ascendingBinding) {
                    Text(L10n.t("native.backups.ascending")).tag(true)
                    Text(L10n.t("native.backups.descending")).tag(false)
                }
                .pickerStyle(.inline)
            } label: {
                Label(L10n.t(model.sort.titleKey), systemImage: "arrow.up.arrow.down")
            }
            .fixedSize()

            Spacer()

            Text(
                L10n.t(
                    model.items.count == 1 ? "native.backups.countOne" : "native.backups.count",
                    ["count": model.items.count])
            )
            .foregroundStyle(.secondary)
            .monospacedDigit()
            .contentTransition(.numericText(value: Double(model.items.count)))
            .animation(Motion.value, value: model.items.count)

            Button {
                showsCreate = true
            } label: {
                if model.isBusy {
                    Label(L10n.t("backups.processing"), systemImage: "hourglass")
                } else {
                    // React's text starts with "+ "; the symbol stands in for it.
                    Label(Self.createTitle, systemImage: "plus")
                }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut("n", modifiers: .command)
            .disabled(model.isBusy || model.load != .loaded)
        }
        .controlSize(.large)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private static var createTitle: String {
        let text = L10n.t("backups.createButton")
        return text.hasPrefix("+ ") ? String(text.dropFirst(2)) : text
    }

    private var sortBinding: Binding<BackupSort> {
        Binding(get: { model.sort }, set: { model.setSort($0, ascending: model.ascending) })
    }

    private var ascendingBinding: Binding<Bool> {
        Binding(get: { model.ascending }, set: { model.setSort(model.sort, ascending: $0) })
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch model.load {
        case .loading:
            ProgressView().transition(.motionFade)
        case .failed(let error):
            ContentUnavailableView {
                Label(L10n.t("backups.catalogUnavailable"), systemImage: "exclamationmark.triangle")
            } description: {
                Text("\(L10n.t("backups.catalogUnavailableDescription"))\n\(error.uiText)")
            } actions: {
                Button(L10n.t("backups.catalogRetry")) { Task { await model.reload() } }
            }
            .transition(.motionFade)
        case .loaded:
            let items = model.visible
            if model.items.isEmpty {
                ContentUnavailableView(L10n.t("backups.empty"), systemImage: "archivebox")
                    .transition(.motionFade)
            } else if items.isEmpty {
                ContentUnavailableView.search(text: model.search)
                    .transition(.motionFade)
            } else {
                Group {
                    switch layout {
                    case .cards: cards(items)
                    case .table: table(items)
                    }
                }
                // A table may only fade (native-rich-animations).
                .id(layout)
                .transition(.motionFade)
            }
        }
    }

    private func cards(_ items: [BackupItem]) -> some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(items) { item in
                    BackupCard(
                        item: item, isProcessing: model.activity?.name == item.name, isBusy: model.isBusy,
                        actions: actions(for: item)
                    )
                    .transition(.motionFade.combined(with: .move(edge: .top)))
                }
            }
            .padding(20)
        }
    }

    private func table(_ items: [BackupItem]) -> some View {
        Table(items, selection: $tableSelection, sortOrder: $model.sortOrder) {
            TableColumn(L10n.t("native.backups.column.name"), value: \.name) { item in
                Label(item.name, systemImage: "doc.zipper")
            }
            TableColumn(L10n.t("native.backups.column.date"), value: \.sortDate) { item in
                Text(item.date.map(BackupItem.display) ?? item.record.createdAt)
            }
            .width(min: 140, ideal: 170)
            TableColumn(L10n.t("native.backups.column.size"), value: \.size) { item in
                Text(ByteCountFormatter.string(fromByteCount: Int64(item.size), countStyle: .file))
                    .monospacedDigit()
            }
            .width(min: 70, ideal: 90)
            TableColumn(L10n.t("native.backups.column.tags"), value: \.tagText) { item in
                Text(item.tagText).foregroundStyle(.secondary)
            }
        }
        .contextMenu(forSelectionType: BackupItem.ID.self) { ids in
            if let id = ids.first, let item = model.items.first(where: { $0.id == id }) {
                BackupMenu(actions: actions(for: item), isBusy: model.isBusy)
            }
        } primaryAction: { ids in
            if let id = ids.first, let item = model.items.first(where: { $0.id == id }) {
                editingTags = item
            }
        }
    }

    private func actions(for item: BackupItem) -> BackupActions {
        BackupActions(
            restore: { pendingRestore = item },
            tags: { editingTags = item },
            delete: { pendingDelete = item },
            reveal: { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: item.record.archivePath)]) }
        )
    }
}

/// What a backup's buttons and menu do.
struct BackupActions {
    let restore: () -> Void
    let tags: () -> Void
    let delete: () -> Void
    let reveal: () -> Void
}

/// The right-click menu, shared by cards and the table.
struct BackupMenu: View {
    let actions: BackupActions
    let isBusy: Bool

    var body: some View {
        Button(L10n.t("backups.actions.restore"), systemImage: "arrow.counterclockwise", action: actions.restore)
            .disabled(isBusy)
        Button(L10n.t("backups.actions.tag"), systemImage: "tag", action: actions.tags)
        Button(L10n.t("native.serverSettings.showInFinder"), systemImage: "folder", action: actions.reveal)
        Divider()
        Button(L10n.t("common.delete"), systemImage: "trash", role: .destructive, action: actions.delete)
            .disabled(isBusy)
    }
}

/// One backup as a card: icon, name, date and size, tags, note and actions.
private struct BackupCard: View {
    let item: BackupItem
    let isProcessing: Bool
    let isBusy: Bool
    let actions: BackupActions

    @State private var isHovered = false

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "doc.zipper")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 36, height: 36)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .symbolEffect(.pulse, isActive: isProcessing)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                    .truncationMode(.middle)
                HStack(spacing: 6) {
                    Text(item.date.map(BackupItem.display) ?? item.record.createdAt)
                    Text("·")
                    Text(ByteCountFormatter.string(fromByteCount: Int64(item.size), countStyle: .file))
                        .monospacedDigit()
                        .contentTransition(.numericText(value: Double(item.size)))
                }
                .font(.callout)
                .foregroundStyle(.secondary)
                if !item.tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(item.tags, id: \.self) { tag in
                            TagChip(text: tag)
                        }
                    }
                }
                if !item.note.isEmpty {
                    Text(item.note)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 12)
            HStack(spacing: 6) {
                Button(L10n.t("backups.actions.restore"), action: actions.restore)
                    .disabled(isBusy)
                Button(L10n.t("backups.actions.tag"), action: actions.tags)
                Button(role: .destructive, action: actions.delete) {
                    Image(systemName: "trash")
                }
                .help(L10n.t("common.delete"))
                .disabled(isBusy)
            }
            .controlSize(.regular)
            .opacity(isHovered || isProcessing ? 1 : 0.75)
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isProcessing ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.separator), lineWidth: 1)
        }
        .contentShape(Rectangle())
        .onHover { hovering in withAnimation(Motion.snappy) { isHovered = hovering } }
        .contextMenu { BackupMenu(actions: actions, isBusy: isBusy) }
    }
}

/// A small tag capsule.
struct TagChip: View {
    let text: String
    var onRemove: (() -> Void)?

    var body: some View {
        HStack(spacing: 4) {
            Text(text)
            if let onRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                }
                .buttonStyle(.plain)
            }
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
        .background(Color.accentColor.opacity(0.15), in: Capsule())
        .foregroundStyle(Color.accentColor)
    }
}

/// "Creating …" / "Restoring …" with a bar and a rolling percentage.
private struct ActivityBar: View {
    let activity: BackupsModel.Activity

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(
                    activity.kind == .restore
                        ? L10n.t("backups.restoring", ["name": activity.name])
                        : L10n.t("native.backups.creating")
                )
                .font(.callout.weight(.medium))
                Spacer()
                Text("\(Int((activity.progress * 100).rounded()))%")
                    .font(.callout.monospacedDigit())
                    .contentTransition(.numericText(value: activity.progress))
                    .animation(Motion.value, value: activity.progress)
            }
            ProgressView(value: activity.progress)
                .animation(Motion.value, value: activity.progress)
            if !activity.currentFile.isEmpty {
                Text(activity.currentFile)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }
}
