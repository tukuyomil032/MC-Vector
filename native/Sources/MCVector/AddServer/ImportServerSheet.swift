// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// "Import an existing server folder" (React ImportServerModal): pick a
/// folder, check what was detected, then copy it into a new server.
struct ImportServerSheet: View {
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback
    @State private var model: ImportServerModel

    init(model: ImportServerModel = ImportServerModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        Group {
            if case let .creating(stage) = model.phase {
                CreationProgressView(
                    title: L10n.t("importServer.title"),
                    downloadingLabel: L10n.t("native.import.copying"),
                    workingLabel: L10n.t("native.import.copying"),
                    stage: stage
                )
            } else {
                ImportServerForm(model: model, pickFolder: pickFolder)
            }
        }
        .frame(width: 520)
        .interactiveDismissDisabled(model.isCreating)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                if model.isCreating {
                    Button(L10n.t("native.addServer.cancel")) { model.cancel() }
                } else {
                    Button(L10n.t("common.cancel")) { app.activeSheet = nil }
                }
            }
            if !model.isCreating {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("importServer.importButton")) {
                        Task { await importServer() }
                    }
                    .disabled(!model.isValid)
                }
            }
        }
        .alert(L10n.t("importServer.noJarTitle"), isPresented: $model.showsNoJar) {
            Button(L10n.t("common.close")) {}
        } message: {
            Text(L10n.t("importServer.noJarBody"))
        }
        .alert(
            L10n.t("importServer.toast.failed"),
            isPresented: Binding(
                get: { model.failure != nil },
                set: { if !$0 { model.failure = nil } }
            ),
            presenting: model.failure
        ) { _ in
            Button(L10n.t("common.close")) { model.failure = nil }
        } message: { error in
            Text(error.uiText)
        }
        .onDisappear { model.discard() }
    }

    private func pickFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = L10n.t("importServer.selectButton")
        panel.message = L10n.t("importServer.folderHint")
        guard panel.runModal() == .OK, let folder = panel.url else { return }
        Task { await model.choose(folder: folder) }
    }

    private func importServer() async {
        guard let created = await model.importServer() else { return }
        app.activeSheet = nil
        await app.reloadServers()
        app.selectedServerID = created.server.id
        feedback.toast(.success, L10n.t("importServer.toast.success"))
    }
}

private struct ImportServerForm: View {
    @Bindable var model: ImportServerModel
    let pickFolder: () -> Void

    var body: some View {
        Form {
            FormTitle(text: L10n.t("importServer.title"))
            Section {
                LabeledContent(L10n.t("importServer.folderLabel")) {
                    HStack(spacing: 8) {
                        Text(model.analysis?.folderName ?? L10n.t("importServer.folderPlaceholder"))
                            .foregroundStyle(model.analysis == nil ? .secondary : .primary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Button(L10n.t(model.analysis == nil ? "importServer.selectButton" : "native.import.chooseAnother")) {
                            pickFolder()
                        }
                        .disabled(model.phase == .analyzing)
                    }
                }
            } footer: {
                if model.phase == .analyzing {
                    ProgressView { Text(L10n.t("importServer.analyzing")) }
                        .progressViewStyle(.linear)
                } else {
                    Text(L10n.t(model.analysis == nil ? "importServer.folderHint" : "native.import.copyHint"))
                }
            }

            if let analysis = model.analysis {
                if !analysis.eulaAccepted {
                    Section {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L10n.t("importServer.eulaTitle")).fontWeight(.semibold)
                                Text(L10n.t("importServer.eulaWarning")).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                        }
                    }
                }

                Section {
                    TextField(L10n.t("importServer.nameLabel"), text: $model.name)
                } footer: {
                    if let error = model.nameError { FieldError(error) }
                }

                Section {
                    SoftwarePicker(
                        options: model.softwareOptions,
                        extra: analysis.detectedSoftware,
                        selection: $model.software
                    )
                    TextField(L10n.t("importServer.versionLabel"), text: $model.version, prompt: Text("1.21.10"))
                } footer: {
                    if !model.softwareWasDetected {
                        Text(L10n.t("native.import.softwareUnknown"))
                    }
                }

                PortMemorySection(portText: $model.portText, memoryText: $model.memoryText)
            }
        }
        .formStyle(.grouped)
        .fixedSize(horizontal: false, vertical: true)
    }
}
