// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorCore
import SwiftUI

/// State of the Change Version wizard: Choose → Backup → Install → Done.
/// Each step's view owns what only it shows; this model holds what the next
/// step needs (the plan) and the work in flight.
@MainActor
@Observable
final class UpgradeWizardModel {
    enum Step: Int { case choose, backup, install, done }

    enum Load: Equatable {
        case loading
        case failed(CoreError)
        case loaded(ServerJarCandidates)
    }

    let serverID: String
    private(set) var step: Step = .choose
    private(set) var load: Load = .loading
    private(set) var status: ServerJarVersionStatus?
    private(set) var java: ServerJavaCompatibility?
    private(set) var javaAutomatic = true

    // Choose
    var software: String?
    var target: String?
    private(set) var availability: ServerJarVersionAvailability?
    private(set) var checkingAvailability = false
    private(set) var javaFixing: Double??

    // Later steps
    private(set) var plan: ServerJarUpgradePlan?
    /// Progress of the backup or the install (nil inside: indeterminate).
    private(set) var progress: Double??
    private(set) var phase: ServerJarUpgradePhase?
    private(set) var result: ServerJarUpgradeResult?
    /// The error of the current step, shown inside the wizard.
    var failure: CoreError?

    private var backup: BackupOperation?
    private var install: ServerJarUpgradeOperation?
    private var preparedAt = Date.now

    init(serverID: String) {
        self.serverID = serverID
    }

    var isWorking: Bool { progress != nil || javaFixing != nil || checkingAvailability }

    var candidates: [ServerJarCandidate] {
        if case .loaded(let list) = load { return list.candidates }
        return []
    }

    var selected: ServerJarCandidate? { candidates.first { $0.version == target } }
    var isDowngrade: Bool { selected.map { !$0.newer } ?? false }

    var currentSoftware: String? {
        if case .loaded(let list) = load { return list.targetSoftwareCandidates.first ?? list.software }
        return nil
    }

    var isSoftwareChange: Bool {
        guard let software, let currentSoftware else { return false }
        return software != currentSoftware
    }

    /// Downgrades and software changes cannot skip the backup.
    var backupRequired: Bool { isDowngrade || isSoftwareChange }

    /// The Java the target needs, when the server's runtime is older.
    var javaShortfall: UInt32? {
        guard let required = selected?.requiredJavaMajor else { return nil }
        if let configured = java?.configuredMajor, configured >= required { return nil }
        if java?.configuredMajor == nil, java?.satisfied == true { return nil }
        return required
    }

    // MARK: Choose

    func load(software: String? = nil) async {
        load = .loading
        do {
            let list = try await CoreClient.serverJarUpgradeCandidates(serverID: serverID, targetSoftware: software)
            if status == nil { status = try? await CoreClient.serverJarVersionStatus(serverID: serverID) }
            if java == nil {
                java = try? await CoreClient.javaCompatibility(serverID: serverID)
                if let settings = try? await CoreClient.serverSettings(serverID: serverID) {
                    javaAutomatic = settings.javaPath?.isEmpty ?? true
                }
            }
            withAnimation(Motion.standard) {
                load = .loaded(list)
                self.software = software ?? list.targetSoftwareCandidates.first ?? list.software
                target = list.candidates.first(where: \.latest)?.version ?? list.candidates.first?.version
            }
        } catch {
            withAnimation(Motion.standard) { load = .failed(error) }
        }
    }

    /// Asks whether the selected version can be installed (stable, only a
    /// development build, or not at all).
    func checkAvailability() async {
        availability = nil
        guard let software, let target else { return }
        checkingAvailability = true
        defer { checkingAvailability = false }
        let result = try? await CoreClient.serverJarVersionAvailability(software: software, version: target)
        guard target == self.target, software == self.software else { return }
        withAnimation(Motion.standard) { availability = result }
    }

    /// Installs (or reuses) the Java the target needs; Automatic servers then
    /// pick it by themselves, others are switched to it.
    func fixJava(_ major: UInt32, feedback: FeedbackCenter) async {
        guard javaFixing == nil else { return }
        javaFixing = .some(nil)
        defer { javaFixing = nil }
        do {
            let path: String
            if let existing = try await CoreClient.javaRuntimes().first(where: { $0.major == major && $0.available }) {
                path = existing.path
            } else {
                let operation = CoreClient.installJava(major: major)
                let watcher = Task {
                    for await event in operation.progress where event.total > 0 {
                        javaFixing = Double(event.downloaded) / Double(event.total)
                    }
                }
                defer { watcher.cancel() }
                path = try await operation.value().path
            }
            if !javaAutomatic {
                var update = GeneralSettingsModel.update(from: try await CoreClient.serverSettings(serverID: serverID))
                update.javaPath = path
                _ = try await CoreClient.updateServerSettings(serverID: serverID, settings: update)
            }
            java = try? await CoreClient.javaCompatibility(serverID: serverID)
            feedback.toast(.success, L10n.t("javaManager.toast.downloadSuccess", ["version": major]))
        } catch {
            withAnimation(Motion.standard) { failure = error }
        }
    }

    /// Prepares the plan and moves to the backup step.
    func next(allowUnstable: Bool) async {
        guard let target else { return }
        failure = nil
        checkingAvailability = true
        defer { checkingAvailability = false }
        do {
            let plan = try await CoreClient.prepareServerJarUpgrade(
                serverID: serverID, targetVersion: target, targetSoftware: software,
                allowUnstable: allowUnstable, allowDowngrade: isDowngrade)
            preparedAt = .now
            withAnimation(Motion.spring) {
                self.plan = plan
                step = .backup
            }
        } catch {
            withAnimation(Motion.standard) { failure = error }
        }
    }

    // MARK: Backup

    func runBackup() async {
        failure = nil
        let name = "before-\(plan?.targetVersion ?? "change")-\(Int(Date.now.timeIntervalSince1970)).zip"
        let operation = CoreClient.createBackup(serverID: serverID, backupName: name)
        backup = operation
        progress = .some(0)
        let watcher = Task {
            for await event in operation.progress {
                progress = Double(event.progress)
            }
        }
        defer {
            watcher.cancel()
            backup = nil
            progress = nil
        }
        do {
            switch try await operation.value() {
            case .confirmationRequired:
                failure = CoreError(
                    code: "server.running",
                    message: L10n.t("serverSettings.versionUpgrade.serverMustBeOffline"), retryable: true)
            case .created:
                withAnimation(Motion.spring) { step = .install }
            }
        } catch  where error.code == "operation.cancelled" {
            // Back to the start of this step.
        } catch {
            withAnimation(Motion.standard) { failure = error }
        }
    }

    func skipBackup() {
        guard !backupRequired else { return }
        withAnimation(Motion.spring) { step = .install }
    }

    func cancelBackup() async {
        await backup?.cancel()
    }

    // MARK: Install

    func runInstall() async {
        guard var plan else { return }
        failure = nil
        // A plan lives a few minutes; the backup may have taken longer.
        if Date.now > preparedAt.addingTimeInterval(TimeInterval(max(plan.expiresInSeconds, 1)) - 5) {
            do {
                plan = try await CoreClient.prepareServerJarUpgrade(
                    serverID: serverID, targetVersion: plan.targetVersion, targetSoftware: plan.software,
                    allowUnstable: plan.channel != "stable", allowDowngrade: plan.downgrade)
                self.plan = plan
                preparedAt = .now
            } catch {
                withAnimation(Motion.standard) { failure = error }
                return
            }
        }
        let operation = CoreClient.executeServerJarUpgrade(planID: plan.planId)
        install = operation
        progress = .some(nil)
        phase = .download
        let watcher = Task {
            for await event in operation.progress {
                phase = event.phase
                progress = event.total > 0 ? Double(event.downloaded) / Double(event.total) : .some(nil)
            }
        }
        defer {
            watcher.cancel()
            install = nil
            progress = nil
            phase = nil
        }
        do {
            let result = try await operation.value()
            withAnimation(Motion.spring) {
                self.result = result
                step = .done
            }
        } catch  where error.code == "operation.cancelled" {
            // The old JAR stays; back to the start of this step.
        } catch {
            withAnimation(Motion.standard) { failure = error }
        }
    }

    /// Cancel works until the swap begins.
    var canCancelInstall: Bool { phase != .install }

    func cancelInstall() async {
        await install?.cancel()
    }
}
