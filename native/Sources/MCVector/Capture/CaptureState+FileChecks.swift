// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import Foundation
    import MCVectorCore
    import Quartz

    extension CaptureState {
        @MainActor
        static func verifyEditor(app: AppState) async {
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
                check("bom+crlf kept", bytes("bom-crlf.properties") == expected)

                let mixed = try await CoreClient.readTextDocument(serverID: server, relative: "editor/mixed.txt")
                check("mixed read", mixed.mixedLineEndings)
                signal("[capture] mixed read: ending=\(mixed.lineEnding) mixed=\(mixed.mixedLineEndings)")
                try await CoreClient.writeTextDocument(
                    serverID: server, relative: "editor/mixed.txt", document: mixed)
                signal(
                    "[capture] mixed saved as crlf: \(bytes("editor/mixed.txt") == Array("a\r\nb\r\nc\r\n".utf8))")
                check("mixed saved as crlf", bytes("editor/mixed.txt") == Array("a\r\nb\r\nc\r\n".utf8))
            } catch {
                check("editor round trip", false, error.code)
                signal("[capture] editor round trip failed: \(error.code)")
            }
            await verifyEditorLimits(server: server)
            app.navigate(to: .files)
        }

        @MainActor
        private static func verifyEditorLimits(server: String) async {
            let listing = (try? await CoreClient.listFiles(serverID: server, relative: "editor")) ?? []
            for name in ["size-under.txt", "size-limit.txt", "size-over.txt", "not-utf8.txt"] {
                guard let item = listing.first(where: { $0.name == name }) else {
                    signal("[capture] \(name): missing")
                    check(name, false, "missing fixture")
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
                let expected = ["size-under.txt", "size-limit.txt"].contains(name) ? "ready" : "unsupported"
                check(name, phase == expected, "expected \(expected), got \(phase)")
            }
        }

        /// Every SVG the icon catalog names ships in the app, and names map as
        /// Material Icon Theme does (Minecraft's folders to the app's own icons).
        @MainActor
        static func verifyFileIcons() {
            let named = Set(
                [FileIconCatalog.plainFile, FileIconCatalog.plainFolder]
                    + FileIconCatalog.minecraftFolders.values + FileIconCatalog.folders.values
                    + FileIconCatalog.files.values + FileIconCatalog.extensions.values)
            let missing = named.filter { FileIconImages.image(named: $0) == nil }.sorted()
            check("file icons ship", missing.isEmpty, "missing: \(missing.joined(separator: ", "))")
            let files = [
                "server.properties": "settings", "Bukkit.YML": "yaml", "paper.jar": "java", "r.0.0.mca": "minecraft",
                "notes.unknown": FileIconCatalog.plainFile,
            ]
            let folders = [
                "plugins": "folder-plugin", "Logs": "folder-log", "world": "mcv-folder-world",
                "DIM-1": "mcv-folder-world-nether", "my-stuff": FileIconCatalog.plainFolder,
            ]
            for (name, icon) in files { checkIcon(name, isDirectory: false, icon) }
            for (name, icon) in folders { checkIcon(name, isDirectory: true, icon) }
        }

        private static func checkIcon(_ name: String, isDirectory: Bool, _ icon: String) {
            let actual = FileIconCatalog.iconName(for: name, isDirectory: isDirectory)
            check("file icon \(name)", actual == icon, "got \(actual), expected \(icon)")
        }

        /// Each folder keeps the view switched to in it, new folders open in the
        /// default view, and column view stays while browsing.
        @MainActor
        static func verifyViewModes() {
            let serverID = "e2e-view-modes"
            let model = FilesModel(serverID: serverID)
            defer {
                for folder in ["", "plugins", "config"] {
                    FilesViewMode.forget(serverID: serverID, folder: folder)
                }
            }
            model.viewMode = .icons
            model.navigate(to: ["plugins"])
            check("files view: new folder", model.viewMode == .preferred, "got \(model.viewMode)")
            model.navigate(to: [])
            check("files view: remembered", model.viewMode == .icons, "got \(model.viewMode)")
            model.viewMode = .columns
            model.navigate(to: ["config"])
            check("files view: columns stay", model.viewMode == .columns, "got \(model.viewMode)")
            check(
                "files view: opening is not choosing",
                FilesViewMode.remembered(serverID: serverID, folder: "config") == nil)
        }

        /// Opening folders one by one keeps every folder above as a filled
        /// column (it used to go blank once it stopped being the current one).
        @MainActor
        static func verifyColumns() async {
            let model = FilesModel(serverID: "server-1")
            defer {
                for folder in ["", "plugins", "plugins/Essentials"] {
                    FilesViewMode.forget(serverID: "server-1", folder: folder)
                }
            }
            await model.reload()
            model.navigate(to: ["plugins"])
            await model.reload()
            model.navigate(to: ["plugins", "Essentials"])
            await model.reload()
            let root = model.columnListings[""]?.map(\.name) ?? []
            let plugins = model.columnListings["plugins"]?.map(\.name) ?? []
            check("columns: server folder kept", root.contains("plugins"), "got \(root)")
            check("columns: plugins kept", plugins.contains("Essentials"), "got \(plugins)")
            check(
                "columns: current folder not kept", model.columnListings["plugins/Essentials"] == nil,
                "the current folder should come from its live rows")
        }

        /// Text facts (BOM, line endings, lines), the Open With list and the
        /// Quick Look panel, on the fixture's files.
        @MainActor
        static func verifyPreviewAndInfo() async {
            let model = FilesModel(serverID: "server-1")
            await model.reload()
            func facts(_ name: String) async -> TextFacts? {
                guard let row = model.items.first(where: { $0.name == name }) else { return nil }
                return await TextFacts.load(serverID: model.serverID, relative: model.relative(name), row: row)
            }
            let plain = await facts("server.properties")
            check(
                "info: plain text", plain == TextFacts(lines: 2, hasBOM: false, lineEnding: .lf, mixed: false),
                "got \(String(describing: plain))")
            let bom = await facts("bom-crlf.properties")
            check(
                "info: BOM and CRLF", bom?.hasBOM == true && bom?.lineEnding == .crlf, "got \(String(describing: bom))")
            check("info: no text facts for a jar", await facts("server.jar") == nil)

            let apps = model.openWithApps(for: "server.properties")
            check("open with: apps listed", !apps.isEmpty, "no apps")
            check("open with: default first", apps.first?.isDefault ?? false, "\(apps.map(\.name))")

            model.selection = ["server.properties"]
            FilesQuickLook.shared.toggle(model)
            try? await Task.sleep(for: .milliseconds(600))
            let shown = FilesQuickLook.shared.itemCount
            check("quick look: opens", FilesQuickLook.isOpen)
            check("quick look: shows the selection", shown == 1, "\(shown) items")
            check(
                "quick look: panel reads it", QLPreviewPanel.shared()?.currentPreviewItem != nil,
                "the panel has no current item")
            FilesQuickLook.shared.toggle(model)
            try? await Task.sleep(for: .milliseconds(400))
            check("quick look: closes", !FilesQuickLook.isOpen)
        }

        @MainActor
        static func verifyFiles(app: AppState) async {
            verifyFileIcons()
            verifyViewModes()
            await verifyColumns()
            await verifyPreviewAndInfo()
            // Real file operations through the FFI, logged for capture.sh.
            let server = "server-1"
            func step(_ label: String, expectsError: Bool = false, _ work: () async throws -> Void) async {
                do {
                    try await work()
                    signal("[capture] \(label): ok")
                    check(label, !expectsError, "expected an error")
                } catch {
                    check(label, expectsError, "\(error)")
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
            await step("create existing file", expectsError: true) {
                try await CoreClient.createFileEntry(
                    serverID: server, parent: "", name: "server.properties", isDirectory: false)
            }
            await step("rename") {
                try await CoreClient.renameFileEntry(
                    serverID: server, relative: "notes/todo.txt", newName: "done.txt")
            }
            await step("rename onto existing", expectsError: true) {
                try await CoreClient.renameFileEntry(serverID: server, relative: "notes", newName: "config")
            }
            await step("move") {
                try await CoreClient.moveFileEntries(serverID: server, entries: ["notes"], destination: "plugins")
            }
            await step("bad name", expectsError: true) {
                try await CoreClient.createFileEntry(serverID: server, parent: "", name: "a/b", isDirectory: false)
            }
            await step("delete") {
                try await CoreClient.deleteFileEntries(serverID: server, entries: ["plugins/notes"])
            }
            await verifyFileRoundTrip(server: server)
            await step("non-UTF-8 refused", expectsError: true) {
                _ = try await CoreClient.readTextDocument(serverID: server, relative: "editor/not-utf8.txt")
            }
            await verifyArchives(server: server)
            let listing = (try? await CoreClient.listFiles(serverID: server, relative: "")) ?? []
            signal(
                "[capture] root: \(listing.map { $0.isDirectory ? $0.name + "/" : $0.name }.joined(separator: " "))"
            )
            app.navigate(to: .files)
        }
        @MainActor
        private static func verifyFileRoundTrip(server: String) async {
            let url = try? CoreClient.fileEntryURL(serverID: server, relative: "bom-crlf.properties")
            let original = url.flatMap { try? Data(contentsOf: $0) }
            do {
                let document = try await CoreClient.readTextDocument(
                    serverID: server, relative: "bom-crlf.properties")
                signal(
                    "[capture] document bom=\(document.hasBom) ending=\(document.lineEnding)"
                        + " text=\(document.text.debugDescription)"
                )
                try await CoreClient.writeTextDocument(
                    serverID: server, relative: "bom-crlf.properties", document: document)
                check("round trip", true)
            } catch {
                check("round trip", false, "\(error)")
            }
            let after = url.flatMap { try? Data(contentsOf: $0) }
            signal("[capture] bytes unchanged=\(original == after && original != nil)")
            check("bytes unchanged", original == after && original != nil)
        }

        @MainActor
        private static func verifyArchives(server: String) async {
            do {
                let sourceURL = try CoreClient.fileEntryURL(serverID: server, relative: "config/paper.yml")
                let original = try Data(contentsOf: sourceURL)
                let before = try await CoreClient.listFiles(serverID: server, relative: "")
                let first = try await CoreClient.compressFileEntries(serverID: server, parent: "", names: ["config"])
                check("compress first", first == "config.zip", "returned \(first)")
                let second = try await CoreClient.compressFileEntries(serverID: server, parent: "", names: ["config"])
                check("compress second", second == "config 2.zip", "returned \(second)")
                let extracted = try await CoreClient.extractFileEntry(serverID: server, relative: first)
                let listing = try await CoreClient.listFiles(serverID: server, relative: "")
                check(
                    "extract new folder",
                    !before.contains(where: { $0.name == extracted })
                        && listing.contains(where: { $0.name == extracted && $0.isDirectory }),
                    "returned \(extracted)")
                check("extract preserves config", try Data(contentsOf: sourceURL) == original)
                let extractedURL = try CoreClient.fileEntryURL(
                    serverID: server, relative: "\(extracted)/config/paper.yml")
                check("extract contents", try Data(contentsOf: extractedURL) == original)
                let copies = try await CoreClient.duplicateFileEntries(
                    serverID: server, parent: "", names: ["server.properties"])
                check("duplicate name", copies == ["server copy.properties"], "returned \(copies)")
                let source = try CoreClient.fileEntryURL(serverID: server, relative: "server.properties")
                let copy = try CoreClient.fileEntryURL(serverID: server, relative: "server copy.properties")
                check("duplicate contents", try Data(contentsOf: source) == Data(contentsOf: copy))
            } catch {
                check("archive and duplicate operations", false, "\(error)")
            }
        }
    }
#endif
