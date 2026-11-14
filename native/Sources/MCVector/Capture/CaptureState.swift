// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
import AppKit
import MCVectorCore
import SwiftUI

/// Debug-only states for `native/scripts/capture.sh`. IDs follow the UI inventory
/// (spec/idea/native-swiftui-edition/ui-reference) where a feature matches, so a
/// capture can be checked against the React feature list. Launch with
/// `--capture-state <ID>`; the state is applied once the server list has loaded.
@MainActor
enum CaptureState {
    static var requestedID: String? {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: "--capture-state"), index + 1 < arguments.count else {
            return nil
        }
        return arguments[index + 1]
    }

    static func apply(
        _ id: String,
        app: AppState,
        feedback: FeedbackCenter,
        runtime: ServerRuntime,
        openSettings: OpenSettingsAction
    ) async {
        resizeMainWindow(to: CGSize(width: 1200, height: 800))
        // Captures show the active window, the way people see it while using the app.
        NSApp.activate()
        NSApp.windows.first(where: { $0.canBecomeMain })?.makeKeyAndOrderFront(nil)
        try? await Task.sleep(for: .milliseconds(300))
        switch id {
        case "SHELL-ROOT":
            app.navigate(to: .dashboard)
        case "CONTENT-noserver-empty", "CONTENT-noserver-select":
            app.selectedServerID = nil
        case "SETTINGS-root", "SETTINGS-general", "SETTINGS-updates", "SETTINGS-security", "SETTINGS-about":
            // SettingsView picks the pane from the ID. capture.sh takes the first
            // window of the app, so hide the main window once Settings is open.
            let main = NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain })
            openSettings()
            try? await Task.sleep(for: .milliseconds(800))
            if let settings = NSApp.windows.first(where: { $0.isVisible && $0 !== main && $0.frame.width > 300 }) {
                main?.orderOut(nil)
                NSApp.activate()
                settings.makeKeyAndOrderFront(nil)
            } else {
                signal("[capture] Settings window did not open")
            }
            // Give the pane time to draw before capture.sh takes the picture.
            try? await Task.sleep(for: .milliseconds(1000))
        case "SEARCH-open":
            app.isSearchFocused = true
        case "SEARCH-filtered":
            app.isSearchFocused = true
            app.searchText = "con"
        case "TOAST-success":
            feedback.toast(.success, L10n.t("server.toast.cloned"))
        case "TOAST-error":
            feedback.toast(.error, L10n.t("server.toast.autoBackupFailed", ["name": "E2E Server"]))
        case "CONFIRM-delete-server":
            Task {
                _ = await feedback.confirm(
                    title: L10n.t("common.delete"),
                    description: L10n.t(
                        "server.confirm.deleteManaged",
                        ["name": "E2E Server", "path": "<data>/servers/server-1"]
                    ),
                    confirmLabel: L10n.t("common.delete"),
                    isDanger: true
                )
            }
        case "PROMPT-save-template":
            Task {
                _ = await feedback.prompt(
                    title: L10n.t("server.create.templateNamePrompt"),
                    label: L10n.t("server.create.templateNameLabel"),
                    defaultValue: L10n.t("server.create.templateDefaultName", ["name": "E2E Server"])
                )
            }
        // Verification states: run a core action without its confirmation, then
        // show the result, so the FFI path can be checked end to end.
        case "VERIFY-clone":
            if let copy = try? await CoreClient.cloneServer(id: "server-1", name: "E2E Server Copy") {
                await app.reloadServers()
                app.selectedServerID = copy.id
                feedback.toast(.success, L10n.t("server.toast.cloned"))
            } else {
                feedback.toast(.error, L10n.t("server.toast.cloneFailed"))
            }
        case "VERIFY-delete":
            let deleted = (try? await CoreClient.deleteServer(id: "server-1")) ?? false
            await app.reloadServers()
            feedback.toast(
                deleted ? .success : .error,
                L10n.t(deleted ? "server.toast.deleted" : "server.toast.deleteFailed")
            )
        case "ADD-CHOICE-open":
            app.activeSheet = .addServerChoice
        case "ADD-SERVER-empty":
            app.activeSheet = .addServer
        case "ADD-SERVER-filled", "ADD-SERVER-invalid", "ADD-SERVER-progress":
            let model = CreateServerModel()
            if id == "ADD-SERVER-invalid" {
                model.name = "my server"
                model.portText = "70000"
                model.memoryText = "0"
                model.showsErrors = true
            } else {
                model.name = "survival"
                model.profileName = "Survival"
                model.groupName = "Production"
                model.software = "Vanilla"
                model.version = "1.21.10"
                model.memoryText = "6"
            }
            if id == "ADD-SERVER-progress" {
                model.showProgressForCapture(.downloading(percent: 42))
            }
            pendingCreateServerModel = model
            app.activeSheet = .addServer
        case "VERIFY-create-manual":
            // Runs the real creation for software without an automatic jar
            // (no network), then shows the result like the sheet does.
            let input = NewServerInput(
                operationId: UUID().uuidString.lowercased(),
                name: "Lobby-2",
                profileName: nil,
                groupName: "Testing",
                software: "Spigot",
                version: "1.21.10",
                port: 25_570,
                memoryGb: 2,
                templateId: nil,
                importToken: nil
            )
            do {
                let created = try await CoreClient.createServer(input) { _ in }
                await app.reloadServers()
                app.selectedServerID = created.server.id
                feedback.toast(.info, L10n.t("native.addServer.createdManualJar", ["name": created.server.name]))
            } catch {
                feedback.toast(.error, error.uiText)
            }
        case "VERIFY-create-paper", "VERIFY-create-vanilla", "VERIFY-create-cancel":
            // Real downloads from the official sources (needs the network).
            let software = id == "VERIFY-create-paper" ? "Paper" : "Vanilla"
            let operationID = UUID().uuidString.lowercased()
            let input = NewServerInput(
                operationId: operationID,
                name: "verify-\(software.lowercased())",
                profileName: nil,
                groupName: "Verify",
                software: software,
                version: "1.21.10",
                port: 25_580,
                memoryGb: 2,
                templateId: nil,
                importToken: nil
            )
            let cancelOnDownload = id == "VERIFY-create-cancel"
            do {
                let created = try await CoreClient.createServer(input) { stage in
                    if cancelOnDownload, case .downloading = stage {
                        CoreClient.cancelServerCreation(operationID: operationID)
                    }
                }
                await app.reloadServers()
                app.selectedServerID = created.server.id
                signal("[capture] created \(created.server.software) \(created.server.version) jar=\(created.jarInstalled) path=\(created.server.path)")
                feedback.toast(.success, L10n.t("server.toast.created", ["name": created.server.name]))
            } catch {
                signal("[capture] create failed: \(error.code) \(error.message)")
                feedback.toast(.error, error.uiText)
            }
        case "IMPORT-empty":
            app.activeSheet = .importServer
        case "IMPORT-analyzed", "IMPORT-invalid", "IMPORT-progress", "IMPORT-no-jar":
            let model = ImportServerModel()
            let folder = id == "IMPORT-no-jar" ? "no-jar-folder" : "paper-survival"
            await model.choose(folder: importSource(folder))
            if id == "IMPORT-invalid" {
                model.name = "survival/world"
                model.memoryText = "2048"
            }
            if id == "IMPORT-progress" {
                model.showProgressForCapture(.resolving)
            }
            pendingImportServerModel = model
            app.activeSheet = .importServer
        case "VERIFY-import":
            // Real import of the fixture folder through the FFI.
            let model = ImportServerModel()
            await model.choose(folder: importSource("paper-survival"))
            if let created = await model.importServer() {
                await app.reloadServers()
                app.selectedServerID = created.server.id
                let copied = FileManager.default.fileExists(atPath: created.server.path + "/world/level.dat")
                signal("[capture] imported \(created.server.software) \(created.server.version) port=\(created.server.port ?? 0) world=\(copied) path=\(created.server.path)")
                feedback.toast(.success, L10n.t("importServer.toast.success"))
            } else {
                signal("[capture] import failed: \(model.failure?.code ?? "?") \(model.failure?.message ?? "")")
                feedback.toast(.error, model.failure?.uiText ?? "?")
            }
        case "CONSOLE-offline":
            app.navigate(to: .console)
        case "CONSOLE-running", "CONSOLE-search", "CONSOLE-filter-warn", "CONSOLE-pinned", "HEADER-online":
            await startStandIn(runtime: runtime, serverID: "server-1")
            switch id {
            case "CONSOLE-search": ConsoleView.capturePreset = .init(query: "done")
            case "CONSOLE-filter-warn": ConsoleView.capturePreset = .init(level: .warn)
            case "CONSOLE-pinned": ConsoleView.capturePreset = .init(pinFirstWarning: true)
            default: break
            }
            app.navigate(to: id == "HEADER-online" ? .dashboard : .console)
            try? await Task.sleep(for: .milliseconds(600))
        case "EULA-sheet":
            writeEula(accepted: false, serverID: "server-1")
            app.navigate(to: .console)
            await runtime.start("server-1")
        case "CONFIRM-quit":
            await startStandIn(runtime: runtime, serverID: "server-1")
            app.navigate(to: .console)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                NSApp.terminate(nil)
            }
        case "VERIFY-start-stop":
            await runtime.start("server-1")
            try? await Task.sleep(for: .seconds(1))
            signal("[capture] after start: \(runtime.status(of: "server-1"))")
            do throws(CoreError) {
                try await runtime.send("list", to: "server-1")
            } catch {
                signal("[capture] send failed: \(error.code)")
            }
            do throws(CoreError) {
                try await runtime.send("list", to: "server-1")
                signal("[capture] second send within 100 ms was accepted")
            } catch {
                signal("[capture] rate limit: \(error.code)")
            }
            try? await Task.sleep(for: .milliseconds(500))
            await runtime.stop("server-1")
            try? await Task.sleep(for: .milliseconds(300))
            let lines = runtime.logs["server-1"] ?? []
            signal("[capture] after stop: \(runtime.status(of: "server-1")) lines=\(lines.count) stderr=\(lines.contains(where: \.isStderr)) last=\(lines.last?.text ?? "")")
            app.navigate(to: .console)
        case "VERIFY-crash":
            await startStandIn(runtime: runtime, serverID: "server-1")
            try? await runtime.send("crash", to: "server-1")
            try? await Task.sleep(for: .seconds(1))
            signal("[capture] after crash: \(runtime.status(of: "server-1"))")
            app.navigate(to: .console)
        case "VERIFY-real-paper":
            // Downloads Paper, accepts its EULA, runs it with the real Java,
            // waits for "Done (", sends a command, then stops it.
            do throws(CoreError) {
                let created = try await CoreClient.createServer(NewServerInput(
                    operationId: UUID().uuidString.lowercased(), name: "real-paper", profileName: nil,
                    groupName: nil, software: "Paper", version: "1.21.10", port: 25_590, memoryGb: 2,
                    templateId: nil, importToken: nil
                )) { _ in }
                await app.reloadServers()
                let id = created.server.id
                app.selectedServerID = id
                app.navigate(to: .console)
                try CoreClient.acceptServerEula(id: id)
                await runtime.start(id)
                var done = false
                for _ in 0..<240 {
                    if runtime.logs[id]?.contains(where: { $0.text.contains("Done (") }) == true { done = true; break }
                    if runtime.status(of: id) == "crashed" { break }
                    try? await Task.sleep(for: .milliseconds(500))
                }
                signal("[capture] paper done=\(done) status=\(runtime.status(of: id)) lines=\(runtime.logs[id]?.count ?? 0)")
                try? await runtime.send("list", to: id)
                try? await Task.sleep(for: .seconds(1))
                signal("[capture] list reply: \(runtime.logs[id]?.last?.text ?? "")")
                await runtime.stop(id)
                signal("[capture] after stop: \(runtime.status(of: id))")
            } catch {
                signal("[capture] real paper failed: \(error.code) \(error.message)")
            }
        case "VERIFY-template":
            do {
                try await CoreClient.saveTemplate(fromServer: "server-1", name: "Survival Template")
                feedback.toast(.success, L10n.t("server.toast.templateSaved"))
            } catch {
                feedback.toast(.error, L10n.t("server.toast.templateSaveFailed"))
            }
        default:
            if let route = AppRoute.allCases.first(where: { id == "ROUTE-\($0.rawValue)" }) {
                app.navigate(to: route)
            } else {
                signal("[capture] unknown capture state: \(id)")
            }
        }
        signal("[capture] ready: \(id)")
    }

    /// Starts a fixture server with the stand-in Java and waits for its log.
    private static func startStandIn(runtime: ServerRuntime, serverID: String) async {
        await runtime.start(serverID)
        for _ in 0..<30 where (runtime.logs[serverID]?.count ?? 0) < 5 {
            try? await Task.sleep(for: .milliseconds(100))
        }
        try? await runtime.send("list", to: serverID)
        try? await Task.sleep(for: .milliseconds(300))
    }

    private static func writeEula(accepted: Bool, serverID: String) {
        guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
        let url = URL(fileURLWithPath: dataDir).appendingPathComponent("servers/\(serverID)/eula.txt")
        try? "eula=\(accepted)\n".write(to: url, atomically: true, encoding: .utf8)
    }

    /// A preset model for the next "Create a new server" sheet (ADD-SERVER-*).
    private static var pendingCreateServerModel: CreateServerModel?

    static func takeCreateServerModel() -> CreateServerModel? {
        defer { pendingCreateServerModel = nil }
        return pendingCreateServerModel
    }

    /// A preset model for the next import sheet (IMPORT-*).
    private static var pendingImportServerModel: ImportServerModel?

    static func takeImportServerModel() -> ImportServerModel? {
        defer { pendingImportServerModel = nil }
        return pendingImportServerModel
    }

    /// Folders prepared by capture.sh next to the fixture data folder.
    private static func importSource(_ name: String) -> URL {
        let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] ?? NSTemporaryDirectory()
        return URL(fileURLWithPath: dataDir).deletingLastPathComponent()
            .appendingPathComponent("import-source").appendingPathComponent(name)
    }

    /// Writes the line to stderr and, when `MCVECTOR_CAPTURE_SIGNAL` names a file,
    /// appends it there. capture.sh launches the app through `open`, which cannot
    /// redirect the app's output, so it watches that file instead.
    private static func signal(_ line: String) {
        let data = Data((line + "\n").utf8)
        FileHandle.standardError.write(data)
        guard let path = ProcessInfo.processInfo.environment["MCVECTOR_CAPTURE_SIGNAL"], !path.isEmpty else {
            return
        }
        if let handle = FileHandle(forWritingAtPath: path) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            FileManager.default.createFile(atPath: path, contents: data)
        }
    }

    private static func resizeMainWindow(to size: CGSize) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain }) else { return }
        window.setContentSize(size)
        window.center()
    }
}
#endif
