// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore
import Observation
import SwiftUI

/// The Files view's state for one server: the folder, its rows, the selection,
/// history, filter and the running action. The window toolbar and the view
/// share it, so it lives in AppState rather than in the view.
@MainActor
@Observable
final class FilesModel {
    let serverID: String
    /// Set by the view; actions report errors and confirmations through it.
    var feedback: FeedbackCenter?

    // MARK: Folder

    /// Folders below the server folder, e.g. ["plugins", "Essentials"].
    private(set) var path: [String] = []
    private(set) var items: [FileRow] = []
    private(set) var isLoading = false
    private(set) var folderSizes: [String: FolderSize] = [:]
    var selection: Set<String> = []
    var sortOrder = [KeyPathComparator(\FileRow.sortName)]

    // MARK: History, filter, hidden files, favorites

    private(set) var backStack: [[String]] = []
    private(set) var forwardStack: [[String]] = []
    var filter = ""
    var isFiltering = false
    var showsHidden: Bool {
        didSet { UserDefaults.standard.set(showsHidden, forKey: Self.hiddenKey) }
    }
    /// Relative folder paths ("" is the server folder), in the order added.
    private(set) var favorites: [String]

    // MARK: Editor, sheets and the running action

    var openedFile: OpenedFile?
    /// A file to open once the folder is listed (capture presets).
    var pendingOpen: String?
    /// The ＋ popover in the toolbar.
    var isShowingNew = false
    /// Entries waiting for a destination in the move sheet.
    var moveRequest: MoveRequest?
    /// The action in progress or just finished, shown as a popover.
    var activity: FileActivity?
    var isBusy: Bool { activity?.state == .running }

    private var sizeTask: Task<Void, Never>?

    static let hiddenKey = "files.showHidden"
    private var favoritesKey: String { "files.favorites:\(serverID)" }

    init(serverID: String) {
        self.serverID = serverID
        showsHidden = UserDefaults.standard.bool(forKey: Self.hiddenKey)
        favorites = UserDefaults.standard.stringArray(forKey: "files.favorites:\(serverID)") ?? []
    }

    var currentPath: String { path.joined(separator: "/") }

    func relative(_ name: String) -> String { (path + [name]).joined(separator: "/") }

    /// Rows as shown: hidden files and the filter applied, folders first.
    var visibleRows: [FileRow] {
        let query = filter.trimmingCharacters(in: .whitespaces)
        let shown = items.filter { row in
            (showsHidden || !row.isHidden) && (query.isEmpty || row.name.localizedCaseInsensitiveContains(query))
        }
        let sorted = shown.sorted(using: sortOrder)
        return sorted.filter(\.isDirectory) + sorted.filter { !$0.isDirectory }
    }

    var selectedRows: [FileRow] { visibleRows.filter { selection.contains($0.name) } }

    // MARK: Navigation

    /// Opens a folder; `recordHistory` is false for back and forward themselves.
    func navigate(to newPath: [String], recordHistory: Bool = true) {
        guard newPath != path else { return }
        if recordHistory {
            backStack.append(path)
            forwardStack = []
        }
        selection = []
        filter = ""
        path = newPath
    }

    func goUp() {
        guard !path.isEmpty else { return }
        navigate(to: Array(path.dropLast()))
    }

    func goBack() {
        guard let previous = backStack.popLast() else { return }
        forwardStack.append(path)
        navigate(to: previous, recordHistory: false)
    }

    func goForward() {
        guard let next = forwardStack.popLast() else { return }
        backStack.append(path)
        navigate(to: next, recordHistory: false)
    }

    func open(_ name: String) {
        guard let row = items.first(where: { $0.name == name }) else { return }
        if row.isDirectory {
            navigate(to: path + [name])
        } else {
            openedFile = OpenedFile(relative: relative(name), name: name, size: row.size)
        }
    }

    // MARK: Loading

    /// Lists the folder. Folder sizes are measured afterwards in the background,
    /// so actions never wait for them.
    func reload() async {
        isLoading = true
        defer { isLoading = false }
        let listedPath = path
        do throws(CoreError) {
            let listed = try await CoreClient.listFiles(serverID: serverID, relative: listedPath.joined(separator: "/"))
            guard listedPath == path else { return }
            let rows = listed.map(FileRow.init)
            items = rows
            // Trim the selection on the next turn, not inside the table's update.
            let names = Set(rows.map(\.name))
            Task { @MainActor in self.selection = self.selection.filter(names.contains) }
            if let name = pendingOpen, names.contains(name) {
                pendingOpen = nil
                open(name)
            }
        } catch {
            items = []
            feedback?.toast(.error, L10n.t("files.toast.loadFailed"))
            return
        }
        measureFolders()
    }

    /// Folder sizes arrive after the list, four folders at a time (each walk
    /// takes up to 3 seconds). Earlier sizes stay until new ones replace them.
    private func measureFolders() {
        sizeTask?.cancel()
        let folders = items.filter(\.isDirectory).map { relative($0.name) }
        let serverID = serverID
        sizeTask = Task { [weak self] in
            await withTaskGroup(of: (String, FolderSize?).self) { group in
                var pending = folders[...]
                func addNext() {
                    guard let key = pending.popFirst() else { return }
                    group.addTask { (key, try? await CoreClient.folderSize(serverID: serverID, relative: key)) }
                }
                for _ in 0..<4 { addNext() }
                while let (key, size) = await group.next() {
                    if Task.isCancelled {
                        group.cancelAll()
                        return
                    }
                    if let size { self?.folderSizes[key] = size }
                    addNext()
                }
            }
        }
    }

    // MARK: Selection

    var allSelected: Bool {
        let rows = visibleRows
        return !rows.isEmpty && rows.allSatisfy { selection.contains($0.name) }
    }

    func toggleSelectAll() {
        selection = allSelected ? [] : Set(visibleRows.map(\.name))
    }

    func toggle(_ name: String) {
        if selection.contains(name) { selection.remove(name) } else { selection.insert(name) }
    }

    // MARK: Favorites

    var isFavorite: Bool { favorites.contains(currentPath) }

    func toggleFavorite(_ relativePath: String? = nil) {
        let target = relativePath ?? currentPath
        if let index = favorites.firstIndex(of: target) {
            favorites.remove(at: index)
        } else {
            favorites.append(target)
        }
        UserDefaults.standard.set(favorites, forKey: favoritesKey)
    }

    func openFavorite(_ relativePath: String) {
        navigate(to: relativePath.split(separator: "/").map(String.init))
    }
}

/// Entries the move sheet is choosing a folder for.
struct MoveRequest: Identifiable {
    let id = UUID()
    /// Paths relative to the server folder.
    let entries: [String]
    /// The folder the sheet opens in.
    let start: [String]
}

/// A running or finished action, shown next to the entry it acts on.
struct FileActivity: Equatable {
    enum State: Equatable {
        case running
        case done
    }

    enum Anchor: Equatable {
        /// The row with this name in the current folder.
        case row(String)
        /// The folder itself (the path bar), for entries that are gone.
        case folder
    }

    let id = UUID()
    var anchor: Anchor
    var message: String
    var state: State
}
