// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// What the Files view can do to entries. Toolbar, menus and keys all call these.
extension FilesModel {
    // MARK: Activity popover

    private func begin(_ anchor: FileActivity.Anchor, _ message: String) -> UUID {
        let activity = FileActivity(anchor: anchor, message: message, state: .running)
        self.activity = activity
        return activity.id
    }

    /// Shows the result in the same popover, then closes it.
    private func finish(_ id: UUID, anchor: FileActivity.Anchor? = nil, _ message: String) {
        guard activity?.id == id else { return }
        activity?.state = .done
        activity?.message = message
        if let anchor { activity?.anchor = anchor }
        Task {
            try? await Task.sleep(for: .seconds(1.6))
            if self.activity?.id == id { self.activity = nil }
        }
    }

    private func fail(_ id: UUID, _ title: String, _ error: CoreError) {
        if activity?.id == id { activity = nil }
        feedback?.showError(title, message: error.uiText)
    }

    private func anchor(for names: [String]) -> FileActivity.Anchor {
        names.first.map(FileActivity.Anchor.row) ?? .folder
    }

    private func subject(_ names: [String]) -> String {
        names.count == 1
            ? L10n.t("native.files.quoted", ["name": names[0]])
            : L10n.t("native.files.itemCount", ["count": names.count])
    }

    /// Refreshes the list and selects `names` when the user is still in `folder`.
    private func select(_ names: Set<String>, in folder: [String]) async {
        guard folder == path else { return }
        await reload()
        if !names.isEmpty { selection = names }
    }

    // MARK: Create, rename, duplicate

    func create(isDirectory: Bool) async {
        guard let feedback else { return }
        guard
            let name = await feedback.prompt(
                title: L10n.t(isDirectory ? "native.files.newFolder" : "native.files.newFile"),
                label: L10n.t("files.modal.nameLabel"),
                placeholder: L10n.t(
                    isDirectory ? "files.modal.newFolderPlaceholder" : "files.modal.newFilePlaceholder"),
                confirmLabel: L10n.t("native.files.create")
            )
        else { return }
        let folder = path
        do throws(CoreError) {
            try await CoreClient.createFileEntry(
                serverID: serverID, parent: folder.joined(separator: "/"), name: name, isDirectory: isDirectory)
            await select([name], in: folder)
        } catch {
            feedback.showError(L10n.t("files.toast.createFailed"), message: error.uiText)
        }
    }

    func rename(_ name: String) async {
        guard let feedback else { return }
        guard
            let newName = await feedback.prompt(
                title: L10n.t("files.modal.renameTitle"),
                label: L10n.t("files.modal.renameLabel"),
                defaultValue: name,
                confirmLabel: L10n.t("files.modal.renameButton"),
                selectsBaseName: true
            ), newName != name
        else { return }
        let folder = path
        do throws(CoreError) {
            try await CoreClient.renameFileEntry(serverID: serverID, relative: relative(name), newName: newName)
            await select([newName], in: folder)
        } catch {
            feedback.showError(L10n.t("files.toast.renameFailed"), message: error.uiText)
        }
    }

    func duplicate(_ names: Set<String>) async {
        let sorted = names.sorted()
        guard !sorted.isEmpty, !isBusy else { return }
        let folder = path
        let id = begin(anchor(for: sorted), L10n.t("native.files.activity.duplicating", ["subject": subject(sorted)]))
        do throws(CoreError) {
            let created = try await CoreClient.duplicateFileEntries(
                serverID: serverID, parent: folder.joined(separator: "/"), names: sorted)
            await select(Set(created), in: folder)
            finish(
                id, anchor: created.first.map(FileActivity.Anchor.row),
                L10n.t("native.files.activity.created", ["subject": subject(created)]))
        } catch {
            fail(id, L10n.t("native.files.duplicateFailed"), error)
        }
    }

    // MARK: Move

    /// Opens the folder browser for these entries (names in the current folder).
    func requestMove(_ names: Set<String>) {
        guard !names.isEmpty else { return }
        moveRequest = MoveRequest(entries: names.sorted().map(relative), start: path)
    }

    /// The folder being viewed moves somewhere else; the view follows it.
    func requestMoveCurrentFolder() {
        guard !path.isEmpty else { return }
        moveRequest = MoveRequest(entries: [currentPath], start: Array(path.dropLast()))
    }

    /// Moves entries (relative to the server folder) into `target`.
    func move(_ entries: [String], to target: [String]) async {
        let destination = target.joined(separator: "/")
        let followsCurrentFolder = entries == [currentPath]
        do throws(CoreError) {
            try await CoreClient.moveFileEntries(serverID: serverID, entries: entries, destination: destination)
            if followsCurrentFolder, let name = path.last {
                navigate(to: target + [name])
            } else {
                selection = []
                await reload()
            }
        } catch {
            feedback?.showError(L10n.t("files.toast.moveFailed"), message: error.uiText)
            await reload()
        }
    }

    /// Rows dropped on a folder row move into it.
    func drop(_ names: [String], onto folder: String) async {
        let entries = names.filter { $0 != folder }.map(relative)
        guard !entries.isEmpty else { return }
        await move(entries, to: path + [folder])
    }

    // MARK: Trash

    /// Moves entries to the Mac's Trash; nothing is asked because the Trash can give them back.
    func trash(_ names: Set<String>) async {
        let sorted = names.sorted()
        guard !sorted.isEmpty, !isBusy, await confirmTrash(sorted) else { return }
        let id = begin(anchor(for: sorted), L10n.t("native.files.activity.trashing", ["subject": subject(sorted)]))
        var failure: Error?
        for name in sorted {
            do {
                let url = try CoreClient.fileEntryURL(serverID: serverID, relative: relative(name))
                try FileManager.default.trashItem(at: url, resultingItemURL: nil)
            } catch {
                failure = error
                break
            }
        }
        selection = []
        await reload()
        if let failure {
            if activity?.id == id { activity = nil }
            feedback?.showError(L10n.t("native.files.trashFailed"), message: failure.localizedDescription)
        } else {
            finish(id, anchor: .folder, L10n.t("native.files.activity.trashed", ["subject": subject(sorted)]))
        }
    }

    /// "Move “libraries” to the Trash?" — folders say their contents go too;
    /// several entries list up to five names.
    private func confirmTrash(_ names: [String]) async -> Bool {
        guard let feedback else { return false }
        let description: String?
        if names.count == 1 {
            let isFolder = items.first { $0.name == names[0] }?.isDirectory == true
            description = isFolder ? L10n.t("native.files.trashFolderNote") : nil
        } else {
            description = names.prefix(5).joined(separator: "\n") + (names.count > 5 ? "\n…" : "")
        }
        return await feedback.confirm(
            title: L10n.t("native.files.trashConfirm", ["subject": subject(names)]),
            description: description,
            confirmLabel: L10n.t("native.files.moveToTrash"),
            isDanger: true
        )
    }

    // MARK: Compress and extract

    /// Zips the entries next to them, named like Finder ("name.zip", "Archive.zip",
    /// numbered when taken), then selects the new archive.
    func compress(_ names: Set<String>) async {
        let sorted = names.sorted()
        guard !sorted.isEmpty, !isBusy else { return }
        let folder = path
        let id = begin(anchor(for: sorted), L10n.t("native.files.activity.compressing", ["subject": subject(sorted)]))
        do throws(CoreError) {
            let archive = try await CoreClient.compressFileEntries(
                serverID: serverID, parent: folder.joined(separator: "/"), names: sorted)
            await select([archive], in: folder)
            finish(id, anchor: .row(archive), L10n.t("native.files.activity.created", ["subject": archive]))
        } catch {
            fail(id, L10n.t("files.toast.compressFailed"), error)
        }
    }

    /// Extracts each archive into a new folder named after it; existing files
    /// are never replaced. Selects the new folders.
    func extract(_ names: Set<String>) async {
        let archives = names.sorted()
        guard !archives.isEmpty, archives.allSatisfy(FileKind.isZip), !isBusy else { return }
        let folder = path
        let id = begin(
            anchor(for: archives), L10n.t("native.files.activity.extracting", ["subject": subject(archives)]))
        var created: [String] = []
        do throws(CoreError) {
            for archive in archives {
                let relative = (folder + [archive]).joined(separator: "/")
                created.append(try await CoreClient.extractFileEntry(serverID: serverID, relative: relative))
            }
            await select(Set(created), in: folder)
            finish(
                id, anchor: created.first.map(FileActivity.Anchor.row),
                L10n.t("native.files.activity.extracted", ["subject": subject(created)]))
        } catch {
            await select(Set(created), in: folder)
            fail(id, L10n.t("files.toast.extractFailed"), error)
        }
    }

    // MARK: Import, Finder and the pasteboard

    func importWithPanel() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.prompt = L10n.t("files.modal.import")
        guard panel.runModal() == .OK, !panel.urls.isEmpty else { return }
        let urls = panel.urls
        Task { await importFiles(urls) }
    }

    func importFiles(_ urls: [URL]) async {
        let folder = path
        do throws(CoreError) {
            _ = try await CoreClient.importFileEntries(serverID: serverID, destination: currentPath, sources: urls)
            await select(Set(urls.map(\.lastPathComponent)), in: folder)
        } catch {
            feedback?.showError(L10n.t("files.toast.uploadFailed"), message: error.uiText)
            await reload()
        }
    }

    /// Opens a folder in Finder, or shows a file selected in its folder.
    func showInFinder(_ name: String? = nil) {
        guard let url = try? CoreClient.fileEntryURL(serverID: serverID, relative: name.map(relative) ?? currentPath)
        else { return }
        if name == nil {
            NSWorkspace.shared.open(url)
        } else {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        }
    }

    /// Copies the paths relative to the server folder, one per line.
    func copyPaths(_ names: Set<String>) {
        let paths = names.isEmpty ? [currentPath] : names.sorted().map(relative)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(paths.joined(separator: "\n"), forType: .string)
        let id = begin(names.count == 1 ? anchor(for: names.sorted()) : .folder, "")
        finish(id, L10n.t("native.files.activity.pathCopied"))
    }
}
