// SPDX-License-Identifier: GPL-3.0-or-later

#if DEBUG
    import MCVectorCore
    import SwiftUI

    extension CaptureState {
        /// FILES-new, -move, -activity, -trashed, -rename, -filter: the Files view
        /// with one of its popovers, sheets or the filter open.
        @MainActor
        static func showFilesAction(_ id: String, app: AppState) async {
            if id == "FILES-zip" {
                // A real archive of the config folder, selected so Extract is available.
                if let server = app.selectedServerID,
                    let archive = try? await CoreClient.compressFileEntries(
                        serverID: server, parent: "", names: ["config"])
                {
                    FilesView.capturePreset = .init(selection: [archive])
                }
                app.navigate(to: .files)
                return
            }
            FilesView.capturePreset = .init(selection: ["config"])
            app.navigate(to: .files)
            guard let server = app.selectedServerID else { return }
            let files = app.files(for: server)
            try? await Task.sleep(for: .seconds(0.9))
            switch id {
            case "FILES-new": files.isShowingNew = true
            case "FILES-move": files.requestMove(["config"])
            case "FILES-activity":
                files.activity = FileActivity(
                    anchor: .row("config"),
                    message: L10n.t(
                        "native.files.activity.compressing",
                        ["subject": L10n.t("native.files.quoted", ["name": "config"])]),
                    state: .running)
            case "FILES-trashed":
                files.activity = FileActivity(
                    anchor: .folder,
                    message: L10n.t(
                        "native.files.activity.trashed",
                        ["subject": L10n.t("native.files.quoted", ["name": "notes.txt"])]),
                    state: .done)
            case "FILES-rename": Task { await files.rename("server.properties") }
            case "FILES-trash-confirm": Task { await files.trash(["config"]) }
            default:
                files.isFiltering = true
                files.filter = "con"
            }
        }
    }
#endif
