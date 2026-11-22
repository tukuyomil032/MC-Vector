// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// A search result, identified across sources.
struct PluginItem: Identifiable, Hashable, Sendable {
    let record: PluginProjectRecord
    var id: String { "\(record.source)-\(record.id)" }
}

/// An installed file in plugins/ or mods/.
struct InstalledItem: Identifiable, Hashable, Sendable {
    let plugin: InstalledPlugin
    var id: String { plugin.fileName }

    /// The file name without `.jar` / `.jar.disabled`, for display and search.
    var title: String {
        var name = plugin.fileName
        for suffix in [".disabled", ".jar"] where name.lowercased().hasSuffix(suffix) {
            name = String(name.dropLast(suffix.count))
        }
        return name
    }

    var updateVersion: String? {
        if case .available(let version) = plugin.update { return version }
        return nil
    }
}

enum PluginsTab: String, CaseIterable, Identifiable {
    case browse, installed
    var id: String { rawValue }
}

extension PluginSource {
    var titleKey: String {
        switch self {
        case .modrinth: "native.plugins.source.modrinth"
        case .hangar: "native.plugins.source.hangar"
        case .spiget: "native.plugins.source.spigot"
        }
    }
}

extension PluginSort {
    static let allCases: [PluginSort] = [.relevance, .downloads, .name, .compatibility]

    var titleKey: String {
        switch self {
        case .relevance: "plugins.browser.sortRelevance"
        case .downloads: "plugins.browser.sortDownloads"
        case .name: "plugins.browser.sortName"
        case .compatibility: "plugins.browser.sortCompatibility"
        }
    }
}

/// Plugins and mods of one server (UI-010, React PluginBrowser): search the
/// sources the server type supports, read details and the README, install
/// with the core's preview and policy, and manage installed files.
@MainActor
@Observable
final class PluginsModel {
    enum Load: Equatable {
        case idle
        case loading
        case loaded
        case failed(CoreError)
    }

    /// The install or update the user is asked to confirm.
    struct PendingInstall: Identifiable {
        let id = UUID()
        let title: String
        let preview: PluginInstallPreview
        /// The installed file this replaces (update), if any.
        let replacing: String?
    }

    /// A blocked install the user is told about (no token).
    struct Blocked: Identifiable {
        let id = UUID()
        let title: String
        let message: String
        let externalURL: URL?
    }

    static let pageSize: UInt32 = 24

    let server: ServerProfile
    let support: PluginServerSupport

    var tab: PluginsTab = .browse
    var source: PluginSource
    var query = ""
    var sort: PluginSort = .relevance
    var category: String?
    private(set) var categories: [PluginCategory] = []

    private(set) var results: [PluginItem] = []
    private(set) var total: UInt64?
    private(set) var load: Load = .idle
    private(set) var isLoadingMore = false
    private(set) var reachedEnd = false
    /// The page shown in page mode (0-based).
    private(set) var page = 0

    var selection: PluginItem.ID?
    private(set) var readme: Load = .idle
    private(set) var readmeHTML: String?
    private(set) var versions: [PluginVersionRecord] = []
    private(set) var versionsLoad: Load = .idle

    private(set) var installed: [InstalledItem] = []
    private(set) var installedLoad: Load = .idle
    private(set) var checkingUpdates = false
    var installedSearch = ""

    /// Install progress by project item id (0...1, or nil while preparing).
    private(set) var installing: [PluginItem.ID: Double?] = [:]
    /// Update progress by installed file name.
    private(set) var updating: [String: Double?] = [:]
    private(set) var bulk: PluginBulkProgress?
    private var bulkOperation: PluginBulkOperation?

    var pendingInstall: PendingInstall?
    var blocked: Blocked?

    private var searchTask: Task<Void, Never>?

    init(server: ServerProfile) {
        self.server = server
        support = CoreClient.pluginSupport(software: server.software)
        source = support.sources.first ?? .modrinth
    }

    var selected: PluginItem? { results.first { $0.id == selection } }

    var visibleInstalled: [InstalledItem] {
        let needle = installedSearch.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return installed }
        return installed.filter { $0.plugin.fileName.lowercased().contains(needle) }
    }

    var updatable: [InstalledItem] { installed.filter { $0.updateVersion != nil } }

    var pageCount: Int? {
        total.map { max(1, Int(($0 + UInt64(Self.pageSize) - 1) / UInt64(Self.pageSize))) }
    }

    /// The installed file that came from this project, if any.
    func installedFile(for item: PluginItem) -> InstalledItem? {
        installed.first { $0.plugin.origin?.project == item.record.project }
    }

    private var folderURL: URL {
        URL(fileURLWithPath: server.path, isDirectory: true)
            .appendingPathComponent(support.targetDirectory, isDirectory: true)
    }

    func fileURL(_ item: InstalledItem) -> URL { folderURL.appendingPathComponent(item.plugin.fileName) }

    // MARK: Search

    /// Starts a new search (debounced when typing).
    func search(debounce: Bool = false) {
        searchTask?.cancel()
        searchTask = Task {
            if debounce {
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
            }
            await fetch(page: 0, append: false)
        }
    }

    func goTo(page: Int) {
        searchTask?.cancel()
        searchTask = Task { await fetch(page: max(0, page), append: false) }
    }

    func loadMore() async {
        guard load == .loaded, !isLoadingMore, !reachedEnd else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        await fetch(page: page + 1, append: true)
    }

    private func fetch(page: Int, append: Bool) async {
        if !append { withAnimation(Motion.standard) { load = .loading } }
        let input = PluginSearchInput(
            source: source, query: query.trimmingCharacters(in: .whitespaces),
            software: server.software, gameVersion: server.version,
            offset: UInt32(page) * Self.pageSize, limit: Self.pageSize, sort: sort, category: category)
        do {
            let result = try await CoreClient.searchPlugins(input)
            guard !Task.isCancelled else { return }
            let items = result.items.map(PluginItem.init)
            withAnimation(Motion.standard) {
                if append {
                    let known = Set(results.map(\.id))
                    results += items.filter { !known.contains($0.id) }
                } else {
                    results = items
                }
                total = result.total
                self.page = page
                reachedEnd =
                    items.count < Int(Self.pageSize)
                    || result.total.map { UInt64(results.count) >= $0 } ?? false
                load = .loaded
            }
        } catch {
            guard !Task.isCancelled else { return }
            if append {
                reachedEnd = true
            } else {
                withAnimation(Motion.standard) { load = .failed(error) }
            }
        }
    }

    func changeSource(_ source: PluginSource) {
        guard self.source != source else { return }
        self.source = source
        category = nil
        categories = []
        selection = nil
        search()
        Task { await loadCategories() }
    }

    func loadCategories() async {
        let source = source
        guard let list = try? await CoreClient.pluginCategories(source: source), source == self.source else {
            return
        }
        categories = list
    }

    // MARK: Detail

    func loadDetail() async {
        guard let item = selected else { return }
        readmeHTML = nil
        versions = []
        readme = .loading
        versionsLoad = .loading
        let project = item.record.project
        let software = server.software
        async let html = Self.capture { () async throws(CoreError) -> String? in
            try await CoreClient.pluginReadme(project: project)
        }
        async let list = Self.capture { () async throws(CoreError) -> [PluginVersionRecord] in
            try await CoreClient.pluginVersions(project: project, software: software)
        }
        let (readmeResult, versionsResult) = await (html, list)
        guard selection == item.id else { return }
        switch readmeResult {
        case .success(let text):
            readmeHTML = text
            readme = .loaded
        case .failure(let error): readme = .failed(error)
        }
        switch versionsResult {
        case .success(let list):
            versions = list
            versionsLoad = .loaded
        case .failure(let error): versionsLoad = .failed(error)
        }
    }

    private nonisolated static func capture<T: Sendable>(
        _ body: @Sendable () async throws(CoreError) -> T
    ) async -> Result<T, CoreError> {
        do {
            return .success(try await body())
        } catch {
            return .failure(error)
        }
    }

    // MARK: Install

    func install(_ item: PluginItem, feedback: FeedbackCenter) async {
        guard installing[item.id] == nil else { return }
        installing[item.id] = .some(nil)
        defer { installing[item.id] = nil }
        do {
            let preview = try await CoreClient.preparePluginInstall(serverID: server.id, project: item.record.project)
            route(preview, title: item.record.name, replacing: nil)
        } catch {
            report(error, title: item.record.name, feedback: feedback)
        }
    }

    func update(_ item: InstalledItem, feedback: FeedbackCenter) async {
        guard let project = item.plugin.origin?.project, updating[item.id] == nil else { return }
        updating[item.id] = .some(nil)
        defer { updating[item.id] = nil }
        do {
            let preview = try await CoreClient.preparePluginInstall(
                serverID: server.id, project: project, replaceFileName: item.plugin.fileName)
            route(preview, title: item.title, replacing: item.plugin.fileName)
        } catch {
            report(error, title: item.title, feedback: feedback)
        }
    }

    /// Turns the core's policy into a confirmation or an explanation.
    private func route(_ preview: PluginInstallPreview, title: String, replacing: String?) {
        switch preview.policy {
        case .confirm:
            if preview.token != nil {
                pendingInstall = PendingInstall(title: title, preview: preview, replacing: replacing)
            }
        case .externalDownload:
            blocked = Blocked(
                title: L10n.t("plugins.browser.externalDownload"),
                message: L10n.t("plugins.browser.downloadInstructions", ["folder": support.targetDirectory]),
                externalURL: preview.externalUrl.flatMap(URL.init(string:)))
        case .incompatible, .incompletePreview:
            blocked = Blocked(
                title: L10n.t("plugins.browser.incompatibleInstallTitle"),
                message: L10n.t(
                    "plugins.browser.incompatibleInstallDescription",
                    ["title": title, "software": server.software, "version": server.version]),
                externalURL: nil)
        case .unverifiedBlocked:
            blocked = Blocked(
                title: L10n.t("plugins.browser.unverifiedInstallTitle"),
                message: L10n.t("plugins.browser.unverifiedInstallDescription"), externalURL: nil)
        }
    }

    /// Runs a confirmed install or update with progress.
    func execute(_ pending: PendingInstall, feedback: FeedbackCenter) async {
        guard let token = pending.preview.token else { return }
        let itemID = results.first { $0.record.project == pending.preview.artifacts.first?.project }?.id
        let dependencies = pending.preview.artifacts.filter(\.dependency).map(\.id)
        let operation = CoreClient.executePluginInstall(token: token, confirmedDependencyIDs: dependencies)
        setProgress(itemID: itemID, replacing: pending.replacing, value: 0)
        let watcher = Task {
            for await event in operation.progress where event.total > 0 {
                setProgress(
                    itemID: itemID, replacing: pending.replacing,
                    value: Double(event.downloaded) / Double(event.total))
            }
        }
        defer {
            watcher.cancel()
            if let replacing = pending.replacing { updating[replacing] = nil }
            if let itemID { installing[itemID] = nil }
        }
        do {
            _ = try await operation.value()
            let key = pending.replacing == nil ? "plugins.browser.installSuccess" : "plugins.browser.updateSuccess"
            feedback.toast(.success, L10n.t(key, ["title": pending.title]))
            await reloadInstalled(checkUpdates: true)
        } catch {
            report(error, title: pending.title, feedback: feedback)
        }
    }

    private func setProgress(itemID: PluginItem.ID?, replacing: String?, value: Double) {
        withAnimation(Motion.value) {
            if let replacing { updating[replacing] = value }
            if let itemID { installing[itemID] = value }
        }
    }

    private func report(_ error: CoreError, title: String, feedback: FeedbackCenter) {
        let keys: (String, String) =
            switch error.pluginInstallFailure {
            case .incompatible: ("incompatibleInstallTitle", "incompatibleInstallDescription")
            case .checksum: ("checksumInstallTitle", "checksumInstallDescription")
            case .unverified: ("unverifiedInstallTitle", "unverifiedInstallDescription")
            case .size: ("sizeInstallTitle", "sizeInstallDescription")
            case .destination: ("destinationInstallTitle", "destinationInstallDescription")
            case .source: ("sourceInstallTitle", "sourceInstallDescription")
            case nil: ("", "")
            }
        if keys.0.isEmpty {
            feedback.showError(L10n.t("plugins.browser.unknownInstallError"), message: error.uiText)
        } else {
            feedback.showError(
                L10n.t("plugins.browser.\(keys.0)"),
                message: L10n.t(
                    "plugins.browser.\(keys.1)",
                    ["title": title, "software": server.software, "version": server.version]))
        }
    }

}

// Installed tab, kept apart so the type body stays within the lint limit.
extension PluginsModel {
    // MARK: Installed

    func reloadInstalled(checkUpdates: Bool) async {
        if installedLoad != .loaded { installedLoad = .loading }
        do {
            let list = try await CoreClient.installedPlugins(serverID: server.id)
            withAnimation(Motion.standard) {
                installed = list.map(InstalledItem.init)
                installedLoad = .loaded
            }
        } catch {
            installedLoad = .failed(error)
            return
        }
        guard checkUpdates else { return }
        checkingUpdates = true
        defer { checkingUpdates = false }
        if let list = try? await CoreClient.installedPlugins(serverID: server.id, checkUpdates: true) {
            withAnimation(Motion.standard) { installed = list.map(InstalledItem.init) }
        }
    }

    func toggle(_ item: InstalledItem, feedback: FeedbackCenter) async {
        do {
            _ = try await CoreClient.toggleInstalledPlugin(serverID: server.id, fileName: item.plugin.fileName)
            let key = item.plugin.enabled ? "plugins.browser.pluginDisabled" : "plugins.browser.pluginEnabled"
            feedback.toast(.success, L10n.t(key, ["title": item.title]))
        } catch {
            feedback.showError(L10n.t("plugins.browser.toggleErrorTitle"), message: error.uiText)
        }
        await reloadInstalled(checkUpdates: false)
    }

    func uninstall(_ item: InstalledItem, feedback: FeedbackCenter) async {
        do {
            try await CoreClient.uninstallPlugin(serverID: server.id, fileName: item.plugin.fileName)
            feedback.toast(.success, L10n.t("plugins.browser.uninstallSuccess", ["title": item.title]))
        } catch {
            feedback.showError(L10n.t("plugins.browser.uninstallErrorTitle"), message: error.uiText)
        }
        await reloadInstalled(checkUpdates: false)
    }

    /// Updates every file with an update, one after another, through the core.
    func updateAll(feedback: FeedbackCenter) async {
        guard bulkOperation == nil else { return }
        let operation = CoreClient.bulkUpdatePlugins(serverID: server.id)
        bulkOperation = operation
        withAnimation(Motion.standard) {
            bulk = PluginBulkProgress(
                operationId: operation.operationID, completed: 0, total: UInt32(updatable.count), currentFile: "")
        }
        let watcher = Task {
            for await event in operation.progress {
                withAnimation(Motion.value) { bulk = event }
            }
        }
        defer {
            watcher.cancel()
            bulkOperation = nil
            withAnimation(Motion.standard) { bulk = nil }
        }
        do {
            let outcome = try await operation.value()
            let updated = outcome.items.filter { if case .updated = $0.status { true } else { false } }.count
            let failed = outcome.items.filter { if case .failed = $0.status { true } else { false } }.count
            feedback.toast(
                failed == 0 ? .success : .warning,
                L10n.t("native.plugins.bulkDone", ["updated": updated, "failed": failed]))
        } catch {
            feedback.showError(L10n.t("native.plugins.bulkFailed"), message: error.uiText)
        }
        await reloadInstalled(checkUpdates: true)
    }

    func cancelUpdateAll() async {
        await bulkOperation?.cancel()
    }
}
