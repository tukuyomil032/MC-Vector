// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// General Settings of one server (UI-014, React ServerSettings): the saved
/// settings, the edited copy, and saving it in one call.
@MainActor
@Observable
final class GeneralSettingsModel {
    enum Load: Equatable {
        case loading
        case loaded
        case failed(CoreError)
    }

    let serverID: String
    private(set) var load: Load = .loading
    /// As loaded or last saved; read-only facts (path) come from here.
    private(set) var saved: ServerSettings?
    /// What the pages edit.
    var draft: ServerSettingsUpdate?
    private(set) var isSaving = false
    private(set) var justSaved = false

    init(serverID: String) {
        self.serverID = serverID
    }

    var isDirty: Bool {
        guard let saved, let draft else { return false }
        return draft != Self.update(from: saved)
    }

    func reload() async {
        do {
            let settings = try await CoreClient.serverSettings(serverID: serverID)
            withAnimation(Motion.standard) {
                saved = settings
                draft = Self.update(from: settings)
                load = .loaded
            }
        } catch {
            load = .failed(error)
        }
    }

    func discard() {
        guard let saved else { return }
        withAnimation(Motion.standard) { draft = Self.update(from: saved) }
    }

    /// Saves the draft; nil when it failed (already reported).
    func save(feedback: FeedbackCenter) async -> ServerSettingsSaveResult? {
        guard isDirty, !isSaving, let draft else { return nil }
        isSaving = true
        defer { isSaving = false }
        do {
            let result = try await CoreClient.updateServerSettings(serverID: serverID, settings: draft)
            withAnimation(Motion.standard) {
                saved = result.settings
                self.draft = Self.update(from: result.settings)
                justSaved = true
            }
            feedback.toast(
                result.restartRequired ? .info : .success,
                L10n.t(result.restartRequired ? "native.serverSettings.savedRestart" : "native.serverSettings.saved"))
            Task {
                try? await Task.sleep(for: .seconds(2))
                withAnimation(Motion.standard) { self.justSaved = false }
            }
            return result
        } catch {
            feedback.showError(L10n.t("native.serverSettings.saveFailed"), message: error.uiText)
            return nil
        }
    }

    static func update(from settings: ServerSettings) -> ServerSettingsUpdate {
        ServerSettingsUpdate(
            name: settings.name, profileName: settings.profileName, groupName: settings.groupName,
            software: settings.software, version: settings.version, memoryMb: settings.memoryMb,
            port: settings.port, javaPath: settings.javaPath, jvmArgs: settings.jvmArgs,
            autoRestartOnCrash: settings.autoRestartOnCrash, maxAutoRestarts: settings.maxAutoRestarts,
            autoRestartDelaySec: settings.autoRestartDelaySec, autoBackupEnabled: settings.autoBackupEnabled,
            autoBackupIntervalMin: settings.autoBackupIntervalMin,
            autoBackupScheduleType: settings.autoBackupScheduleType, autoBackupTime: settings.autoBackupTime,
            autoBackupWeekday: settings.autoBackupWeekday, autoBackupRetainCount: settings.autoBackupRetainCount,
            autoBackupRetainDays: settings.autoBackupRetainDays,
            backupRestartAfterSafeBackup: settings.backupRestartAfterSafeBackup,
            notifyOnCrash: settings.notifyOnCrash, notifyOnStart: settings.notifyOnStart,
            notifyOnHighCpu: settings.notifyOnHighCpu, notifyHighCpuThreshold: settings.notifyHighCpuThreshold)
    }
}
