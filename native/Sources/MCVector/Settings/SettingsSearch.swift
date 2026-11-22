// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// One searchable row of the Settings window.
struct SettingsSearchEntry: Identifiable, Hashable, Sendable {
    let page: SettingsPage
    /// The row's title; also the anchor the window scrolls to.
    let title: String
    /// The section the row sits in, shown under the title.
    let section: String?
    /// The row's description, searched too.
    let detail: String?

    var id: String { "\(page.id)|\(title)" }
}

/// Results for one page: the page itself, then its matching rows.
struct SettingsSearchGroup: Identifiable, Sendable {
    let page: SettingsPage
    let entries: [SettingsSearchEntry]
    var id: String { page.id }
}

/// The rows of every page by their title keys, grouped by section. Page views
/// title their rows with the same keys, so a result can scroll to its row.
@MainActor
enum SettingsSearch {
    /// Section title key → row title keys.
    typealias Rows = [(section: String, rows: [String])]

    static func rows(of pane: AppPane) -> Rows {
        switch pane {
        case .general:
            [
                (
                    "native.settings.section.appearance",
                    [
                        "settings.language.label", "native.settings.backupsLayout", "native.settings.pluginsPaging",
                        "native.settings.fileIcons.files", "native.settings.fileIcons.folders",
                        "native.settings.filesView",
                    ]
                ),
                ("native.settings.filesBar", FilesBarSettings.Group.allCases.map(\.titleKey)),
                ("settings.update.title", ["native.settings.updateCheck", "settings.update.channelLabel"]),
                ("settings.security.title", ["settings.security.label"]),
            ]
        case .java:
            [("native.settings.java", ["javaManager.availableVersions", "javaManager.installedRuntimes"])]
        case .editor:
            [
                ("native.settings.editor.theme", ["native.settings.editor.theme"]),
                (
                    "native.settings.editor.text",
                    [
                        "native.settings.editor.fontSize", "native.settings.editor.wrapLines",
                        "native.settings.editor.showInvisibles",
                    ]
                ),
                (
                    "native.settings.editor.suggestions",
                    ["native.settings.editor.suggestWhileTyping", "native.settings.editor.inlineSuggestions"]
                ),
            ]
        case .about: []
        }
    }

    static func entries(properties: PropertiesModel?) -> [SettingsSearchEntry] {
        var entries: [SettingsSearchEntry] = []
        for pane in AppPane.allCases {
            for (section, rows) in rows(of: pane) {
                entries += rows.map {
                    SettingsSearchEntry(
                        page: .app(pane), title: L10n.t($0), section: L10n.t(section), detail: detail($0))
                }
            }
        }
        for page in ServerPage.allCases {
            for (section, rows) in page.categories.flatMap(\.sections) {
                entries += rows.map {
                    SettingsSearchEntry(
                        page: .server(page), title: L10n.t($0),
                        section: L10n.t("native.settings.serverSection.\(section)"),
                        detail: detail($0))
                }
            }
        }
        if let properties {
            for group in PropertiesGroup.allCases {
                for section in properties.sections(of: group) {
                    entries += section.keys.map { key in
                        SettingsSearchEntry(
                            page: .properties(group), title: key.label.current, section: section.title,
                            detail: [
                                key.key, key.label.en, properties.docs[key.key]?.doc.text(language: L10n.language),
                            ]
                            .compactMap { $0 }.joined(separator: " "))
                    }
                }
            }
        }
        return entries
    }

    /// The description plus the English title, so either language finds the row.
    private static func detail(_ key: String) -> String {
        [L10n.help(key), L10n.english(key)].compactMap { $0 }.joined(separator: " ")
    }

    /// Pages whose title matches, or that have matching rows, in sidebar order.
    static func search(_ query: String, properties: PropertiesModel?, hasServer: Bool) -> [SettingsSearchGroup] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return [] }
        let matching = entries(properties: properties).filter { entry in
            [entry.title, entry.section, entry.detail].contains { $0?.lowercased().contains(needle) == true }
        }
        return SettingsSection.allCases.flatMap(\.pages).compactMap { page in
            if page.needsServer && !hasServer { return nil }
            let rows = matching.filter { $0.page == page }
            guard !rows.isEmpty || page.title.lowercased().contains(needle) else { return nil }
            return SettingsSearchGroup(page: page, entries: rows)
        }
    }
}

extension PropertiesModel {
    /// The group's categories that have something to show.
    func categories(of group: PropertiesGroup) -> [PropertiesLayout.Category] {
        group.categoryIDs.compactMap { id in visibleCategories.first { $0.id == id } }
    }

    /// The page's sections with the keys this server shows, empty ones left out.
    func sections(of group: PropertiesGroup) -> [(id: String, title: String, keys: [PropertiesLayout.Key])] {
        let visible = categories(of: group).flatMap { visibleKeys(of: $0) }
        let byName = Dictionary(visible.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        var sections = group.sections.map { section in
            (
                id: section.id, title: L10n.t("native.settings.propSection.\(section.id)"),
                keys: section.keys.compactMap { byName[$0] }
            )
        }
        let placed = Set(group.sections.flatMap(\.keys))
        let rest = visible.filter { !placed.contains($0.key) }
        if !rest.isEmpty, !sections.isEmpty { sections[sections.count - 1].keys += rest }
        return sections.filter { !$0.keys.isEmpty }
    }
}
