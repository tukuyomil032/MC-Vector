// SPDX-License-Identifier: GPL-3.0-or-later
// swiftlint:disable function_body_length cyclomatic_complexity
#if DEBUG
    import AppKit
    import MCVectorCore
    import SwiftUI

    extension CaptureState {
        static func verifyState(_ id: String, app: AppState, feedback: FeedbackCenter, runtime: ServerRuntime) async {
            switch id {
            case "VERIFY-clone":
                if let copy = try? await CoreClient.cloneServer(id: "server-1", name: "E2E Server Copy") {
                    await app.reloadServers()
                    check("clone", app.servers.contains { $0.id == copy.id } && copy.id != "server-1")
                    app.selectedServerID = copy.id
                    feedback.toast(.success, L10n.t("server.toast.cloned"))
                } else {
                    check("clone", false, "clone failed")
                    feedback.toast(.error, L10n.t("server.toast.cloneFailed"))
                }
            case "VERIFY-delete":
                let deleted = (try? await CoreClient.deleteServer(id: "server-1")) ?? false
                await app.reloadServers()
                check("delete", deleted && !app.servers.contains { $0.id == "server-1" })
                feedback.toast(
                    deleted ? .success : .error,
                    L10n.t(deleted ? "server.toast.deleted" : "server.toast.deleteFailed")
                )
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
                    check("created", app.servers.contains { $0.id == created.server.id })
                    app.selectedServerID = created.server.id
                    feedback.toast(.info, L10n.t("native.addServer.createdManualJar", ["name": created.server.name]))
                } catch {
                    check("created", false, error.localizedDescription)
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
                    check("created", !cancelOnDownload, "creation completed instead of cancelling")
                    if !cancelOnDownload { check("jar installed", created.jarInstalled) }
                    signal(
                        "[capture] created \(created.server.software) \(created.server.version) jar=\(created.jarInstalled) path=\(created.server.path)"
                    )
                    feedback.toast(.success, L10n.t("server.toast.created", ["name": created.server.name]))
                } catch {
                    check("creation outcome", cancelOnDownload && error.code == "operation.cancelled", error.code)
                    signal("[capture] create failed: \(error.code) \(error.message)")
                    feedback.toast(.error, error.uiText)
                }
            case "VERIFY-import":
                // Real import of the fixture folder through the FFI.
                let model = ImportServerModel()
                await model.choose(folder: importSource("paper-survival"))
                if let created = await model.importServer() {
                    await app.reloadServers()
                    app.selectedServerID = created.server.id
                    check("imported", app.servers.contains { $0.id == created.server.id })
                    let copied = FileManager.default.fileExists(atPath: created.server.path + "/world/level.dat")
                    check("world copied", copied)
                    signal(
                        "[capture] imported \(created.server.software) \(created.server.version) port=\(created.server.port ?? 0) world=\(copied) path=\(created.server.path)"
                    )
                    feedback.toast(.success, L10n.t("importServer.toast.success"))
                } else {
                    check("imported", false, model.failure?.code ?? "unknown")
                    signal("[capture] import failed: \(model.failure?.code ?? "?") \(model.failure?.message ?? "")")
                    feedback.toast(.error, model.failure?.uiText ?? "?")
                }
            case "VERIFY-start-stop":
                await runtime.start("server-1")
                try? await Task.sleep(for: .seconds(1))
                check("online after start", runtime.status(of: "server-1") == "online", runtime.status(of: "server-1"))
                signal("[capture] after start: \(runtime.status(of: "server-1"))")
                do throws(CoreError) {
                    try await runtime.send("list", to: "server-1")
                    check("first send", true)
                } catch {
                    check("first send", false, error.code)
                    signal("[capture] send failed: \(error.code)")
                }
                do throws(CoreError) {
                    try await runtime.send("list", to: "server-1")
                    check("rate limit", false, "second command accepted")
                    signal("[capture] second send within 100 ms was accepted")
                } catch {
                    check("rate limit", error.message.contains("sent too quickly"), error.code)
                    signal("[capture] rate limit: \(error.code)")
                }
                try? await Task.sleep(for: .milliseconds(500))
                await runtime.stop("server-1")
                try? await Task.sleep(for: .milliseconds(300))
                let lines = runtime.logs["server-1"] ?? []
                check("offline after stop", runtime.status(of: "server-1") == "offline", runtime.status(of: "server-1"))
                check("stderr seen", lines.contains(where: \.isStderr))
                signal(
                    "[capture] after stop: \(runtime.status(of: "server-1")) lines=\(lines.count) stderr=\(lines.contains(where: \.isStderr)) last=\(lines.last?.text ?? "")"
                )
                app.navigate(to: .console)
            case "VERIFY-crash":
                await startStandIn(runtime: runtime, serverID: "server-1")
                try? await runtime.send("crash", to: "server-1")
                try? await Task.sleep(for: .seconds(1))
                check("crashed", runtime.status(of: "server-1") == "crashed", runtime.status(of: "server-1"))
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
                    check("paper done", done)
                    check("paper metrics", runtime.metrics[id]?.resource.isEmpty == false)
                    signal(
                        "[capture] paper done=\(done) status=\(runtime.status(of: id)) lines=\(runtime.logs[id]?.count ?? 0)"
                    )
                    try? await runtime.send("list", to: id)
                    try? await Task.sleep(for: .seconds(1))
                    signal("[capture] list reply: \(runtime.logs[id]?.last?.text ?? "")")
                    await runtime.stop(id)
                    check("offline after stop", runtime.status(of: id) == "offline", runtime.status(of: id))
                    signal("[capture] after stop: \(runtime.status(of: id))")
                } catch {
                    check("real paper", false, error.code)
                    signal("[capture] real paper failed: \(error.code) \(error.message)")
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
                    check("paper metrics", snapshot?.resource.isEmpty == false && snapshot?.tps.isEmpty == false)
                    check("paper done", runtime.logs[id]?.contains { $0.text.contains("Done (") } == true)
                    signal(
                        "[capture] paper metrics resource=\(snapshot?.resource.count ?? 0) tps=\(snapshot?.tps.map(\.tps) ?? [])"
                    )
                    await runtime.stop(id)
                    check("offline after stop", runtime.status(of: id) == "offline", runtime.status(of: id))
                } catch {
                    check("real paper", false, error.code)
                    signal("[capture] real paper failed: \(error.code) \(error.message)")
                }
            case "VERIFY-template":
                do {
                    try await CoreClient.saveTemplate(fromServer: "server-1", name: "Survival Template")
                    check("template saved", true)
                    feedback.toast(.success, L10n.t("server.toast.templateSaved"))
                } catch {
                    check("template saved", false, error.localizedDescription)
                    feedback.toast(.error, L10n.t("server.toast.templateSaveFailed"))
                }
            default: break
            }
        }
    }
#endif
