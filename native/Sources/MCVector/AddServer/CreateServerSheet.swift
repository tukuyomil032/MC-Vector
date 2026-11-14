// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// "Create a new server" (React AddServerModal): the same fields in the same
/// order, as a grouped form. While the server is created the form is replaced
/// by the progress, which can be stopped.
struct CreateServerSheet: View {
    @Environment(AppState.self) private var app
    @Environment(FeedbackCenter.self) private var feedback
    @State private var model: CreateServerModel

    init(model: CreateServerModel = CreateServerModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        Group {
            if case let .creating(stage) = model.phase {
                CreationProgressView(
                    title: L10n.t("addServer.title"),
                    downloadingLabel: L10n.t(
                        "server.toast.downloadingServer",
                        ["software": model.software, "version": model.version]
                    ),
                    workingLabel: L10n.t("native.addServer.resolving"),
                    stage: stage
                )
            } else {
                CreateServerForm(model: model)
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
                    Button(L10n.t("common.create")) {
                        Task { await create() }
                    }
                    .disabled(model.showsErrors && !model.isValid)
                }
            }
        }
        .alert(
            L10n.t("server.toast.createFailed"),
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
        .task { await model.loadTemplates() }
    }

    private func create() async {
        guard let created = await model.create() else { return }
        app.activeSheet = nil
        await app.reloadServers()
        app.selectedServerID = created.server.id
        if created.jarInstalled {
            feedback.toast(.success, L10n.t("server.toast.created", ["name": created.server.name]))
        } else {
            feedback.toast(.info, L10n.t("native.addServer.createdManualJar", ["name": created.server.name]))
        }
    }
}

private struct CreateServerForm: View {
    @Bindable var model: CreateServerModel

    var body: some View {
        Form {
            FormTitle(text: L10n.t("addServer.title"))
            if !model.templates.isEmpty {
                Section {
                    Picker(L10n.t("addServer.template.label"), selection: $model.templateID) {
                        Text(L10n.t("addServer.template.none")).tag(String?.none)
                        ForEach(model.templates, id: \.id) { template in
                            Text(template.name).tag(String?.some(template.id))
                        }
                    }
                }
            }

            Section {
                TextField(L10n.t("addServer.name.label"), text: $model.name, prompt: Text(L10n.t("addServer.name.placeholder")))
                    .onChange(of: model.name) { model.showsErrors = true }
                TextField(
                    L10n.t("addServer.profileName.label"),
                    text: $model.profileName,
                    prompt: Text(L10n.t("addServer.profileName.placeholder"))
                )
                TextField(
                    L10n.t("addServer.groupName.label"),
                    text: $model.groupName,
                    prompt: Text(L10n.t("addServer.groupName.placeholder"))
                )
            } footer: {
                if model.showsErrors, let error = model.nameError {
                    FieldError(error)
                } else {
                    Text(L10n.t("native.addServer.savePath"))
                }
            }

            Section {
                SoftwarePicker(options: model.softwareOptions, selection: $model.software)
                Picker(L10n.t("addServer.version.label"), selection: $model.version) {
                    ForEach(model.versions, id: \.self) { version in
                        Text(version).tag(version)
                    }
                }
            } footer: {
                Text(L10n.t(
                    model.selectedSoftware?.automaticJar == true
                        ? "native.addServer.automaticJar" : "native.addServer.manualJar"
                ))
            }

            PortMemorySection(portText: $model.portText, memoryText: $model.memoryText)
        }
        .formStyle(.grouped)
        .fixedSize(horizontal: false, vertical: true)
    }
}
