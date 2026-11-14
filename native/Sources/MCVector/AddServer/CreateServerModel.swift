// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore
import Observation

/// State of the "Create a new server" sheet (React AddServerModal +
/// use-server-create-action). Unlike React, out-of-range numbers are reported
/// instead of clamped, the name is checked after trimming, and failures show
/// the reason.
@MainActor
@Observable
final class CreateServerModel {
    enum Phase: Equatable {
        case editing
        case creating(CreationStage)
    }

    /// React's defaults.
    nonisolated static let defaultSoftware = "Paper"
    nonisolated static let defaultVersion = "1.21.10"

    // MARK: Form

    var templateID: String? {
        didSet { applyTemplate() }
    }
    var name = ""
    var profileName = ""
    var groupName = ""
    var software = CreateServerModel.defaultSoftware
    var version = CreateServerModel.defaultVersion
    var portText = "25565"
    var memoryText = "4"
    /// Errors show once the user has typed a name or tried to create.
    var showsErrors = false

    // MARK: Choices

    let softwareOptions: [SoftwareOption]
    private let bundledVersions: [String]
    private(set) var templates: [ServerTemplateInfo] = []
    /// A template's version that is not in the bundled list.
    private var extraVersion: String?

    // MARK: Progress

    private(set) var phase: Phase = .editing
    private(set) var operationID = UUID().uuidString.lowercased()
    var failure: CoreError?

    init(
        softwareOptions: [SoftwareOption] = CoreClient.softwareOptions(),
        versions: [String] = CreateServerModel.loadBundledVersions()
    ) {
        self.softwareOptions = softwareOptions
        bundledVersions = versions
    }

    var versions: [String] {
        if let extraVersion, !bundledVersions.contains(extraVersion) {
            return [extraVersion] + bundledVersions
        }
        return bundledVersions
    }

    var selectedSoftware: SoftwareOption? {
        softwareOptions.first { $0.name == software }
    }

    // MARK: Validation

    var nameError: String? {
        if name.trimmingCharacters(in: .whitespaces).isEmpty {
            return L10n.t("addServer.name.required")
        }
        return CoreClient.isValidServerName(name) ? nil : L10n.t("addServer.name.invalid")
    }

    var port: UInt32? {
        UInt32(portText.trimmingCharacters(in: .whitespaces)).flatMap { (1...65_535).contains($0) ? $0 : nil }
    }

    var memoryGB: UInt32? {
        UInt32(memoryText.trimmingCharacters(in: .whitespaces)).flatMap { (1...1_024).contains($0) ? $0 : nil }
    }

    var portError: String? { port == nil ? L10n.t("addServer.port.invalid") : nil }
    var memoryError: String? { memoryGB == nil ? L10n.t("error.server.invalid_memory") : nil }

    var isValid: Bool {
        nameError == nil && port != nil && memoryGB != nil && selectedSoftware != nil && !version.isEmpty
    }

    var isCreating: Bool {
        if case .creating = phase { return true }
        return false
    }

    // MARK: Actions

    func loadTemplates() async {
        templates = (try? await CoreClient.serverTemplates()) ?? []
    }

    /// Fills everything but the server name from the template; "No template"
    /// keeps what is filled (React AddServerModal).
    private func applyTemplate() {
        guard let templateID, let template = templates.first(where: { $0.id == templateID }) else { return }
        software = softwareOptions.contains { $0.name == template.software } ? template.software : Self.defaultSoftware
        let templateVersion = template.version.trimmingCharacters(in: .whitespaces)
        if templateVersion.isEmpty {
            version = Self.defaultVersion
        } else {
            extraVersion = templateVersion
            version = templateVersion
        }
        if let port = template.port { portText = String(port) }
        if let memoryMB = template.memoryMb { memoryText = String(max(1, memoryMB / 1024)) }
        profileName = template.profileName ?? ""
        groupName = template.groupName ?? ""
    }

    /// Creates the server. Returns it on success; on failure `failure` is set
    /// (except for a cancel) and the form keeps its values.
    func create() async -> CreatedServerInfo? {
        showsErrors = true
        guard isValid, let port, let memoryGB, !isCreating else { return nil }
        operationID = UUID().uuidString.lowercased()
        phase = .creating(.resolving)
        let input = NewServerInput(
            operationId: operationID,
            name: name.trimmingCharacters(in: .whitespaces),
            profileName: profileName.nilIfBlank,
            groupName: groupName.nilIfBlank,
            software: software,
            version: version,
            port: port,
            memoryGb: memoryGB,
            templateId: templateID,
            importToken: nil
        )
        do throws(CoreError) {
            let created = try await CoreClient.createServer(input) { stage in
                Task { @MainActor [weak self] in self?.show(stage) }
            }
            return created
        } catch {
            phase = .editing
            if error.code != "operation.cancelled" { failure = error }
            return nil
        }
    }

    func cancel() {
        CoreClient.cancelServerCreation(operationID: operationID)
    }

    private func show(_ stage: CreationStage) {
        guard isCreating else { return }
        phase = .creating(stage)
    }

    #if DEBUG
    /// Capture tooling: shows the progress view without creating anything.
    func showProgressForCapture(_ stage: CreationStage) {
        phase = .creating(stage)
    }
    #endif

    // MARK: Bundled versions

    nonisolated static func loadBundledVersions(bundle: Bundle = .main) -> [String] {
        struct File: Decodable { let versions: [String] }
        guard let url = bundle.url(forResource: "minecraft-versions", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data)
        else { return [defaultVersion] }
        return file.versions
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }
}
