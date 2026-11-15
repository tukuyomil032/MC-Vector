// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// The Files view (React FilesView): a path bar with folder and file tools,
/// and a sortable table of the current folder with multi-selection, a context
/// menu, Finder drops (import) and drags between folders (move).
struct FilesView: View {
    let serverID: String
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback

    /// Folders below the server folder, e.g. ["plugins", "Essentials"].
    @State private var path: [String] = []
    @State private var items: [FileRow] = []
    @State private var selection: Set<String> = []
    @State private var sortOrder = [KeyPathComparator(\FileRow.sortName)]
    @State private var isLoading = false
    @State private var folderSizes: [String: FolderSize] = [:]
    @State private var isDropTargeted = false
    @State private var openedFile: OpenedFile?
    /// A file to open once the folder is listed (capture presets).
    @State private var pendingOpen: String?

    private var currentPath: String { path.joined(separator: "/") }
    private var server: ServerProfile? { app.servers.first { $0.id == serverID } }

    var body: some View {
        ZStack {
            if let openedFile {
                FileEditorView(
                    serverID: serverID, file: openedFile, software: server?.software, version: server?.version
                ) {
                    withAnimation(Motion.standard) { self.openedFile = nil }
                    Task { await reload() }
                }
                // Fade only: moving the AppKit text view each frame makes the
                // window's constraint passes loop, like the table.
                .transition(.motionFade)
            } else {
                // The table only fades: moving it re-enters NSTableView's row measuring.
                browser
                    .transition(.motionFade)
            }
        }
        .animation(Motion.standard, value: openedFile)
        .task(id: currentPath) { await reload() }
        #if DEBUG
            .onAppear { applyCapturePreset() }
        #endif
    }

    // MARK: Browser

    private var browser: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            // No animation reaches the table: NSTableView re-measures rows while
            // SwiftUI animates and the window's constraint passes never settle.
            ZStack {
                table
                tableOverlays
            }
        }
    }

    private var toolbar: some View {
        HStack(spacing: 8) {
            Button {
                goUp()
            } label: {
                Label(L10n.t("files.toolbar.goUp"), systemImage: "chevron.up")
            }
            .labelStyle(.iconOnly)
            .help(L10n.t("files.toolbar.goUp"))
            .disabled(path.isEmpty)

            breadcrumb

            Spacer(minLength: 8)

            if !selection.isEmpty {
                HStack(spacing: 6) {
                    Button(L10n.t("files.toolbar.move"), systemImage: "folder.badge.arrow.forward") {
                        Task { await moveSelection() }
                    }
                    Button(L10n.t("files.toolbar.compress"), systemImage: "doc.zipper") {}
                        .disabled(true)
                        .help(L10n.t("native.files.archiveLater"))
                    Button(L10n.t("files.toolbar.extract"), systemImage: "arrow.up.bin") {}
                        .disabled(true)
                        .help(L10n.t("native.files.archiveLater"))
                    Button(L10n.t("files.toolbar.delete"), systemImage: "trash", role: .destructive) {
                        Task { await delete(names: selection) }
                    }
                }
                .labelStyle(.iconOnly)
                .transition(.motionFade)
            }

            Menu {
                Button(L10n.t("files.modal.folder"), systemImage: "folder.badge.plus") {
                    Task { await create(isDirectory: true) }
                }
                Button(L10n.t("files.modal.file"), systemImage: "doc.badge.plus") {
                    Task { await create(isDirectory: false) }
                }
            } label: {
                Label(L10n.t("files.toolbar.createImport"), systemImage: "plus")
            }
            .fixedSize()
            Button(L10n.t("files.modal.import"), systemImage: "square.and.arrow.down") {
                importWithPanel()
            }
            Button(L10n.t("native.files.openInFinder"), systemImage: "folder") {
                showInFinder(relative: currentPath)
            }
            .labelStyle(.iconOnly)
            .help(L10n.t("native.files.openInFinder"))
        }
        .controlSize(.regular)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .animation(Motion.snappy, value: selection.isEmpty)
    }

    /// Server name first (React's "Servers" crumb could not be listed), then each folder.
    private var breadcrumb: some View {
        HStack(spacing: 2) {
            crumb(server?.name ?? L10n.t("native.files.servers"), depth: 0)
            ForEach(Array(path.enumerated()), id: \.offset) { index, name in
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                crumb(name, depth: index + 1)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.t("files.breadcrumb.label"))
    }

    private func crumb(_ title: String, depth: Int) -> some View {
        Button(title) {
            navigate(to: Array(path.prefix(depth)))
        }
        .buttonStyle(.borderless)
        .fontWeight(depth == path.count ? .semibold : .regular)
        .foregroundStyle(depth == path.count ? .primary : .secondary)
        .lineLimit(1)
    }

    // MARK: Table

    private var sortedItems: [FileRow] {
        // Folders stay first, like React and Finder's "Keep folders on top".
        let sorted = items.sorted(using: sortOrder)
        return sorted.filter(\.isDirectory) + sorted.filter { !$0.isDirectory }
    }

    private var table: some View {
        Table(of: FileRow.self, selection: $selection, sortOrder: $sortOrder) {
            TableColumn(L10n.t("native.files.name"), value: \.sortName) { row in
                nameCell(row)
            }
            TableColumn(L10n.t("native.files.size"), value: \.size) { row in
                Text(sizeText(row))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
            .width(min: 70, ideal: 90, max: 140)
            TableColumn(L10n.t("native.files.modified"), value: \.modified) { row in
                Text(row.modified, format: .dateTime.year().month(.twoDigits).day(.twoDigits).hour().minute())
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .width(min: 130, ideal: 160, max: 220)
        } rows: {
            // Drag and drop sit on the rows: per-cell drop targets observe their
            // window geometry and loop with the table's row measuring.
            ForEach(sortedItems) { row in
                TableRow(row)
                    .draggable(FileDrag.payload(row.name))
                    .dropDestination(for: String.self) { dragged in
                        guard row.isDirectory else { return }
                        let names = dragged.compactMap(FileDrag.name(from:)).filter { $0 != row.name }
                        guard !names.isEmpty else { return }
                        Task { await move(names: Set(names), to: path + [row.name]) }
                    }
            }
        }
        .contextMenu(forSelectionType: String.self) { names in
            contextMenu(for: names)
        } primaryAction: { names in
            if let name = names.first, names.count == 1 { open(name) }
        }
        .onDeleteCommand {
            Task { await delete(names: selection) }
        }
        // Finder drops import into the current folder (React opened a picker instead).
        .dropDestination(for: URL.self) { urls, _ in
            let files = urls.filter(\.isFileURL)
            guard !files.isEmpty else { return false }
            Task { await importFiles(files) }
            return true
        } isTargeted: { targeted in
            isDropTargeted = targeted
        }
    }

    /// Empty folder, loading and drop highlight, drawn over the table without animation.
    @ViewBuilder
    private var tableOverlays: some View {
        if isLoading && items.isEmpty {
            ProgressView(L10n.t("files.loading"))
        } else if items.isEmpty && !isLoading {
            ContentUnavailableView(L10n.t("files.emptyFolder"), systemImage: "folder")
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

    private func nameCell(_ row: FileRow) -> some View {
        Label {
            Text(row.name)
                .lineLimit(1)
        } icon: {
            Image(systemName: row.isDirectory ? "folder.fill" : FileKind.symbol(for: row.name))
                .foregroundStyle(row.isDirectory ? Color.accentColor : .secondary)
        }
        // A fixed row height keeps size text updates from re-measuring rows.
        .frame(height: 20)
    }

    @ViewBuilder
    private func contextMenu(for names: Set<String>) -> some View {
        if names.isEmpty {
            // The empty area (React: New / Create, Import, Move).
            Menu(L10n.t("files.contextMenu.newCreate")) {
                Button(L10n.t("files.modal.folder")) { Task { await create(isDirectory: true) } }
                Button(L10n.t("files.modal.file")) { Task { await create(isDirectory: false) } }
            }
            Button(L10n.t("files.contextMenu.import")) { importWithPanel() }
            Button(L10n.t("files.contextMenu.move")) { Task { await moveCurrentFolder() } }
                .disabled(path.isEmpty)
        } else {
            // Rename acts on one row; the others on the whole selection (React order).
            if names.count == 1, let name = names.first {
                Button(L10n.t("files.contextMenu.rename")) { Task { await rename(name) } }
            }
            Button(L10n.t("files.contextMenu.moveItem")) { Task { await move(names: names) } }
            Button(L10n.t("files.contextMenu.compressItem")) {}
                .disabled(true)
            Button(L10n.t("files.contextMenu.extractItem")) {}
                .disabled(true)
            Divider()
            Button(L10n.t("files.contextMenu.deleteItem"), role: .destructive) {
                Task { await delete(names: names) }
            }
        }
    }

    private func sizeText(_ row: FileRow) -> String {
        guard row.isDirectory else { return Self.byteFormatter.string(fromByteCount: Int64(row.size)) }
        guard let size = folderSizes[relative(row.name)] else { return "…" }
        let text = Self.byteFormatter.string(fromByteCount: Int64(size.bytes))
        return size.complete ? text : "\(text)+"
    }

    private static let byteFormatter: ByteCountFormatter = {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter
    }()

}

// Navigation and actions live in an extension so the view body stays short.
extension FilesView {
    // MARK: Navigation

    private func relative(_ name: String) -> String {
        (path + [name]).joined(separator: "/")
    }

    private func navigate(to newPath: [String]) {
        guard newPath != path else { return }
        selection = []
        path = newPath
    }

    private func goUp() {
        guard !path.isEmpty else { return }
        navigate(to: Array(path.dropLast()))
    }

    private func open(_ name: String) {
        guard let row = items.first(where: { $0.name == name }) else { return }
        if row.isDirectory {
            navigate(to: path + [name])
        } else {
            openedFile = OpenedFile(relative: relative(name), name: name, size: row.size)
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do throws(CoreError) {
            let listed = try await CoreClient.listFiles(serverID: serverID, relative: currentPath)
            let rows = listed.map(FileRow.init)
            items = rows
            // Trim the selection on the next turn, not inside the table's update.
            let names = Set(rows.map(\.name))
            Task { @MainActor in selection = selection.filter(names.contains) }
            if let name = pendingOpen, rows.contains(where: { $0.name == name }) {
                pendingOpen = nil
                open(name)
            }
        } catch {
            items = []
            feedback.toast(.error, L10n.t("files.toast.loadFailed"))
            return
        }
        await measureFolders()
    }

    /// Folder sizes arrive after the list (each walk takes up to 3 seconds).
    private func measureFolders() async {
        for row in items where row.isDirectory {
            let key = relative(row.name)
            if let size = try? await CoreClient.folderSize(serverID: serverID, relative: key) {
                folderSizes[key] = size
            }
        }
    }

    // MARK: Actions

    private func create(isDirectory: Bool) async {
        guard
            let name = await feedback.prompt(
                title: L10n.t("files.modal.createImportTitle"),
                label: L10n.t("files.modal.nameLabel"),
                placeholder: L10n.t(isDirectory ? "files.modal.newFolderPlaceholder" : "files.modal.newFilePlaceholder")
            )
        else { return }
        do throws(CoreError) {
            try await CoreClient.createFileEntry(
                serverID: serverID, parent: currentPath, name: name, isDirectory: isDirectory)
            feedback.toast(.success, L10n.t("files.toast.created"))
        } catch {
            feedback.showError(L10n.t("files.toast.createFailed"), message: error.uiText)
        }
        await reload()
    }

    private func rename(_ name: String) async {
        guard
            let newName = await feedback.prompt(
                title: L10n.t("files.modal.renameTitle"),
                label: L10n.t("files.modal.renameLabel"),
                defaultValue: name,
                confirmLabel: L10n.t("files.modal.renameButton")
            ), newName != name
        else { return }
        do throws(CoreError) {
            try await CoreClient.renameFileEntry(serverID: serverID, relative: relative(name), newName: newName)
            feedback.toast(.success, L10n.t("files.toast.renamed"))
        } catch {
            feedback.showError(L10n.t("files.toast.renameFailed"), message: error.uiText)
        }
        await reload()
    }

    private func moveSelection() async {
        await move(names: selection)
    }

    /// Asks for a destination folder relative to the server folder.
    private func move(names: Set<String>) async {
        guard
            let destination = await feedback.prompt(
                title: L10n.t("files.modal.moveTitle"),
                description: L10n.t("files.modal.moveDescription", ["count": names.count]),
                label: L10n.t("files.modal.moveDestLabel"),
                defaultValue: currentPath,
                placeholder: L10n.t("files.modal.moveDestPlaceholder"),
                confirmLabel: L10n.t("files.modal.moveButton")
            )
        else { return }
        let target = destination.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        await move(names: names, to: target)
    }

    private func move(names: Set<String>, to target: [String]) async {
        guard target != path else { return }
        if names.contains(where: { target.starts(with: path + [$0]) }) {
            feedback.showError(L10n.t("files.toast.moveFailed"), message: L10n.t("files.modal.moveIntoItself"))
            return
        }
        do throws(CoreError) {
            try await CoreClient.moveFileEntries(
                serverID: serverID,
                entries: names.sorted().map(relative),
                destination: target.joined(separator: "/")
            )
            feedback.toast(.success, L10n.t("files.toast.moved"))
        } catch {
            feedback.showError(L10n.t("files.toast.moveFailed"), message: error.uiText)
        }
        selection = []
        await reload()
    }

    /// React "Move Directory": moves the folder being viewed, then follows it.
    private func moveCurrentFolder() async {
        guard let name = path.last else { return }
        guard
            let destination = await feedback.prompt(
                title: L10n.t("files.modal.moveDirectoryTitle"),
                description: L10n.t("files.modal.moveDirectoryDescription"),
                label: L10n.t("files.modal.moveDestLabel"),
                defaultValue: path.dropLast().joined(separator: "/"),
                confirmLabel: L10n.t("files.modal.moveButton")
            )
        else { return }
        let target = destination.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        do throws(CoreError) {
            try await CoreClient.moveFileEntries(
                serverID: serverID,
                entries: [currentPath],
                destination: target.joined(separator: "/")
            )
            feedback.toast(.success, L10n.t("files.toast.moved"))
            navigate(to: target + [name])
        } catch {
            feedback.showError(L10n.t("files.toast.moveFailed"), message: error.uiText)
        }
    }

    private func delete(names: Set<String>) async {
        guard !names.isEmpty else { return }
        let listed = names.sorted().prefix(5).joined(separator: "\n")
        let more = names.count > 5 ? "\n…" : ""
        guard
            await feedback.confirm(
                title: L10n.t("files.confirm.deleteTitle"),
                description: L10n.t("files.confirm.delete", ["count": names.count]) + "\n\n" + listed + more,
                confirmLabel: L10n.t("files.toolbar.delete"),
                isDanger: true
            )
        else { return }
        do throws(CoreError) {
            try await CoreClient.deleteFileEntries(serverID: serverID, entries: names.sorted().map(relative))
            feedback.toast(.success, L10n.t("files.toast.deleted"))
        } catch {
            feedback.showError(L10n.t("files.toast.deleteFailed"), message: error.uiText)
        }
        // Partial deletes still refresh the list and clear the selection (unlike React).
        selection = []
        await reload()
    }

    private func importWithPanel() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.prompt = L10n.t("files.modal.import")
        guard panel.runModal() == .OK, !panel.urls.isEmpty else { return }
        let urls = panel.urls
        Task { await importFiles(urls) }
    }

    private func importFiles(_ urls: [URL]) async {
        do throws(CoreError) {
            let count = try await CoreClient.importFileEntries(
                serverID: serverID, destination: currentPath, sources: urls)
            feedback.toast(.success, L10n.t("files.toast.uploadSuccess", ["count": count]))
        } catch {
            feedback.showError(L10n.t("files.toast.uploadFailed"), message: error.uiText)
        }
        await reload()
    }

    /// Opens the folder itself in Finder (React revealed it inside its parent).
    private func showInFinder(relative: String) {
        guard let url = try? CoreClient.fileEntryURL(serverID: serverID, relative: relative) else { return }
        NSWorkspace.shared.open(url)
    }

    #if DEBUG
        /// Capture tooling: opens a folder, selects rows or opens a file.
        struct CapturePreset {
            var path: [String] = []
            var selection: Set<String> = []
            /// A file name inside `path` to open in the editor.
            var openFile: String?
        }

        static var capturePreset: CapturePreset?

        private func applyCapturePreset() {
            guard let preset = Self.capturePreset else { return }
            Self.capturePreset = nil
            path = preset.path
            pendingOpen = preset.openFile
            Task {
                try? await Task.sleep(for: .milliseconds(400))
                selection = preset.selection
            }
        }
    #endif
}

/// One table row.
struct FileRow: Identifiable, Hashable {
    let name: String
    let isDirectory: Bool
    let size: UInt64
    let modified: Date

    var id: String { name }
    var sortName: String { name.lowercased() }

    init(_ item: FileItem) {
        name = item.name
        isDirectory = item.isDirectory
        size = item.size
        modified = Date(timeIntervalSince1970: TimeInterval(item.modified))
    }
}

/// Rows dragged onto a folder row travel as marked strings, so text dropped
/// from other apps is never mistaken for a file.
enum FileDrag {
    private static let prefix = "mcvector-file-entry:"

    static func payload(_ name: String) -> String { prefix + name }

    static func name(from payload: String) -> String? {
        payload.hasPrefix(prefix) ? String(payload.dropFirst(prefix.count)) : nil
    }
}

/// What a file name says about its contents.
enum FileKind {
    /// The extensions the editor refuses without reading (FILE-001, React's list).
    /// Other non-text files, such as .nbt or .dat, are refused when they turn out
    /// not to be UTF-8.
    static let binaryExtensions: Set<String> = [
        "jar", "zip", "png", "jpg", "jpeg", "gif", "ico", "exe", "dll", "class",
    ]

    static func isBinary(_ name: String) -> Bool {
        binaryExtensions.contains((name as NSString).pathExtension.lowercased())
    }

    static func symbol(for name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "jar", "zip", "gz": "doc.zipper"
        case "png", "jpg", "jpeg", "gif", "ico": "photo"
        case "log": "doc.text.magnifyingglass"
        case "json", "yml", "yaml", "toml", "properties", "conf", "cfg", "xml": "doc.badge.gearshape"
        case "sh", "bat", "command": "terminal"
        case "nbt", "dat", "mca": "doc"
        default: isBinary(name) ? "doc" : "doc.text"
        }
    }
}
