// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// The server version upgrade (React VersionUpgradeWizard): Check → Backup →
/// Download → Done. Beyond React it lets the user pick the target version,
/// links its release notes, fixes a Java runtime that is too old for the
/// target, and can skip the backup.
@MainActor
@Observable
final class UpgradeWizardModel {
    enum Step: Int { case check, backup, download, done }

    enum Check: Equatable {
        case loading
        case failed(CoreError)
        case loaded(ServerJarCandidates)
    }

    let serverID: String
    private(set) var step: Step = .check
    private(set) var check: Check = .loading
    var target: String?
    private(set) var java: ServerJavaCompatibility?
    private(set) var javaFixing: Double??
    private(set) var plan: ServerJarUpgradePlan?
    var skipBackup = false
    /// Backup or download progress (nil while indeterminate).
    private(set) var progress: Double??
    private(set) var result: ServerJarUpgradeResult?
    private(set) var isPreparing = false

    init(serverID: String) {
        self.serverID = serverID
    }

    var isBusy: Bool { progress != nil || javaFixing != nil || isPreparing }

    var candidates: [ServerJarCandidate] {
        if case .loaded(let list) = check { return list.candidates }
        return []
    }

    var selected: ServerJarCandidate? { candidates.first { $0.version == target } }

    /// The Java the selected target needs, when the server's runtime is older.
    var javaShortfall: UInt32? {
        guard let required = selected?.requiredJavaMajor else { return nil }
        if let configured = java?.configuredMajor, configured >= required { return nil }
        if java?.configuredMajor == nil, java?.satisfied == true { return nil }
        return required
    }

    func load() async {
        check = .loading
        do {
            let list = try await CoreClient.serverJarUpgradeCandidates(serverID: serverID)
            java = try? await CoreClient.javaCompatibility(serverID: serverID)
            withAnimation(Motion.standard) {
                check = .loaded(list)
                target = list.candidates.first(where: \.latest)?.version ?? list.candidates.first?.version
            }
        } catch {
            withAnimation(Motion.standard) { check = .failed(error) }
        }
    }

    /// Installs (or reuses) the Java the target needs and sets it for the server.
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
                        withAnimation(Motion.value) { javaFixing = Double(event.downloaded) / Double(event.total) }
                    }
                }
                defer { watcher.cancel() }
                path = try await operation.value().path
            }
            var update = GeneralSettingsModel.update(from: try await CoreClient.serverSettings(serverID: serverID))
            update.javaPath = path
            _ = try await CoreClient.updateServerSettings(serverID: serverID, settings: update)
            java = try? await CoreClient.javaCompatibility(serverID: serverID)
            feedback.toast(.success, L10n.t("native.upgrade.javaSet", ["major": major]))
        } catch {
            feedback.showError(L10n.t("javaManager.toast.downloadFailed"), message: error.uiText)
        }
    }

    /// Prepares the plan for the target and moves to the backup step.
    func start(feedback: FeedbackCenter) async {
        guard let target else { return }
        isPreparing = true
        defer { isPreparing = false }
        do {
            let plan = try await CoreClient.prepareServerJarUpgrade(serverID: serverID, targetVersion: target)
            preparedAt = .now
            withAnimation(Motion.spring) {
                self.plan = plan
                step = .backup
            }
        } catch {
            feedback.showError(L10n.t("serverSettings.versionUpgrade.downloadFailed"), message: error.uiText)
        }
    }

    func runBackup(feedback: FeedbackCenter) async {
        guard !skipBackup else {
            withAnimation(Motion.spring) { step = .download }
            return
        }
        let name = "before-upgrade-\(plan?.targetVersion ?? "server").zip"
        let operation = CoreClient.createBackup(serverID: serverID, backupName: name)
        progress = .some(0)
        let watcher = Task {
            for await event in operation.progress {
                withAnimation(Motion.value) { progress = Double(event.progress) }
            }
        }
        defer {
            watcher.cancel()
            progress = nil
        }
        do {
            switch try await operation.value() {
            case .confirmationRequired:
                feedback.showError(
                    L10n.t("serverSettings.versionUpgrade.backupFailed"),
                    message: L10n.t("serverSettings.versionUpgrade.serverMustBeOffline"))
            case .created:
                withAnimation(Motion.spring) { step = .download }
            }
        } catch {
            feedback.showError(L10n.t("serverSettings.versionUpgrade.backupFailed"), message: error.uiText)
        }
    }

    func runDownload(feedback: FeedbackCenter) async {
        guard var plan else { return }
        // A plan lives a few minutes; the backup may have taken longer.
        if plan.expiresInSeconds == 0 || Date.now > preparedAt.addingTimeInterval(TimeInterval(plan.expiresInSeconds)) {
            guard
                let fresh = try? await CoreClient.prepareServerJarUpgrade(
                    serverID: serverID, targetVersion: plan.targetVersion)
            else { return }
            plan = fresh
            self.plan = fresh
            preparedAt = .now
        }
        let operation = CoreClient.executeServerJarUpgrade(planID: plan.planId)
        progress = .some(nil)
        let watcher = Task {
            for await event in operation.progress {
                withAnimation(Motion.value) {
                    progress = event.total > 0 ? Double(event.downloaded) / Double(event.total) : .some(nil)
                }
            }
        }
        defer {
            watcher.cancel()
            progress = nil
        }
        do {
            let result = try await operation.value()
            withAnimation(Motion.spring) {
                self.result = result
                step = .done
            }
        } catch {
            feedback.showError(L10n.t("serverSettings.versionUpgrade.downloadFailed"), message: error.uiText)
        }
    }

    private var preparedAt = Date.now
}

struct UpgradeWizard: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(FeedbackCenter.self) private var feedback
    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    @State private var model: UpgradeWizardModel
    /// Called after a successful upgrade so the settings page reloads.
    let onUpgraded: () -> Void

    init(serverID: String, onUpgraded: @escaping () -> Void) {
        _model = State(initialValue: UpgradeWizardModel(serverID: serverID))
        self.onUpgraded = onUpgraded
    }

    private var isRunning: Bool { !["offline", "crashed"].contains(runtime.status(of: model.serverID)) }

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 18) {
            Text(L10n.t("serverSettings.versionUpgrade.title")).font(.title3.weight(.semibold))
            StepIndicator(
                titles: ["stepCheck", "stepBackup", "stepDownload", "stepDone"].map {
                    L10n.t("serverSettings.versionUpgrade.\($0)")
                },
                current: model.step == .done ? 4 : model.step.rawValue
            )
            Group {
                switch model.step {
                case .check: checkStep
                case .backup: backupStep
                case .download: downloadStep
                case .done: doneStep
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(
                .asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)).combined(with: .opacity))
            if model.isBusy {
                Text(L10n.t("serverSettings.versionUpgrade.blockedWhileRunning"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button(L10n.t("serverSettings.versionUpgrade.close")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                    .disabled(model.isBusy)
                primaryButton
            }
        }
        .padding(22)
        .frame(width: 520)
        .clipped()
        .animation(Motion.standard, value: model.check)
        .animation(Motion.standard, value: model.step)
        .interactiveDismissDisabled(model.isBusy)
        .task { await model.load() }
        .environment(\.locale, Locale(identifier: L10n.language))
    }

    @ViewBuilder private var primaryButton: some View {
        switch model.step {
        case .check:
            Button(L10n.t("serverSettings.versionUpgrade.startUpgrade")) {
                Task { await model.start(feedback: feedback) }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(model.selected == nil || isRunning || model.isBusy)
        case .backup:
            Button(
                L10n.t(model.skipBackup ? "native.upgrade.continue" : "serverSettings.versionUpgrade.runBackup")
            ) {
                Task { await model.runBackup(feedback: feedback) }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(isRunning || model.isBusy)
        case .download:
            Button(L10n.t("serverSettings.versionUpgrade.runDownload")) {
                Task {
                    await model.runDownload(feedback: feedback)
                    if model.step == .done {
                        onUpgraded()
                        await app.reloadServers(selectFirstIfMissing: false)
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(isRunning || model.isBusy || model.plan?.verified == false)
        case .done:
            Button(L10n.t("serverSettings.versionUpgrade.close")) { dismiss() }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
        }
    }

    // MARK: Steps

    @ViewBuilder private var checkStep: some View {
        switch model.check {
        case .loading:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text(L10n.t("serverSettings.versionUpgrade.fetching")).foregroundStyle(.secondary)
            }
        case .failed(let error):
            VStack(alignment: .leading, spacing: 8) {
                Label(L10n.t("native.upgrade.checkFailed"), systemImage: "wifi.exclamationmark")
                Text(error.uiText).font(.caption).foregroundStyle(.secondary)
                Button(L10n.t("plugins.browser.retry")) { Task { await model.load() } }
            }
        case .loaded(let list) where !list.supported:
            Label(L10n.t("serverSettings.versionUpgrade.unsupported"), systemImage: "nosign")
                .foregroundStyle(.secondary)
        case .loaded(let list):
            VStack(alignment: .leading, spacing: 12) {
                Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                    GridRow {
                        versionTile("serverSettings.versionUpgrade.currentVersion") {
                            Text(list.currentVersion)
                        }
                        versionTile("native.upgrade.targetVersion") {
                            if list.candidates.isEmpty {
                                Text(list.currentVersion)
                            } else {
                                Picker(L10n.t("native.upgrade.targetVersion"), selection: $model.target) {
                                    ForEach(list.candidates, id: \.version) { candidate in
                                        Text(
                                            candidate.latest
                                                ? L10n.t("native.upgrade.latestTag", ["version": candidate.version])
                                                : candidate.version
                                        )
                                        .tag(String?.some(candidate.version))
                                    }
                                }
                                .labelsHidden()
                                .fixedSize()
                            }
                        }
                    }
                }
                if list.candidates.isEmpty {
                    Label(L10n.t("serverSettings.versionUpgrade.alreadyLatest"), systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                } else if let url = model.selected?.releaseNotesUrl.flatMap(URL.init(string:)) {
                    Button(L10n.t("native.upgrade.releaseNotes"), systemImage: "arrow.up.right.square") { openURL(url) }
                        .buttonStyle(.link)
                }
                if let required = model.javaShortfall {
                    javaWarning(required)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
                if isRunning {
                    Label(L10n.t("serverSettings.versionUpgrade.serverMustBeOffline"), systemImage: "stop.circle")
                        .foregroundStyle(.orange)
                }
            }
            .animation(Motion.standard, value: model.javaShortfall)
        }
    }

    private func versionTile(_ titleKey: String, @ViewBuilder value: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(L10n.t(titleKey)).font(.caption).foregroundStyle(.secondary)
            value().font(.title3.weight(.semibold).monospacedDigit())
        }
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .padding(12)
        .background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func javaWarning(_ required: UInt32) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                Text(
                    model.java?.configuredMajor.map {
                        L10n.t(
                            "native.upgrade.javaTooOld",
                            ["target": model.target ?? "", "required": required, "configured": $0])
                    } ?? L10n.t("native.upgrade.javaUnknown", ["target": model.target ?? "", "required": required]))
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            }
            HStack {
                Button(L10n.t("native.upgrade.javaFix", ["major": required])) {
                    Task { await model.fixJava(required, feedback: feedback) }
                }
                .disabled(model.isBusy)
                if let fixing = model.javaFixing {
                    if let fraction = fixing {
                        ProgressView(value: fraction).frame(width: 120)
                        Text(fraction, format: .percent.precision(.fractionLength(0)))
                            .monospacedDigit()
                            .contentTransition(.numericText(value: fraction))
                            .font(.caption)
                    } else {
                        ProgressView().controlSize(.small)
                    }
                }
            }
        }
        .padding(12)
        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var backupStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.t("serverSettings.versionUpgrade.backupDescription"))
            Toggle(L10n.t("native.upgrade.skipBackup"), isOn: Bindable(model).skipBackup)
                .disabled(model.isBusy)
            if model.skipBackup {
                Text(L10n.t("native.upgrade.skipBackupNote")).font(.caption).foregroundStyle(.orange)
            }
            progressRow(labelKey: "serverSettings.versionUpgrade.backupProgressLabel")
        }
    }

    private var downloadStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.t("serverSettings.versionUpgrade.downloadDescription"))
            if let plan = model.plan {
                HStack {
                    Text("\(plan.currentVersion) → \(plan.targetVersion)").font(.headline.monospacedDigit())
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(plan.fileName).font(.caption.monospaced()).foregroundStyle(.secondary)
                        if let size = plan.size {
                            Text(Int64(size), format: .byteCount(style: .file)).font(.caption).foregroundStyle(
                                .secondary)
                        }
                    }
                }
                if !plan.verified {
                    Label(
                        L10n.t("serverSettings.versionUpgrade.unverifiedReason"), systemImage: "exclamationmark.shield"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                }
            }
            progressRow(labelKey: "serverSettings.versionUpgrade.downloadProgressLabel")
        }
    }

    private var doneStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(L10n.t("serverSettings.versionUpgrade.doneDescription"), systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.headline)
            if let result = model.result {
                Text(L10n.t("native.upgrade.upgradedFrom", ["from": result.previousVersion, "to": result.version]))
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private func progressRow(labelKey: String) -> some View {
        if let progress = model.progress {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(L10n.t(labelKey)).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if let fraction = progress {
                        Text(fraction, format: .percent.precision(.fractionLength(0)))
                            .font(.caption.monospacedDigit())
                            .contentTransition(.numericText(value: fraction))
                    }
                }
                if let fraction = progress {
                    ProgressView(value: fraction)
                } else {
                    ProgressView().progressViewStyle(.linear)
                }
            }
            .transition(.opacity)
        }
    }
}
