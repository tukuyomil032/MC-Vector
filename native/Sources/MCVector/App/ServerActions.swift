// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore

/// Server management actions from the sidebar context menu (React
/// `use-server-context-actions.ts`): the same confirmations, defaults and toasts.
@MainActor
struct ServerActions {
    let app: AppState
    let feedback: FeedbackCenter

    /// Confirm, delete the server and its managed folder, then select the first
    /// remaining server when the deleted one was selected.
    func delete(_ server: ServerProfile) async {
        let confirmed = await feedback.confirm(
            title: L10n.t("common.delete"),
            description: L10n.t("server.confirm.deleteManaged", ["name": server.name, "path": server.path]),
            confirmLabel: L10n.t("common.delete"),
            isDanger: true
        )
        guard confirmed else { return }
        do {
            if try await CoreClient.deleteServer(id: server.id) {
                await app.reloadServers(selectFirstIfMissing: true)
                feedback.success(L10n.t("server.toast.deleted"))
            } else {
                feedback.error(L10n.t("server.toast.deleteFailed"))
            }
        } catch {
            feedback.error(L10n.t(
                error.code == "server.running" ? "server.toast.deleteRunning" : "server.toast.deleteError"
            ))
        }
    }

    /// Confirm, clone as "<name> Copy", then select the copy.
    func clone(_ server: ServerProfile) async {
        let confirmed = await feedback.confirm(
            title: L10n.t("common.confirm"),
            description: L10n.t("server.confirm.clone", ["name": server.name])
        )
        guard confirmed else { return }
        do {
            let copy = try await CoreClient.cloneServer(
                id: server.id,
                name: L10n.t("server.create.cloneDefaultName", ["name": server.name])
            )
            await app.reloadServers(selectFirstIfMissing: true)
            app.selectedServerID = copy.id
            feedback.success(L10n.t("server.toast.cloned"))
        } catch {
            feedback.error(L10n.t("server.toast.cloneFailed"))
        }
    }

    /// Ask for a name, then save the server's settings as a template.
    func saveAsTemplate(_ server: ServerProfile) async {
        guard let name = await feedback.prompt(
            title: L10n.t("server.create.templateNamePrompt"),
            label: L10n.t("server.create.templateNameLabel"),
            defaultValue: L10n.t("server.create.templateDefaultName", ["name": server.name]),
            confirmLabel: L10n.t("common.save")
        ) else { return }
        do {
            try await CoreClient.saveTemplate(fromServer: server.id, name: name)
            feedback.success(L10n.t("server.toast.templateSaved"))
        } catch {
            feedback.error(L10n.t("server.toast.templateSaveFailed"))
        }
    }
}
