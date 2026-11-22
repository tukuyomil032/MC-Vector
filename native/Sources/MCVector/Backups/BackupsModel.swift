// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// One backup as the Backups view shows it.
struct BackupItem: Identifiable, Hashable, Sendable {
    let record: BackupRecord
    let date: Date?

    var id: String { record.name }
    var name: String { record.name }
    var size: UInt64 { record.totalBytes }
    var tags: [String] { record.tags }
    var note: String { record.note }
    var tagText: String { record.tags.joined(separator: ", ") }
    var sortDate: Date { date ?? .distantPast }

    init(_ record: BackupRecord) {
        self.record = record
        date = BackupItem.parse(record.createdAt)
    }

    /// Date and time in the app's language, not the system's.
    static func display(_ date: Date) -> String {
        date.formatted(
            Date.FormatStyle(date: .abbreviated, time: .shortened).locale(Locale(identifier: L10n.language)))
    }

    private static func parse(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        if let date = ISO8601DateFormatter().date(from: text) { return date }
        if let millis = Double(text) { return Date(timeIntervalSince1970: millis / 1000) }
        return nil
    }
}

enum BackupSort: String, CaseIterable, Identifiable {
    case date, name, size
    var id: String { rawValue }
    var titleKey: String { "native.backups.sort.\(rawValue)" }
}

/// Backups of one server (UI-011): the catalog, search and sort, and the one
/// create or restore that may run at a time with its progress.
@MainActor
@Observable
final class BackupsModel {
    enum Load: Equatable {
        case loading
        case loaded
        case failed(CoreError)
    }

    /// A create or restore in flight.
    struct Activity: Equatable {
        enum Kind { case create, restore }
        let kind: Kind
        let name: String
        var progress: Double = 0
        var currentFile = ""
    }

    let serverID: String
    private(set) var load: Load = .loading
    private(set) var items: [BackupItem] = []
    private(set) var activity: Activity?
    var search = ""
    var sort: BackupSort = .date
    var ascending = false
    #if DEBUG
        /// Keeps a capture operation's progress row visible long enough to photograph.
        var captureProgressHold: Duration = .zero
    #endif
    /// Table column sorting (the table layout drives `sort` through this).
    var sortOrder: [KeyPathComparator<BackupItem>] = [KeyPathComparator(\.sortDate, order: .reverse)]

    init(serverID: String) {
        self.serverID = serverID
    }

    var isBusy: Bool { activity != nil }

    /// Search (name, tags, note) and sort applied.
    var visible: [BackupItem] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered =
            needle.isEmpty
            ? items
            : items.filter { item in
                ([item.name, item.note] + item.tags).contains { $0.lowercased().contains(needle) }
            }
        return filtered.sorted(using: sortOrder)
    }

    func setSort(_ sort: BackupSort, ascending: Bool) {
        self.sort = sort
        self.ascending = ascending
        let order: SortOrder = ascending ? .forward : .reverse
        withAnimation(Motion.standard) {
            switch sort {
            case .date: sortOrder = [KeyPathComparator(\.sortDate, order: order)]
            case .name: sortOrder = [KeyPathComparator(\.name, order: order)]
            case .size: sortOrder = [KeyPathComparator(\.size, order: order)]
            }
        }
    }

    func reload() async {
        if case .failed = load { load = .loading }
        do {
            let records = try await CoreClient.backups(serverID: serverID)
            withAnimation(Motion.standard) {
                items = records.map(BackupItem.init)
                load = .loaded
            }
        } catch {
            load = .failed(error)
        }
    }

    // MARK: Create

    /// The size of the server folder and the time estimate, for the create sheet.
    func estimate() async -> (bytes: UInt64?, durationMs: UInt64?) {
        guard let size = try? await CoreClient.folderSize(serverID: serverID, relative: "") else {
            return (nil, nil)
        }
        let estimate = CoreClient.estimateBackupDuration(targetBytes: size.bytes, history: items.map(\.record))
        return (size.bytes, estimate?.durationMs)
    }

    enum CreateOutcome {
        case done
        /// The server runs: ask before stopping it, then call again with `stopServer`.
        case needsStop
        /// The caller shows the error (the create sheet shows it inline).
        case failed(CoreError?)
    }

    func create(
        name: String?, compression: Int, stopServer: Bool, feedback: FeedbackCenter
    ) async -> CreateOutcome {
        guard activity == nil else { return .failed(nil) }
        let trimmed = name?.trimmingCharacters(in: .whitespaces)
        let operation = CoreClient.createBackup(
            serverID: serverID, backupName: trimmed?.isEmpty == false ? trimmed : nil,
            compressionLevel: Int64(compression), stopRunningServer: stopServer)
        withAnimation(Motion.standard) { activity = Activity(kind: .create, name: trimmed ?? "") }
        #if DEBUG
            if captureProgressHold > .zero {
                activity?.progress = 0.36
                try? await Task.sleep(for: captureProgressHold)
                captureProgressHold = .zero
            }
        #endif
        let watcher = Task { await follow(operation.progress) }
        defer {
            watcher.cancel()
            withAnimation(Motion.standard) { activity = nil }
        }
        do {
            switch try await operation.value() {
            case .confirmationRequired:
                return .needsStop
            case .created(_, _, let catalogWarning, let restart):
                feedback.toast(.success, L10n.t("backups.toast.created"))
                if catalogWarning != nil {
                    feedback.toast(.warning, L10n.t("backups.toast.createMetadataSaveFailed"))
                }
                if case .failed = restart {
                    feedback.toast(.warning, L10n.t("backups.toast.serverRestartFailed"))
                }
                await reload()
                return .done
            }
        } catch {
            return .failed(error)
        }
    }

    // MARK: Restore, delete, tags

    func restore(_ item: BackupItem, feedback: FeedbackCenter) async {
        guard activity == nil else { return }
        let operation = CoreClient.restoreBackupWithProgress(serverID: serverID, backupName: item.name)
        withAnimation(Motion.standard) { activity = Activity(kind: .restore, name: item.name) }
        #if DEBUG
            if captureProgressHold > .zero {
                activity?.progress = 0.36
                try? await Task.sleep(for: captureProgressHold)
                captureProgressHold = .zero
            }
        #endif
        let watcher = Task { await follow(operation.progress) }
        defer {
            watcher.cancel()
            withAnimation(Motion.standard) { activity = nil }
        }
        do {
            try await operation.value()
            feedback.toast(.success, L10n.t("backups.toast.restored"))
        } catch {
            feedback.showError(L10n.t("backups.toast.restoreFailed"), message: error.uiText)
        }
    }

    func delete(_ item: BackupItem, feedback: FeedbackCenter) async {
        do {
            let records = try await CoreClient.deleteBackup(serverID: serverID, backupName: item.name)
            withAnimation(Motion.standard) { items = records.map(BackupItem.init) }
            feedback.toast(.success, L10n.t("backups.toast.deleted"))
        } catch {
            feedback.showError(L10n.t("backups.toast.deleteFailed"), message: error.uiText)
        }
    }

    /// Nil when saved; otherwise the error for the tag sheet to show inline.
    func saveTags(_ item: BackupItem, tags: [String], note: String, feedback: FeedbackCenter) async -> CoreError? {
        do {
            _ = try await CoreClient.setBackupMetadata(
                serverID: serverID, backupName: item.name, tags: tags, note: note)
            await reload()
            feedback.toast(.success, L10n.t("backups.toast.tagSaved"))
            return nil
        } catch {
            return error
        }
    }

    private func follow(_ stream: AsyncStream<BackupProgressEvent>) async {
        for await event in stream {
            withAnimation(Motion.value) {
                activity?.progress = Double(event.progress)
                activity?.currentFile = event.currentFile
            }
        }
    }
}
