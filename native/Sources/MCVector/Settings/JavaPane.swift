// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI
import UniformTypeIdentifiers

/// Java runtimes for the app (Settings › Java).
@MainActor
@Observable
final class JavaModel {
    struct Download: Equatable {
        let major: UInt32
        var phase: JavaInstallPhase = .download
        var fraction: Double?
        var operation: String = ""
    }

    private(set) var runtimes: [JavaRuntimeRecord] = []
    private(set) var releases: [JavaReleaseRecord] = []
    private(set) var offline = false
    private(set) var loaded = false
    private(set) var download: Download?
    /// Deleting or adding: one operation at a time, like the core's lock.
    private(set) var isWorking = false
    private var operation: JavaInstallOperation?

    var isBusy: Bool { download != nil || isWorking }

    func reload() async {
        async let runtimes = try? CoreClient.javaRuntimes()
        async let releases = try? CoreClient.javaAvailableReleases()
        let (list, available) = await (runtimes, releases)
        withAnimation(Motion.standard) {
            self.runtimes = (list ?? []).sorted { $0.major > $1.major }
            self.releases = available?.releases ?? []
            offline = available?.offline ?? true
            loaded = true
        }
    }

    func install(_ major: UInt32, feedback: FeedbackCenter) async {
        guard !isBusy else { return }
        let operation = CoreClient.installJava(major: major)
        self.operation = operation
        withAnimation(Motion.standard) { download = Download(major: major, operation: operation.operationID) }
        let watcher = Task {
            for await event in operation.progress {
                withAnimation(Motion.value) {
                    download?.phase = event.phase
                    download?.fraction = event.total > 0 ? Double(event.downloaded) / Double(event.total) : nil
                }
            }
        }
        defer {
            watcher.cancel()
            self.operation = nil
            withAnimation(Motion.standard) { download = nil }
        }
        do {
            _ = try await operation.value()
            feedback.toast(.success, L10n.t("javaManager.toast.downloadSuccess", ["version": major]))
            feedback.notifyInBackground(title: L10n.t("javaManager.toast.downloadSuccess", ["version": major]))
        } catch  where error.code == "operation.cancelled" {
            // Cancelled by the user: nothing to report.
        } catch {
            feedback.showError(L10n.t("javaManager.toast.downloadFailed"), message: error.uiText)
        }
        await reload()
    }

    func cancelInstall() async {
        await operation?.cancel()
    }

    func delete(_ runtime: JavaRuntimeRecord, feedback: FeedbackCenter) async {
        guard !isBusy else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await CoreClient.deleteJava(major: runtime.major)
            feedback.toast(.success, L10n.t("javaManager.toast.removed", ["version": runtime.major]))
        } catch {
            feedback.showError(
                L10n.t("javaManager.toast.removeFailed", ["version": runtime.major]), message: error.uiText)
        }
        await reload()
    }

    func addExisting(path: String, feedback: FeedbackCenter) async {
        guard !isBusy else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let runtime = try await CoreClient.addCustomJava(path: path)
            feedback.toast(.success, L10n.t("native.java.added", ["version": runtime.major]))
        } catch {
            feedback.showError(L10n.t("native.java.addFailed"), message: error.uiText)
        }
        await reload()
    }
}

/// Settings › Java: download Adoptium LTS runtimes, add an existing one, and
/// manage the installed runtimes the servers can use (React JavaManagerModal).
struct JavaPane: View {
    @Environment(FeedbackCenter.self) private var feedback
    @State private var model = JavaModel()
    @State private var pendingDelete: JavaRuntimeRecord?

    var body: some View {
        Form {
            Section {
                if !model.loaded {
                    HStack {
                        Spacer()
                        ProgressView().controlSize(.small)
                        Spacer()
                    }
                } else {
                    ForEach(model.releases, id: \.major) { release in
                        releaseRow(release)
                    }
                }
            } header: {
                Text(L10n.t("javaManager.availableVersions"))
            } footer: {
                if model.offline {
                    Label(L10n.t("native.java.offline"), systemImage: "wifi.slash")
                }
            }

            Section {
                if model.loaded, model.runtimes.isEmpty {
                    Text(L10n.t("javaManager.noRuntimes")).foregroundStyle(.secondary)
                }
                ForEach(model.runtimes, id: \.path) { runtime in
                    runtimeRow(runtime)
                }
            } header: {
                Text(L10n.t("javaManager.installedRuntimes"))
            } footer: {
                HStack {
                    Text(L10n.t("javaManager.manualSelect.description"))
                    Spacer()
                    Button(L10n.t("javaManager.manualSelect.button"), action: chooseExisting)
                        .disabled(model.isBusy)
                }
            }
        }
        .formStyle(.grouped)
        .animation(Motion.standard, value: model.runtimes.map(\.path))
        .task { await model.reload() }
        .confirmationDialog(
            L10n.t("javaManager.confirm.deleteTitle"),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { runtime in
            Button(L10n.t("common.delete"), role: .destructive) {
                Task { await model.delete(runtime, feedback: feedback) }
            }
            Button(L10n.t("common.cancel"), role: .cancel) {}
        } message: { runtime in
            Text(L10n.t("javaManager.confirm.uninstall", ["version": runtime.major]))
        }
    }

    // MARK: Rows

    @ViewBuilder private func releaseRow(_ release: JavaReleaseRecord) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "cup.and.saucer.fill")
                .foregroundStyle(.orange)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.t("javaManager.versionTitle", ["version": release.major])).font(.body.weight(.medium))
                Text(L10n.t("native.java.lts")).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if let download = model.download, download.major == release.major {
                DownloadProgress(download: download) { Task { await model.cancelInstall() } }
                    .transition(.opacity)
            } else if release.installed {
                Label(L10n.t("javaManager.installed"), systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .transition(.opacity)
            } else {
                Button(L10n.t("javaManager.download"), systemImage: "arrow.down.circle") {
                    Task { await model.install(release.major, feedback: feedback) }
                }
                .disabled(model.isBusy)
                .transition(.opacity)
            }
        }
        .animation(Motion.standard, value: model.download)
    }

    @ViewBuilder private func runtimeRow(_ runtime: JavaRuntimeRecord) -> some View {
        HStack(spacing: 12) {
            Image(systemName: runtime.origin == .managed ? "shippingbox.fill" : "folder.fill")
                .foregroundStyle(runtime.available ? Color.accentColor : .secondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(L10n.t("javaManager.versionTitle", ["version": runtime.major])).font(.body.weight(.medium))
                    if let version = runtime.version {
                        Text(version).font(.caption).foregroundStyle(.secondary)
                    }
                    Text(L10n.t(runtime.origin == .managed ? "native.java.managed" : "native.java.custom"))
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .foregroundStyle(.secondary)
                        .background(.quaternary, in: Capsule())
                }
                Text(runtime.path)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                if !runtime.available {
                    Label(L10n.t("native.java.missing"), systemImage: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
            Spacer()
            Menu {
                Button(L10n.t("native.serverSettings.showInFinder"), systemImage: "folder") {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: runtime.executable)])
                }
                .disabled(!runtime.available)
                Button(L10n.t("native.java.copyPath"), systemImage: "doc.on.doc") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(runtime.path, forType: .string)
                    feedback.toast(.success, L10n.t("javaManager.toast.pathCopied"))
                }
                Divider()
                Button(L10n.t("common.delete"), systemImage: "trash", role: .destructive) {
                    pendingDelete = runtime
                }
                .disabled(model.isBusy)
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func chooseExisting() {
        let panel = NSOpenPanel()
        panel.title = L10n.t("javaManager.manualSelect.title")
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.treatsFilePackagesAsDirectories = true
        panel.directoryURL = URL(fileURLWithPath: "/Library/Java/JavaVirtualMachines", isDirectory: true)
        guard panel.runModal() == .OK, let url = panel.url else {
            feedback.toast(.info, L10n.t("javaManager.toast.selectionCancelled"))
            return
        }
        Task { await model.addExisting(path: url.path, feedback: feedback) }
    }
}

/// Phase, a rolling percentage, a bar and Cancel for one Java download.
private struct DownloadProgress: View {
    let download: JavaModel.Download
    let cancel: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .trailing, spacing: 3) {
                HStack(spacing: 4) {
                    Text(L10n.t(phaseKey))
                    if let fraction = download.fraction, download.phase == .download {
                        Text(fraction, format: .percent.precision(.fractionLength(0)))
                            .monospacedDigit()
                            .contentTransition(.numericText(value: fraction))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                if let fraction = download.fraction, download.phase == .download {
                    ProgressView(value: fraction).frame(width: 140)
                } else {
                    ProgressView().progressViewStyle(.linear).frame(width: 140)
                }
            }
            Button(L10n.t("common.cancel"), action: cancel).controlSize(.small)
        }
        .animation(Motion.value, value: download.fraction)
    }

    private var phaseKey: String {
        switch download.phase {
        case .download: "javaManager.downloadingLabel"
        case .verify: "native.java.phase.verify"
        case .extract: "native.java.phase.extract"
        case .install: "native.java.phase.install"
        }
    }
}
