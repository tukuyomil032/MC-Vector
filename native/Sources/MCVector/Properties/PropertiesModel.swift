// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import MCVectorEditorKit
import SwiftUI

/// server.properties for the Properties view (UI-014, OP-SRV-021/022): the
/// values as text, what changed, and saving only the changed keys.
@MainActor
@Observable
final class PropertiesModel {
    enum Load: Equatable {
        case loading
        case loaded
        case failed(CoreError)
    }

    let serverID: String
    let layout = PropertiesLayout.bundled
    private(set) var docs: [String: SchemaEntry] = [:]
    private(set) var load: Load = .loading
    /// What each field shows and edits.
    var values: [String: String] = [:]
    /// The values as last loaded or saved; a field differing from it is unsaved.
    private(set) var baseline: [String: String] = [:]
    /// Keys written in the file (shown even when the schema says this version lacks them).
    private(set) var fileKeys: Set<String> = []
    private(set) var isSaving = false
    /// Briefly true after a save, for the button's "Saved" state.
    private(set) var justSaved = false

    @ObservationIgnored private var software: String?
    @ObservationIgnored private var version: String?
    #if DEBUG
        /// Capture tooling: reveals this secret field.
        var captureRevealKey: String?
    #endif

    init(serverID: String, software: String? = nil, version: String? = nil) {
        self.serverID = serverID
        self.software = software
        self.version = version
    }

    func reloadAgain() async {
        load = .loading
        await reload(software: software, version: version)
    }

    // MARK: Layout

    func category(_ id: String) -> PropertiesLayout.Category? {
        layout.categories.first { $0.id == id }
    }

    /// Keys shown in the cards: not hidden, and present in this server's version.
    func visibleKeys(of category: PropertiesLayout.Category) -> [PropertiesLayout.Key] {
        let hidden = Set(layout.hidden)
        return category.keys.filter { !hidden.contains($0.key) && exists($0.key) }
    }

    var visibleCategories: [PropertiesLayout.Category] {
        layout.categories.filter { !visibleKeys(of: $0).isEmpty }
    }

    /// Keys whose name, label or description contain `query`, per category.
    func matches(_ query: String) -> [(category: PropertiesLayout.Category, keys: [PropertiesLayout.Key])] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return visibleCategories.compactMap { category in
            let keys = visibleKeys(of: category).filter { key in
                [key.key, key.label.en, key.label.ja, docs[key.key]?.doc.text(language: L10n.language)]
                    .contains { $0?.lowercased().contains(needle) == true }
            }
            return keys.isEmpty ? nil : (category, keys)
        }
    }

    var changedKeys: [String] {
        values.keys.filter { values[$0] != baseline[$0] }.sorted()
    }

    var isDirty: Bool { !changedKeys.isEmpty }

    /// False for keys this server's version does not have (for example `pvp`
    /// after 1.21.8), unless the file still contains them.
    func exists(_ key: String) -> Bool {
        docs.isEmpty || docs[key] != nil || fileKeys.contains(key)
    }

    func reload(software: String?, version: String?) async {
        self.software = software
        self.version = version
        docs = PropertiesLayout.docs(software: software, version: version)
        do {
            let snapshot = try await CoreClient.serverProperties(serverID: serverID)
            apply(Dictionary(snapshot.entries.map { ($0.key, $0.value) }, uniquingKeysWith: { _, last in last }))
        } catch  where error.code == "properties.missing" {
            // Not created yet: show the defaults; saving writes the file (as React does).
            apply([:])
        } catch {
            load = .failed(error)
        }
    }

    /// File values, with the schema default for keys the file does not have.
    private func apply(_ file: [String: String]) {
        fileKeys = Set(file.keys)
        var shown = file
        for category in layout.categories {
            for key in category.keys where shown[key.key] == nil {
                shown[key.key] = docs[key.key]?.default?.displayText ?? ""
            }
        }
        withAnimation(Motion.standard) {
            baseline = shown
            values = shown
            load = .loaded
        }
    }

    /// A number outside its range, as the limit to show under the field.
    func rangeNote(for key: PropertiesLayout.Key) -> String? {
        guard key.control == .number, let number = Int(values[key.key] ?? "") else { return nil }
        if let max = key.max, number > max { return L10n.t("native.properties.max", ["value": "\(max)"]) }
        if let min = key.min, number < min { return L10n.t("native.properties.min", ["value": "\(min)"]) }
        return nil
    }

    func save(isRunning: Bool, feedback: FeedbackCenter) async -> SavePropertiesResult? {
        guard isDirty, !isSaving else { return nil }
        clampNumbers()
        let updates = changedKeys.map { PropertyUpdate(key: $0, value: values[$0] ?? "") }
        isSaving = true
        defer { isSaving = false }
        do {
            let result = try await CoreClient.saveServerProperties(serverID: serverID, updates: updates)
            withAnimation(Motion.standard) {
                baseline = values
                justSaved = true
            }
            feedback.toast(
                isRunning ? .info : .success,
                L10n.t(isRunning ? "native.properties.savedRestart" : "properties.saveSuccess"))
            Task {
                try? await Task.sleep(for: .seconds(2))
                withAnimation(Motion.standard) { self.justSaved = false }
            }
            return result
        } catch {
            feedback.showError(L10n.t("properties.saveFailed"), message: error.uiText)
            return nil
        }
    }

    func discard() {
        withAnimation(Motion.standard) { values = baseline }
    }

    private func clampNumbers() {
        for category in layout.categories {
            for key in category.keys where key.control == .number {
                guard let number = Int(values[key.key] ?? "") else { continue }
                let clamped = Swift.min(Swift.max(number, key.min ?? .min), key.max ?? .max)
                if clamped != number { values[key.key] = String(clamped) }
            }
        }
    }
}
