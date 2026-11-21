// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Change Version (React VersionUpgradeWizard, reworked): Choose → Backup →
/// Install → Done. Each step shows only its own controls; nothing chosen on
/// one step stays on the next. Errors show inside the wizard. While work
/// runs, the only button is Cancel.
struct UpgradeWizard: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var model: UpgradeWizardModel
    /// Called after the version changed so the settings page reloads.
    let onChanged: () -> Void

    init(serverID: String, onChanged: @escaping () -> Void) {
        _model = State(initialValue: UpgradeWizardModel(serverID: serverID))
        self.onChanged = onChanged
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(L10n.t("native.upgrade.title")).font(.title3.weight(.semibold))
            StepIndicator(
                titles: [
                    L10n.t("native.upgrade.stepChoose"), L10n.t("serverSettings.versionUpgrade.stepBackup"),
                    L10n.t("native.upgrade.stepInstall"), L10n.t("serverSettings.versionUpgrade.stepDone"),
                ],
                current: model.step == .done ? 4 : model.step.rawValue
            )
            Group {
                switch model.step {
                case .choose: ChooseStep(model: model, close: { dismiss() })
                case .backup: BackupStep(model: model, close: { dismiss() })
                case .install:
                    InstallStep(model: model, close: { dismiss() }) {
                        onChanged()
                        Task { await app.reloadServers(selectFirstIfMissing: false) }
                    }
                case .done: DoneStep(model: model, close: { dismiss() })
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(
                .asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading))
                    .combined(with: .opacity))
        }
        .padding(22)
        .frame(width: 540)
        .clipped()
        .animation(Motion.spring, value: model.step)
        .interactiveDismissDisabled(model.isWorking)
        .task { await model.load() }
    }
}

/// Error of the current step.
private struct StepFailure: View {
    let model: UpgradeWizardModel
    let titleKey: String

    var body: some View {
        if let failure = model.failure {
            InlineErrorBanner(title: L10n.t(titleKey), message: failure.uiText)
        }
    }
}

/// The bottom row, buttons aligned to the trailing edge.
private struct StepButtons<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        HStack {
            Spacer()
            content
        }
        .controlSize(.large)
    }
}

/// An icon and a sentence, tinted by importance.
private struct Notice: View {
    let systemImage: String
    let text: String
    var tint: Color = .secondary

    var body: some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: systemImage).foregroundStyle(tint)
        }
        .font(.callout)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

// MARK: Choose

private struct ChooseStep: View {
    @Bindable var model: UpgradeWizardModel
    let close: () -> Void
    @Environment(\.openURL) private var openURL
    @Environment(FeedbackCenter.self) private var feedback
    @Environment(ServerRuntime.self) private var runtime
    /// Only for this step: use a development build when there is no stable one.
    @State private var useUnstable = false

    private var isRunning: Bool { !["offline", "crashed"].contains(runtime.status(of: model.serverID)) }

    private var canContinue: Bool {
        guard model.selected != nil, !isRunning, !model.isWorking else { return false }
        switch model.availability {
        case .some(.stable): return true
        case .some(.unstable): return useUnstable
        case .some(.none), nil: return false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch model.load {
            case .loading:
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(L10n.t("serverSettings.versionUpgrade.fetching")).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 120)
            case .failed(let error):
                InlineErrorBanner(title: L10n.t("native.upgrade.checkFailed"), message: error.uiText)
                StepButtons {
                    Button(L10n.t("common.cancel"), action: close).keyboardShortcut(.cancelAction)
                    Button(L10n.t("plugins.browser.retry")) { Task { await model.load() } }
                        .keyboardShortcut(.defaultAction)
                }
            case .loaded(let list):
                form(list)
            }
        }
        .task(id: "\(model.software ?? "")-\(model.target ?? "")") {
            useUnstable = false
            model.failure = nil
            await model.checkAvailability()
        }
    }

    @ViewBuilder private func form(_ list: ServerJarCandidates) -> some View {
        Form {
            LabeledContent(L10n.t("serverSettings.versionUpgrade.currentVersion")) {
                Text("\(model.currentSoftware ?? list.software) \(list.currentVersion)").monospacedDigit()
            }
            if list.targetSoftwareCandidates.count > 1 {
                Picker(L10n.t("serverSettings.serverSoftware"), selection: softwareBinding) {
                    ForEach(list.targetSoftwareCandidates, id: \.self) { Text($0).tag(String?.some($0)) }
                }
            }
            if list.supported, !list.candidates.isEmpty {
                Picker(L10n.t("native.upgrade.targetVersion"), selection: $model.target) {
                    let newer = list.candidates.filter(\.newer)
                    let older = list.candidates.filter { !$0.newer }
                    if !newer.isEmpty {
                        Section(L10n.t("native.upgrade.newer")) {
                            ForEach(newer, id: \.version) { candidate in
                                Text(label(candidate)).tag(String?.some(candidate.version))
                            }
                        }
                    }
                    if !older.isEmpty {
                        Section(L10n.t("native.upgrade.older")) {
                            ForEach(older, id: \.version) { candidate in
                                Text(candidate.version).tag(String?.some(candidate.version))
                            }
                        }
                    }
                }
                if let url = model.selected?.releaseNotesUrl.flatMap(URL.init(string:)) {
                    LabeledContent(L10n.t("native.upgrade.releaseNotes")) {
                        Button(L10n.t("native.upgrade.openReleaseNotes"), systemImage: "arrow.up.right.square") {
                            openURL(url)
                        }
                        .buttonStyle(.link)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .scrollDisabled(true)
        .fixedSize(horizontal: false, vertical: true)
        .disabled(model.isWorking)

        notices(list)
        StepFailure(model: model, titleKey: "native.upgrade.prepareFailed")

        StepButtons {
            Button(L10n.t("common.cancel"), action: close).keyboardShortcut(.cancelAction)
            Button(L10n.t("native.upgrade.next")) {
                Task { await model.next(allowUnstable: useUnstable) }
            }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(!canContinue)
        }
    }

    private var softwareBinding: Binding<String?> {
        Binding(
            get: { model.software },
            set: { value in Task { await model.load(software: value) } })
    }

    private func label(_ candidate: ServerJarCandidate) -> String {
        candidate.latest ? L10n.t("native.upgrade.latestTag", ["version": candidate.version]) : candidate.version
    }

    /// What the user must know about this choice, most important first.
    @ViewBuilder private func notices(_ list: ServerJarCandidates) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if !list.supported {
                Notice(systemImage: "nosign", text: L10n.t("serverSettings.versionUpgrade.unsupported"))
            } else if list.candidates.isEmpty {
                Notice(systemImage: "checkmark.seal", text: L10n.t("serverSettings.versionUpgrade.alreadyLatest"))
            }
            if isRunning {
                Notice(
                    systemImage: "stop.circle", text: L10n.t("serverSettings.versionUpgrade.serverMustBeOffline"),
                    tint: .orange)
            }
            switch model.availability {
            case .some(.unstable(let channel)):
                VStack(alignment: .leading, spacing: 6) {
                    Notice(
                        systemImage: "flask",
                        text: L10n.t(
                            "native.upgrade.unstable",
                            ["version": model.target ?? "", "channel": channel.uppercased()]),
                        tint: .orange)
                    Toggle(L10n.t("native.upgrade.useUnstable"), isOn: $useUnstable)
                        .padding(.leading, 26)
                }
            case .some(.none(let reason)):
                Notice(
                    systemImage: "xmark.octagon",
                    text: L10n.t("native.upgrade.unavailable", ["version": model.target ?? "", "reason": reason]),
                    tint: .red)
            case .some(.stable), nil:
                EmptyView()
            }
            if model.isDowngrade {
                Notice(
                    systemImage: "exclamationmark.triangle", text: L10n.t("native.upgrade.downgradeWarning"),
                    tint: .orange)
            }
            if let required = model.javaShortfall {
                javaNotice(required)
            }
        }
        .animation(Motion.standard, value: model.availability)
        .animation(Motion.standard, value: model.isDowngrade)
    }

    private func javaNotice(_ required: UInt32) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Notice(
                systemImage: "cup.and.saucer",
                text: model.java?.configuredMajor.map {
                    L10n.t(
                        "native.upgrade.javaTooOld",
                        ["target": model.target ?? "", "required": required, "configured": $0])
                } ?? L10n.t("native.upgrade.javaUnknown", ["target": model.target ?? "", "required": required]),
                tint: .orange)
            Group {
                if let fixing = model.javaFixing {
                    RollingPercent(label: L10n.t("native.java.downloading", ["major": required]), fraction: fixing)
                        .frame(width: 240)
                } else {
                    Button(
                        L10n.t(
                            model.javaAutomatic ? "native.upgrade.javaDownload" : "native.upgrade.javaFix",
                            ["major": required])
                    ) {
                        Task { await model.fixJava(required, feedback: feedback) }
                    }
                }
            }
            .padding(.leading, 26)
        }
    }
}

// MARK: Backup

private struct BackupStep: View {
    let model: UpgradeWizardModel
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let progress = model.progress {
                RollingPercent(label: L10n.t("serverSettings.versionUpgrade.backupProgressLabel"), fraction: progress)
                StepButtons {
                    Button(L10n.t("common.cancel")) { Task { await model.cancelBackup() } }
                        .keyboardShortcut(.cancelAction)
                }
            } else {
                Text(L10n.t("serverSettings.versionUpgrade.backupDescription"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                StepFailure(model: model, titleKey: "serverSettings.versionUpgrade.backupFailed")
                StepButtons {
                    Button(L10n.t("common.cancel"), action: close).keyboardShortcut(.cancelAction)
                    if !model.backupRequired {
                        Button(L10n.t("native.upgrade.skipBackup")) { model.skipBackup() }
                    }
                    Button(L10n.t("native.upgrade.backupAndContinue")) { Task { await model.runBackup() } }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.defaultAction)
                }
            }
        }
        .animation(Motion.standard, value: model.progress == nil)
    }
}

// MARK: Install

private struct InstallStep: View {
    let model: UpgradeWizardModel
    let close: () -> Void
    let changed: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let plan = model.plan {
                HStack(alignment: .firstTextBaseline) {
                    Text(summary(plan)).font(.title3.weight(.semibold).monospacedDigit())
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(plan.fileName).font(.caption.monospaced()).foregroundStyle(.secondary)
                        if let size = plan.size {
                            Text(Int64(size), format: .byteCount(style: .file))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                if !plan.verified {
                    Notice(
                        systemImage: "exclamationmark.shield",
                        text: L10n.t("serverSettings.versionUpgrade.unverifiedReason"), tint: .orange)
                }
            }
            if let progress = model.progress {
                RollingPercent(label: phaseLabel, fraction: progress)
                StepButtons {
                    Button(L10n.t("common.cancel")) { Task { await model.cancelInstall() } }
                        .keyboardShortcut(.cancelAction)
                        .disabled(!model.canCancelInstall)
                }
            } else {
                StepFailure(model: model, titleKey: "serverSettings.versionUpgrade.downloadFailed")
                StepButtons {
                    Button(L10n.t("common.cancel"), action: close).keyboardShortcut(.cancelAction)
                    Button(L10n.t("native.upgrade.replace")) {
                        Task {
                            await model.runInstall()
                            if model.step == .done { changed() }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.plan?.verified == false)
                }
            }
        }
        .animation(Motion.standard, value: model.progress == nil)
    }

    private func summary(_ plan: ServerJarUpgradePlan) -> String {
        if let change = plan.softwareChange {
            return "\(change.from) \(plan.currentVersion) → \(change.to) \(plan.targetVersion)"
        }
        return "\(plan.currentVersion) → \(plan.targetVersion)"
    }

    private var phaseLabel: String {
        switch model.phase {
        case .verify: L10n.t("native.java.phase.verify")
        case .install: L10n.t("native.upgrade.replacing")
        case .download, nil: L10n.t("serverSettings.versionUpgrade.downloadProgressLabel")
        }
    }
}

// MARK: Done

private struct DoneStep: View {
    let model: UpgradeWizardModel
    let close: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.green)
                    .symbolEffect(.bounce, value: model.result != nil)
                if let result = model.result {
                    Text(summary(result)).font(.title3.weight(.semibold).monospacedDigit())
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            StepButtons {
                Button(L10n.t("native.upgrade.done"), action: close)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }

    private func summary(_ result: ServerJarUpgradeResult) -> String {
        if result.previousSoftware != result.software {
            return "\(result.previousSoftware) \(result.previousVersion) → \(result.software) \(result.version)"
        }
        return "\(result.previousVersion) → \(result.version)"
    }
}
