// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore

/// One entry of the listed folder.
struct FileRow: Identifiable, Hashable {
    let name: String
    let isDirectory: Bool
    let size: UInt64
    let modified: Date
    let created: Date?
    /// Direct entries of a folder; nil for files or when unreadable.
    let childCount: Int?

    var id: String { name }
    var sortName: String { name.lowercased() }
    var isHidden: Bool { name.hasPrefix(".") }
    /// Sort keys for optional columns: missing values sort first.
    var sortCreated: Date { created ?? .distantPast }
    var sortChildCount: Int { childCount ?? -1 }

    init(_ item: FileItem) {
        name = item.name
        isDirectory = item.isDirectory
        size = item.size
        modified = Date(timeIntervalSince1970: TimeInterval(item.modified))
        created = item.created.map { Date(timeIntervalSince1970: TimeInterval($0)) }
        childCount = item.childCount.map(Int.init)
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

    /// Archives the Files view can extract.
    static func isZip(_ name: String) -> Bool {
        (name as NSString).pathExtension.lowercased() == "zip"
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
