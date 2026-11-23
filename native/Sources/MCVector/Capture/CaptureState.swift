// SPDX-License-Identifier: GPL-3.0-or-later
// swiftlint:disable type_body_length function_body_length cyclomatic_complexity
// Debug-only capture tooling: one long switch of named screen states.

#if DEBUG
    import AppKit
    import GlassKit
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
            runtime: ServerRuntime
        ) async {
            resizeMainWindow(to: CGSize(width: 1200, height: 800))
            // Captures show the active window, the way people see it while using the app.
            NSApp.activate()
            NSApp.windows.first(where: { $0.canBecomeMain })?.makeKeyAndOrderFront(nil)
            try? await Task.sleep(for: .milliseconds(300))
            switch id {
            case "VERIFY-clone", "VERIFY-delete", "VERIFY-create-manual", "VERIFY-create-paper",
                "VERIFY-create-vanilla", "VERIFY-create-cancel", "VERIFY-import", "VERIFY-start-stop", "VERIFY-crash",
                "VERIFY-real-paper", "VERIFY-real-paper-dashboard", "VERIFY-template":
                await verifyState(id, app: app, feedback: feedback, runtime: runtime)
            case "E2E-navigate":
                await verifyNavigation(app: app)
            case "SHELL-ROOT":
                app.navigate(to: .dashboard)
            case "CONTENT-noserver-empty", "CONTENT-noserver-select":
                app.selectedServerID = nil
            case let id where id.hasPrefix("SERVERSETTINGS-") || id.hasPrefix("SETTINGS-"):
                await showSettings(id, app: app)
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
            case "DASH-offline":
                app.navigate(to: .dashboard)
            case "PLUGINS-live", "PLUGINS-live-detail", "PLUGINS-live-installed", "PLUGINS-live-readme",
                "PLUGINS-live-versions", "PLUGINS-live-install":
                PluginInspector.captureTab =
                    id == "PLUGINS-live-readme" ? .readme : id == "PLUGINS-live-versions" ? .versions : nil
                // Real provider search (needs the network), for checking the
                // browser against live data rather than fixtures.
                PluginsView.capturePreset = .init(
                    tab: id == "PLUGINS-live-installed" ? .installed : .browse,
                    selectFirst: ["PLUGINS-live-detail", "PLUGINS-live-readme", "PLUGINS-live-versions"].contains(id),
                    installFirst: id == "PLUGINS-live-install")
                app.navigate(to: .plugins)
                try? await Task.sleep(for: .seconds(id == "PLUGINS-live-install" ? 15 : 6))
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
                if id == "VERIFY-high-cpu" {
                    check("high cpu notice cooldown", highCpuNoticeCount == 1, "notices=\(highCpuNoticeCount)")
                    check("high cpu metrics", (snapshot?.resource.isEmpty == false) && (snapshot?.tps.isEmpty == false))
                }
                if id == "DASH-narrow" {
                    resizeMainWindow(to: CGSize(width: 820, height: 800))
                    try? await Task.sleep(for: .milliseconds(400))
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
            case let playground where playground.hasPrefix("PLAYGROUND-"):
                await showPlayground(playground)
            case "FILES-zip", "FILES-new", "FILES-move", "FILES-activity", "FILES-trashed", "FILES-rename",
                "FILES-trash-confirm",
                "FILES-filter":
                await showFilesAction(id, app: app)
            case "FILES-icons":
                FilesView.capturePreset = .init(selection: ["config"], viewMode: .icons)
                app.navigate(to: .files)
            case "FILES-columns":
                FilesView.capturePreset = .init(path: ["plugins"], selection: ["Essentials.jar"], viewMode: .columns)
                app.navigate(to: .files)
            case "FILES-columns-deep":
                // Opens folders one at a time, as clicks do, from the server folder.
                FilesView.capturePreset = .init(viewMode: .columns)
                app.navigate(to: .files)
                let model = app.files(for: "server-1")
                try? await Task.sleep(for: .milliseconds(700))
                model.navigate(to: ["plugins"])
                try? await Task.sleep(for: .milliseconds(500))
                model.navigate(to: ["plugins", "Essentials"])
                try? await Task.sleep(for: .milliseconds(500))
                model.selection = ["config.yml"]
            case "FILES-nbt", "FILES-nbt-search":
                FilesView.capturePreset = .init(path: ["world"], viewMode: .list)
                NbtTreeView.captureQuery = id == "FILES-nbt-search" ? "seed" : nil
                app.navigate(to: .files)
                try? await Task.sleep(for: .milliseconds(900))
                app.files(for: "server-1").open("level.dat")
            case "FILES-world-info":
                FilesView.capturePreset = .init(selection: ["world"], viewMode: .gallery)
                app.navigate(to: .files)
            case "FILES-info", "FILES-quicklook":
                FilesView.capturePreset = .init(selection: ["server.properties"], viewMode: .list)
                app.navigate(to: .files)
                try? await Task.sleep(for: .milliseconds(900))
                let model = app.files(for: "server-1")
                if id == "FILES-info" {
                    model.infoTarget = "server.properties"
                } else {
                    FilesQuickLook.shared.toggle(model)
                }
            case "FILES-gallery":
                FilesView.capturePreset = .init(selection: ["server.properties"], viewMode: .gallery)
                app.navigate(to: .files)
            case "FILES-grouped":
                FilesView.capturePreset = .init(viewMode: .icons, grouping: .kind)
                app.navigate(to: .files)
            case "FILES-grouped-list":
                FilesView.capturePreset = .init(viewMode: .list, grouping: .kind)
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
            case let id where id.hasPrefix("BACKUPS-"):
                UserDefaults.standard.set(
                    id == "BACKUPS-table" ? BackupsLayout.table.rawValue : BackupsLayout.cards.rawValue,
                    forKey: BackupsLayout.storageKey)
                switch id {
                case "BACKUPS-empty", "BACKUPS-loading", "BACKUPS-auto":
                    break
                case "BACKUPS-catalog-error":
                    corruptBackupCatalog(serverID: "server-1")
                default:
                    await makeSampleBackups(serverID: "server-1")
                }
                if id == "BACKUPS-create-stop-confirm" {
                    await startStandIn(runtime: runtime, serverID: "server-1")
                }
                BackupsView.captureScript = .init(id: id)
                app.navigate(to: .backups)
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
                await verifyEditor(app: app)
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
                await verifyFiles(app: app)
            default:
                if let route = AppRoute.allCases.first(where: { id == "ROUTE-\($0.rawValue)" }) {
                    app.navigate(to: route)
                } else {
                    signal("[capture] unknown capture state: \(id)")
                }
            }
            if id.hasPrefix("USERS-") || id.hasPrefix("PROPS-") || id.hasPrefix("BACKUPS-") {
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
        static func startStandIn(runtime: ServerRuntime, serverID: String) async {
            await runtime.start(serverID)
            for _ in 0..<30 where (runtime.logs[serverID]?.count ?? 0) < 5 {
                try? await Task.sleep(for: .milliseconds(100))
            }
            try? await runtime.send("list", to: serverID)
            try? await Task.sleep(for: .milliseconds(300))
        }

        /// The Settings page a `SETTINGS-*` or `SERVERSETTINGS-*` ID opens.
        static var requestedSettingsPage: SettingsPage? {
            requestedID.flatMap(settingsPage(for:))
        }

        private static func settingsPage(for id: String) -> SettingsPage? {
            if id.hasPrefix("SETTINGS-") {
                switch String(id.dropFirst("SETTINGS-".count)) {
                case "java": return .app(.java)
                case "editor": return .app(.editor)
                case "about": return .app(.about)
                case "search": return .app(.general)
                default: return .app(.general)
                }
            }
            guard id.hasPrefix("SERVERSETTINGS-") else { return nil }
            let name = String(id.dropFirst("SERVERSETTINGS-".count))
            switch name {
            case "general", "search", "upgrade": return .server(.server)
            case "properties": return .properties(.game)
            case "dirty", "secret": return .properties(.network)
            default:
                if let page = SettingsPage(id: name) { return page }
                let category = name.hasPrefix("general-") ? String(name.dropFirst("general-".count)) : name
                if let general = GeneralSettingsCategory(rawValue: category) {
                    return .server(ServerPage.allCases.first { $0.categories.contains(general) } ?? .server)
                }
                return .properties(PropertiesGroup.allCases.first { $0.categoryIDs.contains(category) } ?? .game)
            }
        }

        /// Opens the Settings window in the state the ID names and hides the
        /// main window, so capture.sh photographs the settings window.
        private static func showSettings(_ id: String, app: AppState) async {
            switch id {
            case "SERVERSETTINGS-search": SettingsWindow.captureScript = .init(search: "port")
            case "SETTINGS-search": SettingsWindow.captureScript = .init(search: "update")
            case "SETTINGS-icons":
                SettingsWindow.captureScript = .init(search: L10n.language == "ja" ? "アイコン" : "icons")
            case "SERVERSETTINGS-dirty":
                SettingsWindow.captureScript = .init(values: ["server-port": "70000", "max-players": "40"])
            case "SERVERSETTINGS-secret": SettingsWindow.captureScript = .init(reveal: "rcon.password")
            default: break
            }
            let main = NSApp.windows.first(where: { $0.isVisible && $0.canBecomeMain })
            app.openSettings(settingsPage(for: id) ?? .app(.general))
            try? await Task.sleep(for: .milliseconds(1200))
            if let settings = NSApp.windows.first(where: { $0.isVisible && $0 !== main && $0.frame.width > 500 }) {
                main?.orderOut(nil)
                NSApp.activate()
                settings.makeKeyAndOrderFront(nil)
            } else {
                signal("[capture] Settings window did not open")
            }
            // The upgrade wizard asks the providers for versions first; the Java
            // page asks Adoptium.
            let wait =
                switch id {
                case "SERVERSETTINGS-upgrade": 5000
                case "SETTINGS-java": 4000
                default: 1500
                }
            try? await Task.sleep(for: .milliseconds(wait))
        }

        /// Two real backups of the fixture server, one tagged with a note.
        private static func makeSampleBackups(serverID: String) async {
            for name in ["before-update.zip", "nightly.zip"] {
                do {
                    let outcome = try await CoreClient.createBackup(
                        serverID: serverID, backupName: name, compressionLevel: 5
                    ).value()
                    signal("[capture] backup \(name): \(outcome)")
                } catch {
                    signal("[capture] backup \(name) failed: \(error.code) \(error.message)")
                }
            }
            _ = try? await CoreClient.setBackupMetadata(
                serverID: serverID, backupName: "before-update.zip", tags: ["before-update", "stable"],
                note: "Taken before the 1.21.10 upgrade")
        }

        /// Replaces the generated archive catalog with a directory so the
        /// normal atomic catalog write fails during the first list operation.
        private static func corruptBackupCatalog(serverID: String) {
            guard let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] else {
                signal("[capture] data directory is unavailable for catalog failure")
                return
            }
            let backupDirectory = URL(fileURLWithPath: dataDir, isDirectory: true)
                .appendingPathComponent("backups/\(serverID)", isDirectory: true)
            let catalogDirectory = backupDirectory.appendingPathComponent(
                ".mc-vector-backup-catalog.json", isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: catalogDirectory, withIntermediateDirectories: true)
            } catch {
                signal("[capture] could not corrupt backup catalog: \(error.localizedDescription)")
            }
        }

        static func runAutomaticBackupCapture(serverID: String, runtime: ServerRuntime) async {
            await startStandIn(runtime: runtime, serverID: serverID)
            guard let scheduler = AutoBackupScheduler.captureInstance else {
                signal("[capture] automatic backup scheduler is unavailable")
                return
            }
            do {
                let created = try await scheduler.captureTickNow(serverID: serverID)
                signal("[capture] automatic scheduler tick created backup: \(created)")
            } catch {
                signal("[capture] automatic scheduler tick failed: \(error)")
            }
        }

        /// Right-clicks the first backup row (BACKUPS-context-menu). Posting mouse
        /// events needs the Accessibility grant; without it, report that at once
        /// so capture.sh stops waiting, and open the settings pane.
        static func rightClickFirstBackup(id: String) async {
            // The prompt option also lists the app in the Accessibility pane, so
            // it only needs switching on.
            let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
            guard AXIsProcessTrustedWithOptions(options) else {
                signal("[capture] accessibility required: \(id)")
                if let url = URL(
                    string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                {
                    NSWorkspace.shared.open(url)
                }
                return
            }
            guard let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.isVisible }) else {
                signal("[capture] no window for backup context menu")
                return
            }
            // The click goes to whatever window is on top at that point, so bring
            // the app forward first.
            NSApp.activate()
            window.makeKeyAndOrderFront(nil)
            try? await Task.sleep(for: .milliseconds(500))
            // Menu items' onAppear does not run for context menus; the menu
            // reports that it opened through this notification instead.
            var token: NSObjectProtocol?
            token = NotificationCenter.default.addObserver(
                forName: NSMenu.didBeginTrackingNotification, object: nil, queue: .main
            ) { _ in
                MainActor.assumeIsolated {
                    markViewReady(for: id)
                    if let token { NotificationCenter.default.removeObserver(token) }
                }
            }
            // CGEvent uses global coordinates with the origin at the top left of
            // the primary screen; AppKit frames start at its bottom left. The
            // first row sits about a fifth of the way down the fixture window.
            let primaryHeight = NSScreen.screens.first?.frame.height ?? window.frame.maxY
            let point = CGPoint(
                x: window.frame.minX + window.frame.width * 0.45,
                y: primaryHeight - window.frame.maxY + window.frame.height * 0.2
            )
            CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: point, mouseButton: .right)?
                .post(tap: .cghidEventTap)
            CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: point, mouseButton: .right)?
                .post(tap: .cghidEventTap)
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
        static func importSource(_ name: String) -> URL {
            let dataDir = ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] ?? NSTemporaryDirectory()
            return URL(fileURLWithPath: dataDir).deletingLastPathComponent()
                .appendingPathComponent("import-source").appendingPathComponent(name)
        }

        /// Records a line for capture.sh from anywhere in the app.
        static func note(_ line: String) {
            if line.hasPrefix("[capture] high cpu notice:") { highCpuNoticeCount += 1 }
            signal(line)
        }

        /// Writes the line to stderr and, when `MCVECTOR_CAPTURE_SIGNAL` names a file,
        /// appends it there. capture.sh launches the app through `open`, which cannot
        /// redirect the app's output, so it watches that file instead.
        static func signal(_ line: String) {
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
