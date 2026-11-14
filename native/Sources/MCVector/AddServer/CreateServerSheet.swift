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
                CreationProgressView(software: model.software, version: model.version, stage: stage)
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
            Section {
            } header: {
                Text(L10n.t("addServer.title"))
                    .font(.headline)
                    .foregroundStyle(.primary)
            }
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
                Picker(L10n.t("addServer.software.label"), selection: $model.software) {
                    ForEach(SoftwareGroup.allInFormOrder, id: \.self) { group in
                        Section(L10n.t(group.labelKey)) {
                            ForEach(model.softwareOptions.filter { $0.group == group }, id: \.name) { option in
                                Text(L10n.t("addServer.software.options.\(option.name.lowercased())"))
                                    .tag(option.name)
                            }
                        }
                    }
                }
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

            Section {
                TextField(L10n.t("addServer.port.label"), text: $model.portText)
                    .multilineTextAlignment(.trailing)
                LabeledContent(L10n.t("addServer.memory.label")) {
                    HStack(spacing: 6) {
                        TextField(L10n.t("addServer.memory.label"), text: $model.memoryText)
                            .labelsHidden()
                            .multilineTextAlignment(.trailing)
                            .frame(width: 64)
                        Text(L10n.t("native.addServer.memoryUnit"))
                            .foregroundStyle(.secondary)
                        Stepper(
                            L10n.t("addServer.memory.label"),
                            value: Binding(
                                get: { Int(model.memoryText) ?? 1 },
                                set: { model.memoryText = String(min(max($0, 1), 1_024)) }
                            ),
                            in: 1...1_024
                        )
                        .labelsHidden()
                    }
                }
            } footer: {
                VStack(alignment: .leading, spacing: 2) {
                    if let error = model.portError { FieldError(error) }
                    if let error = model.memoryError { FieldError(error) }
                }
            }
        }
        .formStyle(.grouped)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct FieldError: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Label(text, systemImage: "exclamationmark.circle.fill")
            .foregroundStyle(.red)
    }
}

private struct CreationProgressView: View {
    let software: String
    let version: String
    let stage: CreationStage

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.t("addServer.title"))
                .font(.headline)
            switch stage {
            case .resolving:
                ProgressView { Text(L10n.t("native.addServer.resolving")) }
            case let .downloading(percent):
                let title = L10n.t("server.toast.downloadingServer", ["software": software, "version": version])
                if let percent {
                    ProgressView(value: Double(percent), total: 100) {
                        Text(title)
                    } currentValueLabel: {
                        Text("\(percent)%").monospacedDigit()
                    }
                } else {
                    ProgressView { Text(title) }
                }
            case .finishing:
                ProgressView { Text(L10n.t("native.addServer.finishing")) }
            }
        }
        .progressViewStyle(.linear)
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension SoftwareGroup {
    static let allInFormOrder: [SoftwareGroup] = [.standard, .modded, .proxy]

    var labelKey: String {
        switch self {
        case .standard: "addServer.software.groups.standard"
        case .modded: "addServer.software.groups.modded"
        case .proxy: "addServer.software.groups.proxy"
        }
    }
}
