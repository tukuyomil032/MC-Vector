// SPDX-License-Identifier: GPL-3.0-or-later
// swiftlint:disable type_body_length function_body_length cyclomatic_complexity
// Debug-only capture tooling: one long switch of named screen states.

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
        private static var viewReadyIDs: Set<String> = []

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
            case let id where id.hasPrefix("SERVERSETTINGS-"):
                await showServerSettings(id, app: app)
            case "SETTINGS-root", "SETTINGS-general", "SETTINGS-editor", "SETTINGS-updates", "SETTINGS-security",
                "SETTINGS-about":
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
                    signal(
                        "[capture] created \(created.server.software) \(created.server.version) jar=\(created.jarInstalled) path=\(created.server.path)"
                    )
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
                    signal(
                        "[capture] imported \(created.server.software) \(created.server.version) port=\(created.server.port ?? 0) world=\(copied) path=\(created.server.path)"
                    )
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
                signal(
                    "[capture] after stop: \(runtime.status(of: "server-1")) lines=\(lines.count) stderr=\(lines.contains(where: \.isStderr)) last=\(lines.last?.text ?? "")"
                )
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
                    let created = try await CoreClient.createServer(
                        NewServerInput(
                            operationId: UUID().uuidString.lowercased(), name: "real-paper", profileName: nil,
                            groupName: nil, software: "Paper", version: "1.21.10", port: 25_590, memoryGb: 2,
                            templateId: nil, importToken: nil
                        )
                    ) { _ in }
                    await app.reloadServers()
                    let id = created.server.id
                    app.selectedServerID = id
                    app.navigate(to: .console)
                    try CoreClient.acceptServerEula(id: id)
                    await runtime.start(id)
                    var done = false
                    for _ in 0..<240 {
                        if runtime.logs[id]?.contains(where: { $0.text.contains("Done (") }) == true {
                            done = true
                            break
                        }
                        if runtime.status(of: id) == "crashed" { break }
                        try? await Task.sleep(for: .milliseconds(500))
                    }
                    signal(
                        "[capture] paper done=\(done) status=\(runtime.status(of: id)) lines=\(runtime.logs[id]?.count ?? 0)"
                    )
                    try? await runtime.send("list", to: id)
                    try? await Task.sleep(for: .seconds(1))
                    signal("[capture] list reply: \(runtime.logs[id]?.last?.text ?? "")")
                    await runtime.stop(id)
                    signal("[capture] after stop: \(runtime.status(of: id))")
                } catch {
                    signal("[capture] real paper failed: \(error.code) \(error.message)")
                }
            case "DASH-offline":
                app.navigate(to: .dashboard)
            case "DASH-running", "DASH-narrow", "VERIFY-high-cpu":
                if id == "VERIFY-high-cpu" {
                    // Threshold 0: every sample is "high"; the cooldown must allow one notice.
                    runtime.serverProfile = { [app] serverID in
                        guard var profile = app.servers.first(where: { $0.id == serverID }) else { return nil }
                        profile.notifyOnHighCpu = true
                        profile.notifyHighCpuThreshold = 0
                        return profile
                    }
                }
                await startStandIn(runtime: runtime, serverID: "server-1")
                app.navigate(to: .dashboard)
                // TPS is polled every 5 s for Paper; wait for two TPS points.
                for _ in 0..<40 where (runtime.metrics["server-1"]?.tps.count ?? 0) < 2 {
                    try? await Task.sleep(for: .milliseconds(500))
                }
                let snapshot = runtime.metrics["server-1"]
                signal(
                    "[capture] metrics resource=\(snapshot?.resource.count ?? 0) tps=\(snapshot?.tps.count ?? 0) elapsed=\(snapshot?.elapsedMs ?? 0)"
                )
                if id == "DASH-narrow" {
                    resizeMainWindow(to: CGSize(width: 820, height: 800))
                    try? await Task.sleep(for: .milliseconds(400))
                }
            case "VERIFY-real-paper-dashboard":
                do throws(CoreError) {
                    let created = try await CoreClient.createServer(
                        NewServerInput(
                            operationId: UUID().uuidString.lowercased(), name: "real-paper", profileName: nil,
                            groupName: nil, software: "Paper", version: "1.21.10", port: 25_591, memoryGb: 2,
                            templateId: nil, importToken: nil
                        )
                    ) { _ in }
                    await app.reloadServers()
                    let id = created.server.id
                    app.selectedServerID = id
                    app.navigate(to: .dashboard)
                    try CoreClient.acceptServerEula(id: id)
                    await runtime.start(id)
                    for _ in 0..<120 where (runtime.metrics[id]?.tps.count ?? 0) < 3 {
                        try? await Task.sleep(for: .milliseconds(500))
                    }
                    let snapshot = runtime.metrics[id]
                    signal(
                        "[capture] paper metrics resource=\(snapshot?.resource.count ?? 0) tps=\(snapshot?.tps.map(\.tps) ?? [])"
                    )
                } catch {
                    signal("[capture] real paper failed: \(error.code) \(error.message)")
                }
            case "MOTION-tour", "MOTION-tour-reduced":
                // A scripted walk through the app's motion, recorded by capture.sh
                // (CAPTURE_RECORD). It starts after the ready signal and the settle delay.
                Motion.forceReducedMotion = id == "MOTION-tour-reduced"
                await startStandIn(runtime: runtime, serverID: "server-1")
                app.navigate(to: .dashboard)
                Task { @MainActor in
                    let step = { (seconds: Double) in try? await Task.sleep(for: .seconds(seconds)) }
                    await step(1.6)
                    app.navigate(to: .console)
                    await step(1.4)
                    ConsoleView.captureAction = .openSearch("done")
                    await step(1.4)
                    ConsoleView.captureAction = .pinFirstWarning
                    await step(1.2)
                    ConsoleView.captureAction = .closeSearch
                    await step(1.0)
                    feedback.toast(.success, L10n.t("server.toast.cloned"))
                    await step(1.4)
                    feedback.toast(.error, L10n.t("server.toast.autoBackupFailed", ["name": "E2E Server"]))
                    await step(1.4)
                    app.navigate(to: .dashboard)
                    await step(1.4)
                    let model = CreateServerModel()
                    model.name = "motion-demo"
                    pendingCreateServerModel = model
                    app.activeSheet = .addServer
                    await step(1.2)
                    model.showProgressForCapture(.downloading(percent: 35))
                    await step(1.4)
                    app.activeSheet = nil
                }
            case "FILES-root":
                app.navigate(to: .files)
            case "FILES-selection":
                FilesView.capturePreset = .init(selection: ["config", "server.properties"])
                app.navigate(to: .files)
            case "FILES-plugins":
                FilesView.capturePreset = .init(path: ["plugins"])
                app.navigate(to: .files)
            case "FILES-empty":
                FilesView.capturePreset = .init(path: ["empty"])
                app.navigate(to: .files)
            case "FILES-editor-clean":
                FilesView.capturePreset = .init(openFile: "server.properties")
                app.navigate(to: .files)
            case "FILES-editor-dirty":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "max-players=20\n")
                app.navigate(to: .files)
            case "FILES-editor-unsaved-confirm":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "max-players=20\n", confirmClose: true)
                app.navigate(to: .files)
            case "FILES-editor-suggest":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "max", showSuggestions: true)
                app.navigate(to: .files)
            case "FILES-editor-inline":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "white")
                app.navigate(to: .files)
            case "FILES-editor-hover":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(hover: "server-port")
                app.navigate(to: .files)
            case "USERS-01":
                writePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .none)
                app.navigate(to: .users)
                try? await Task.sleep(for: .milliseconds(800))
            case "USERS-empty":
                removePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .none)
                app.navigate(to: .users)
            case "USERS-loading":
                removePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .holdLoading)
                app.navigate(to: .users)
            case "USERS-load-error":
                writeMalformedPlayerList(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .none)
                app.navigate(to: .users)
            case "USERS-add-validation":
                removePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .submitEmpty)
                app.navigate(to: .users)
            case "USERS-add-pending":
                removePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .pendingAdd("Alex"))
                app.navigate(to: .users)
            case "USERS-remove-confirm":
                writePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .confirmRemove("Notch"))
                app.navigate(to: .users)
            case "USERS-toast-added":
                removePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .add("Alex"))
                app.navigate(to: .users)
            case "USERS-toast-exists":
                writePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .add("Notch"))
                app.navigate(to: .users)
            case "USERS-toast-removed":
                writePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .remove("Notch"))
                app.navigate(to: .users)
            case "USERS-live-command":
                writePlayerLists(serverID: "server-1")
                UsersView.captureScript = .init(id: id, action: .addAndShowConsole("Alex"))
                await startStandIn(runtime: runtime, serverID: "server-1")
                app.navigate(to: .users)
            case "FILES-editor-hover-then-suggest":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(hover: "25565", suggestAfterHover: true)
                app.navigate(to: .files)
            case "FILES-editor-diagnostic":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "difficulty=hardest\nmax-players=lots\n", hover: "hardest")
                app.navigate(to: .files)
            case "FILES-editor-value-empty":
                // No showSuggestions: the list must open by itself after "=".
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "difficulty=")
                app.navigate(to: .files)
            case "FILES-editor-value-t":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "online-mode=t")
                app.navigate(to: .files)
            case let theme where theme.hasPrefix("FILES-editor-theme-"):
                EditorSettings.shared.themeID = String(theme.dropFirst("FILES-editor-theme-".count))
                FilesView.capturePreset = .init(path: ["config"], openFile: "paper.yml")
                app.navigate(to: .files)
            case "FILES-editor-yaml":
                FilesView.capturePreset = .init(path: ["config"], openFile: "paper.yml")
                app.navigate(to: .files)
            case "FILES-editor-json":
                FilesView.capturePreset = .init(path: ["editor"], openFile: "sample.json")
                app.navigate(to: .files)
            case "FILES-editor-mixed":
                FilesView.capturePreset = .init(path: ["editor"], openFile: "mixed.txt")
                app.navigate(to: .files)
            case "FILES-editor-bom":
                FilesView.capturePreset = .init(openFile: "bom-crlf.properties")
                app.navigate(to: .files)
            case "FILES-editor-binary":
                FilesView.capturePreset = .init(openFile: "server.jar")
                app.navigate(to: .files)
            case "FILES-editor-large":
                FilesView.capturePreset = .init(path: ["editor"], openFile: "size-over.txt")
                app.navigate(to: .files)
            case "FILES-editor-notutf8":
                FilesView.capturePreset = .init(path: ["editor"], openFile: "not-utf8.txt")
                app.navigate(to: .files)
            case "MOTION-editor":
                FilesView.capturePreset = .init(openFile: "server.properties")
                FileEditorView.captureScript = .init(type: "max-players=20\n", save: true)
                app.navigate(to: .files)
            case "VERIFY-editor":
                // Editor saving rules through the FFI, logged for capture.sh.
                let server = "server-1"
                func bytes(_ relative: String) -> [UInt8] {
                    guard let url = try? CoreClient.fileEntryURL(serverID: server, relative: relative),
                        let data = try? Data(contentsOf: url)
                    else { return [] }
                    return Array(data)
                }
                do {
                    var document = try await CoreClient.readTextDocument(
                        serverID: server, relative: "bom-crlf.properties")
                    document.text = "motd=Edited\nserver-port=25565\n"
                    try await CoreClient.writeTextDocument(
                        serverID: server, relative: "bom-crlf.properties", document: document)
                    let expected = Array("\u{FEFF}motd=Edited\r\nserver-port=25565\r\n".utf8)
                    signal("[capture] bom+crlf edit kept: \(bytes("bom-crlf.properties") == expected)")

                    let mixed = try await CoreClient.readTextDocument(serverID: server, relative: "editor/mixed.txt")
                    signal("[capture] mixed read: ending=\(mixed.lineEnding) mixed=\(mixed.mixedLineEndings)")
                    try await CoreClient.writeTextDocument(
                        serverID: server, relative: "editor/mixed.txt", document: mixed)
                    signal(
                        "[capture] mixed saved as crlf: \(bytes("editor/mixed.txt") == Array("a\r\nb\r\nc\r\n".utf8))")
                } catch {
                    signal("[capture] editor round trip failed: \(error.code)")
                }
                let listing = (try? await CoreClient.listFiles(serverID: server, relative: "editor")) ?? []
                for name in ["size-under.txt", "size-limit.txt", "size-over.txt", "not-utf8.txt"] {
                    guard let item = listing.first(where: { $0.name == name }) else {
                        signal("[capture] \(name): missing")
                        continue
                    }
                    let document = EditorDocument(
                        serverID: server, relativePath: "editor/\(name)", fileName: name, size: item.size
                    )
                    await document.load()
                    let phase =
                        switch document.phase {
                        case .ready: "ready"
                        case .unsupported: "unsupported"
                        case .failed: "failed"
                        case .loading: "loading"
                        }
                    signal("[capture] \(name) (\(item.size) bytes): \(phase)")
                }
                app.navigate(to: .files)
            case "CONFIRM-delete-files":
                app.navigate(to: .files)
                Task {
                    _ = await feedback.confirm(
                        title: L10n.t("files.confirm.deleteTitle"),
                        description: L10n.t("files.confirm.delete", ["count": 2]) + "\n\nconfig\nserver.properties",
                        confirmLabel: L10n.t("files.toolbar.delete"),
                        isDanger: true
                    )
                }
            case "VERIFY-files":
                // Real file operations through the FFI, logged for capture.sh.
                let server = "server-1"
                func step(_ label: String, _ work: () async throws -> Void) async {
                    do {
                        try await work()
                        signal("[capture] \(label): ok")
                    } catch {
                        signal("[capture] \(label): \((error as? CoreError)?.code ?? "\(error)")")
                    }
                }
                await step("create folder") {
                    try await CoreClient.createFileEntry(serverID: server, parent: "", name: "notes", isDirectory: true)
                }
                await step("create file") {
                    try await CoreClient.createFileEntry(
                        serverID: server, parent: "notes", name: "todo.txt", isDirectory: false)
                }
                await step("create existing file") {
                    try await CoreClient.createFileEntry(
                        serverID: server, parent: "", name: "server.properties", isDirectory: false)
                }
                await step("rename") {
                    try await CoreClient.renameFileEntry(
                        serverID: server, relative: "notes/todo.txt", newName: "done.txt")
                }
                await step("rename onto existing") {
                    try await CoreClient.renameFileEntry(serverID: server, relative: "notes", newName: "config")
                }
                await step("move") {
                    try await CoreClient.moveFileEntries(serverID: server, entries: ["notes"], destination: "plugins")
                }
                await step("bad name") {
                    try await CoreClient.createFileEntry(serverID: server, parent: "", name: "a/b", isDirectory: false)
                }
                await step("delete") {
                    try await CoreClient.deleteFileEntries(serverID: server, entries: ["plugins/notes"])
                }
                let original = try? Data(
                    contentsOf: (try? CoreClient.fileEntryURL(serverID: server, relative: "bom-crlf.properties"))!)
                await step("round trip") {
                    let document = try await CoreClient.readTextDocument(
                        serverID: server, relative: "bom-crlf.properties")
                    signal(
                        "[capture] document bom=\(document.hasBom) ending=\(document.lineEnding) text=\(document.text.debugDescription)"
                    )
                    try await CoreClient.writeTextDocument(
                        serverID: server, relative: "bom-crlf.properties", document: document)
                }
                let after = try? Data(
                    contentsOf: (try? CoreClient.fileEntryURL(serverID: server, relative: "bom-crlf.properties"))!)
                signal("[capture] bytes unchanged=\(original == after && original != nil)")
                await step("binary refused") {
                    _ = try await CoreClient.readTextDocument(serverID: server, relative: "world/region/r.0.0.mca")
                }
                let listing = (try? await CoreClient.listFiles(serverID: server, relative: "")) ?? []
                signal(
                    "[capture] root: \(listing.map { $0.isDirectory ? $0.name + "/" : $0.name }.joined(separator: " "))"
                )
                app.navigate(to: .files)
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
            if id.hasPrefix("USERS-") || id.hasPrefix("PROPS-") {
                guard await waitForViewReady(id) else {
                    signal("[capture] state did not become ready: \(id)")
                    return
                }
            }
            signal("[capture] ready: \(id)")
        }

        /// Views acknowledge capture states only after their scripted state is visible.
        static func markViewReady(for id: String) {
            viewReadyIDs.insert(id)
        }

        private static func waitForViewReady(_ id: String) async -> Bool {
            for _ in 0..<150 {
                if viewReadyIDs.remove(id) != nil { return true }
                try? await Task.sleep(for: .milliseconds(100))
            }
            return false
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

        /// Opens the Server Settings window in the state the ID names and hides
        /// the main window, so capture.sh photographs the settings window.
        private static func showServerSettings(_ id: String, app: AppState) async {
            let name = String(id.dropFirst("SERVERSETTINGS-".count))
            var page: ServerSettingsPage?
            var section = ServerSettingsSection.properties
            switch name {
            case "general": section = .general
            case "properties": break
            case "search": ServerSettingsWindow.captureScript = .init(search: "port")
            case "dirty":
                page = .category(.properties, "network")
                ServerSettingsWindow.captureScript = .init(values: ["server-port": "70000", "max-players": "40"])
            case "secret":
                page = .category(.properties, "remote")
                ServerSettingsWindow.captureScript = .init(reveal: "rcon.password")
            case let general where general.hasPrefix("general-"):
                section = .general
                page = .category(.general, String(general.dropFirst("general-".count)))
            default: page = .category(.properties, name)
            }
            let main = NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain })
            app.openServerSettings(section: section)
            if let page { app.serverSettingsRequest?.page = page }
            try? await Task.sleep(for: .milliseconds(1200))
            if let settings = NSApp.windows.first(where: { $0.isVisible && $0 !== main && $0.frame.width > 500 }) {
                main?.orderOut(nil)
                NSApp.activate()
                settings.makeKeyAndOrderFront(nil)
            } else {
                signal("[capture] Server Settings window did not open")
            }
            try? await Task.sleep(for: .milliseconds(1000))
        }

        /// Sample whitelist, ops and bans for USERS-* states.
        private static func writePlayerLists(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
            let folder = URL(fileURLWithPath: dataDir).appendingPathComponent("servers/\(serverID)")
            let files = [
                "whitelist.json": """
                [{"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","name":"Notch"},
                 {"uuid":"853c80ef-3c37-49fd-aa49-938b674adae6","name":"jeb_"}]
                """,
                "ops.json": """
                [{"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","name":"Notch","level":4,"bypassesPlayerLimit":false}]
                """,
                "banned-players.json": """
                [{"uuid":"00000000-0000-0000-0000-000000000001","name":"Griefer","created":"2026-11-01 10:00:00 +0900",
                  "source":"Server","expires":"forever","reason":"Griefing"}]
                """,
                "banned-ips.json": """
                [{"ip":"203.0.113.7","created":"2026-11-01 10:00:00 +0900","source":"Server",
                  "expires":"forever","reason":"Hacking"}]
                """,
            ]
            for (name, text) in files {
                try? text.write(to: folder.appendingPathComponent(name), atomically: true, encoding: .utf8)
            }
        }

        private static func removePlayerLists(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
            let folder = URL(fileURLWithPath: dataDir).appendingPathComponent("servers/\(serverID)")
            for name in ["whitelist.json", "ops.json", "banned-players.json", "banned-ips.json"] {
                try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
            }
        }

        private static func writeMalformedPlayerList(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
            let url = URL(fileURLWithPath: dataDir)
                .appendingPathComponent("servers/\(serverID)/whitelist.json")
            try? "{malformed".write(to: url, atomically: true, encoding: .utf8)
        }

        private static func writeProperties(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
            let url = URL(fileURLWithPath: dataDir)
                .appendingPathComponent("servers/\(serverID)/server.properties")
            let contents = """
                # E2E fixture for Native Properties captures
                # Comments and representative values are retained in the source file.
                motd=Welcome to E2E Survival
                gamemode=survival
                difficulty=normal
                server-port=25565
                query.port=25570
                rcon.port=25575
                rcon.password=CaptureSecret42
                enable-query=true
                enable-rcon=true
                online-mode=true
                white-list=false
                pvp=true
                allow-flight=false
                enable-command-block=false
                max-players=20
                """
            try? contents.write(to: url, atomically: true, encoding: .utf8)
        }

        private static func writeMalformedProperties(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
            let url = URL(fileURLWithPath: dataDir)
                .appendingPathComponent("servers/\(serverID)/server.properties")
            try? "motd=Broken fixture\nmissing-assignment\n".write(to: url, atomically: true, encoding: .utf8)
        }

        private static func removeProperties(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else { return }
            let url = URL(fileURLWithPath: dataDir)
                .appendingPathComponent("servers/\(serverID)/server.properties")
            try? FileManager.default.removeItem(at: url)
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

        /// Records a line for capture.sh from anywhere in the app.
        static func note(_ line: String) {
            signal(line)
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

        static func resizeMainWindow(to size: CGSize) {
            guard let window = NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain }) else { return }
            window.setContentSize(size)
            window.center()
        }
    }
#endif
