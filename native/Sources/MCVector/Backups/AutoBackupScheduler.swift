// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Runs the core's automatic-backup tick once a minute (UI-011, React
/// auto-backup.ts and Tauri automation.rs). The core decides which servers are
/// due, creates and prunes; this only reports what happened.
@MainActor
final class AutoBackupScheduler {
    #if DEBUG
        static weak var captureInstance: AutoBackupScheduler?
    #endif

    private var loop: Task<Void, Never>?
    private let feedback: FeedbackCenter
    /// Called after a backup was created or pruned, so open views reload.
    var onChange: (String) -> Void = { _ in }

    init(feedback: FeedbackCenter) {
        self.feedback = feedback
        #if DEBUG
            Self.captureInstance = self
        #endif
    }

    func start(interval: Duration = .seconds(60)) {
        guard loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled else { return }
                await self?.tick()
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }

    private func tick() async {
        let results: [AutomaticBackupTickResult]
        do {
            results = try await CoreClient.tickAutomaticBackups().value()
        } catch {
            return
        }
        for result in results {
            switch result.status {
            case .created:
                let title = L10n.t("native.backups.autoCreated", ["name": result.serverName])
                feedback.toast(.success, title)
                feedback.notifyInBackground(title: title, body: result.backupName)
                if let restartError = result.restartError {
                    feedback.toast(.warning, L10n.t("backups.toast.serverRestartFailed"))
                    feedback.notifyInBackground(title: L10n.t("backups.toast.serverRestartFailed"), body: restartError)
                }
                if result.retentionWarning != nil {
                    feedback.toast(.warning, L10n.t("backups.toast.retentionDeleteFailed"))
                }
                onChange(result.serverId)
            case .failed:
                let title = L10n.t("native.backups.autoFailed", ["name": result.serverName])
                feedback.toast(.error, title)
                feedback.notifyInBackground(title: title, body: result.error)
            case .skipped:
                break
            }
        }
    }

    #if DEBUG
        /// Runs one real core tick now for capture. The core's interval scheduler
        /// makes a newly enabled one-minute schedule due one minute later, so the
        /// capture seam temporarily uses the current local minute and restores the
        /// requested one-minute interval before returning.
        @discardableResult
        func captureTickNow(serverID: String) async throws -> Bool {
            let saved = try await CoreClient.serverSettings(serverID: serverID)
            var interval = GeneralSettingsModel.update(from: saved)
            interval.autoBackupEnabled = true
            interval.autoBackupIntervalMin = 1
            interval.autoBackupScheduleType = .interval
            _ = try await CoreClient.updateServerSettings(serverID: serverID, settings: interval)

            var dueNow = interval
            dueNow.autoBackupScheduleType = .daily
            let components = Calendar.current.dateComponents([.hour, .minute], from: .now)
            dueNow.autoBackupTime = String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)

            let before = try await CoreClient.backups(serverID: serverID)
            do {
                _ = try await CoreClient.updateServerSettings(serverID: serverID, settings: dueNow)
                await tick()
            } catch {
                _ = try? await CoreClient.updateServerSettings(serverID: serverID, settings: interval)
                throw error
            }
            _ = try await CoreClient.updateServerSettings(serverID: serverID, settings: interval)

            let after = try await CoreClient.backups(serverID: serverID)
            let previousNames = Set(before.map(\.name))
            return after.contains { $0.origin == "automatic" && !previousNames.contains($0.name) }
        }
    #endif
}
