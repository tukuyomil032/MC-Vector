// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// How the Files view lays out a folder, as in Finder (⌘1–⌘4).
enum FilesViewMode: String, CaseIterable, Identifiable {
    case icons, list, columns, gallery

    var id: Self { self }

    var titleKey: String { "native.files.view.\(rawValue)" }

    var symbol: String {
        switch self {
        case .icons: "square.grid.2x2"
        case .list: "list.bullet"
        case .columns: "rectangle.split.3x1"
        case .gallery: "rectangle.on.rectangle"
        }
    }

    /// The digit of its ⌘ shortcut.
    var shortcut: Character {
        switch self {
        case .icons: "1"
        case .list: "2"
        case .columns: "3"
        case .gallery: "4"
        }
    }

    /// App Settings › General: the view of folders not switched yet.
    static let defaultKey = "files.view.default"

    static var preferred: FilesViewMode {
        UserDefaults.standard.string(forKey: defaultKey).flatMap(FilesViewMode.init(rawValue:)) ?? .list
    }

    /// The view chosen for one folder of one server, if any.
    static func remembered(serverID: String, folder: String) -> FilesViewMode? {
        UserDefaults.standard.string(forKey: folderKey(serverID: serverID, folder: folder))
            .flatMap(FilesViewMode.init(rawValue:))
    }

    static func remember(_ mode: FilesViewMode, serverID: String, folder: String) {
        UserDefaults.standard.set(mode.rawValue, forKey: folderKey(serverID: serverID, folder: folder))
    }

    static func forget(serverID: String, folder: String) {
        UserDefaults.standard.removeObject(forKey: folderKey(serverID: serverID, folder: folder))
    }

    private static func folderKey(serverID: String, folder: String) -> String {
        "files.view:\(serverID):\(folder)"
    }
}
