// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// How the Files view sections a folder (icons, list and gallery).
enum FilesGrouping: String, CaseIterable, Identifiable {
    case none, kind, modified, size

    var id: Self { self }

    var titleKey: String { "native.files.groupBy.\(rawValue)" }

    static let storageKey = "files.groupBy"

    /// One section: its heading and rows, in the rows' current order.
    struct Section: Identifiable {
        let id: String
        let title: String
        let rows: [FileRow]
    }

    /// The rows split into sections in a fixed order; empty sections are left
    /// out, and `.none` is one untitled section.
    func sections(_ rows: [FileRow], folderSizes: (String) -> UInt64?, now: Date = .now) -> [Section] {
        guard self != .none else { return [Section(id: "all", title: "", rows: rows)] }
        let keyed = Dictionary(grouping: rows) { key(for: $0, folderSizes: folderSizes, now: now) }
        return order.compactMap { key in
            guard let rows = keyed[key], !rows.isEmpty else { return nil }
            return Section(id: key, title: L10n.t("native.files.group.\(key)"), rows: rows)
        }
    }

    private var order: [String] {
        switch self {
        case .none: []
        case .kind: FileKindGroup.allCases.map(\.rawValue)
        case .modified: ["today", "yesterday", "week", "month", "older"]
        case .size: ["folders", "small", "medium", "large"]
        }
    }

    private func key(for row: FileRow, folderSizes: (String) -> UInt64?, now: Date) -> String {
        switch self {
        case .none: return "all"
        case .kind: return FileKindGroup(row).rawValue
        case .modified: return Self.age(of: row.modified, now: now)
        case .size:
            guard !row.isDirectory else { return "folders" }
            switch row.size {
            case ..<1_000_000: return "small"
            case ..<100_000_000: return "medium"
            default: return "large"
            }
        }
    }

    private static func age(of date: Date, now: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDate(date, inSameDayAs: now) { return "today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
            calendar.isDate(date, inSameDayAs: yesterday)
        {
            return "yesterday"
        }
        let days = calendar.dateComponents([.day], from: date, to: now).day ?? 0
        if days < 7 { return "week" }
        if days < 30 { return "month" }
        return "older"
    }
}

/// The kinds the "kind" grouping uses, decided from the colored icon a row gets.
enum FileKindGroup: String, CaseIterable {
    case folder, config, log, java, archive, image, minecraft, script, text, code, other

    init(_ row: FileRow) {
        guard !row.isDirectory else {
            self = .folder
            return
        }
        switch FileIconCatalog.iconName(for: row.name, isDirectory: false) {
        case "settings", "yaml", "toml", "json": self = .config
        case "log": self = .log
        case "java": self = .java
        case "zip": self = .archive
        case "image": self = .image
        case "minecraft", "lock": self = .minecraft
        case "console": self = .script
        case "document", "markdown": self = .text
        case FileIconCatalog.plainFile: self = .other
        default: self = .code
        }
    }
}
