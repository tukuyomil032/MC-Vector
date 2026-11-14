// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorCore
import Observation

/// State of the "Import an existing server folder" sheet (React
/// ImportServerModal). Unlike React, the success message waits for the copy,
/// failures show the reason, the name and memory follow the core rules, and
/// the port is read from server.properties.
@MainActor
@Observable
final class ImportServerModel {
    enum Phase: Equatable {
        /// No folder yet.
        case choosing
        case analyzing
        case ready
        case creating(CreationStage)
    }

    private(set) var phase: Phase = .choosing
    private(set) var analysis: ImportAnalysisInfo?

    var name = ""
    var software = CreateServerModel.defaultSoftware
    var version = ""
    var portText = ServerNumbers.defaultPort
    var memoryText = ServerNumbers.defaultMemory

    var failure: CoreError?
    var showsNoJar = false

    let softwareOptions: [SoftwareOption]
    private(set) var operationID = UUID().uuidString.lowercased()

    init(softwareOptions: [SoftwareOption] = CoreClient.softwareOptions()) {
        self.softwareOptions = softwareOptions
    }

    // MARK: Validation

    /// The core's import name rule: not empty, at most 128 bytes, no path
    /// separators, `:` or control characters.
    var nameError: String? {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return L10n.t("addServer.name.required") }
        let forbidden = CharacterSet(charactersIn: "/\\:").union(.controlCharacters)
        if trimmed.utf8.count > 128 || trimmed.unicodeScalars.contains(where: forbidden.contains) {
            return L10n.t("native.import.nameInvalid")
        }
        return nil
    }

    var softwareWasDetected: Bool { analysis?.detectedSoftware != nil }

    var isValid: Bool {
        analysis != nil && nameError == nil
            && ServerNumbers.port(portText) != nil && ServerNumbers.memoryGB(memoryText) != nil
    }

    var isCreating: Bool {
        if case .creating = phase { return true }
        return false
    }

    // MARK: Actions

    /// Analyzes a picked folder and fills the form from it. A folder without a
    /// server jar is refused, as in React.
    func choose(folder: URL) async {
        discard()
        phase = .analyzing
        do throws(CoreError) {
            let picked = try await CoreClient.beginServerImport(folder: folder)
            guard picked.jarName != nil else {
                CoreClient.cancelServerImport(token: picked.token)
                phase = .choosing
                showsNoJar = true
                return
            }
            analysis = picked
            name = picked.folderName
            software = picked.detectedSoftware ?? CreateServerModel.defaultSoftware
            version = picked.detectedVersion ?? ""
            portText = picked.detectedPort.map(String.init) ?? ServerNumbers.defaultPort
            phase = .ready
        } catch {
            phase = .choosing
            failure = error
        }
    }

    /// Copies the folder into a new server. On failure the form stays filled
    /// and the folder can be imported again; a cancel needs a new pick.
    func importServer() async -> CreatedServerInfo? {
        guard isValid, let analysis, let port = ServerNumbers.port(portText),
              let memoryGB = ServerNumbers.memoryGB(memoryText), !isCreating
        else { return nil }
        operationID = UUID().uuidString.lowercased()
        phase = .creating(.resolving)
        let input = NewServerInput(
            operationId: operationID,
            name: name.trimmingCharacters(in: .whitespaces),
            profileName: nil,
            groupName: nil,
            software: software,
            version: version.trimmingCharacters(in: .whitespaces),
            port: port,
            memoryGb: memoryGB,
            templateId: nil,
            importToken: analysis.token
        )
        do throws(CoreError) {
            let created = try await CoreClient.createServer(input) { stage in
                Task { @MainActor [weak self] in self?.show(stage) }
            }
            self.analysis = nil
            return created
        } catch {
            if error.code == "operation.cancelled" {
                // The core consumed the token: start over with a new pick.
                self.analysis = nil
                phase = .choosing
            } else {
                phase = .ready
                failure = error
            }
            return nil
        }
    }

    func cancel() {
        CoreClient.cancelServerCreation(operationID: operationID)
    }

    /// Releases the picked folder (closing the sheet or picking another one).
    func discard() {
        if let token = analysis?.token {
            CoreClient.cancelServerImport(token: token)
        }
        analysis = nil
        if !isCreating { phase = .choosing }
    }

    #if DEBUG
    /// Capture tooling: shows the progress view without importing anything.
    func showProgressForCapture(_ stage: CreationStage) {
        phase = .creating(stage)
    }
    #endif

    private func show(_ stage: CreationStage) {
        guard isCreating else { return }
        phase = .creating(stage)
    }
}
