// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// "Accept the Minecraft EULA?" before a start or restart (React ServerEulaModal).
struct ServerEulaSheet: View {
    let serverID: String
    @Environment(AppState.self) private var app
    @Environment(ServerRuntime.self) private var runtime
    @State private var agreed = false
    @State private var isSaving = false
    @State private var failed = false

    private static let eulaURL = URL(string: "https://www.minecraft.net/eula")!

    var body: some View {
        Form {
            FormTitle(text: L10n.t("server.eula.title"))
            Section {
                Link(destination: Self.eulaURL) {
                    Label(L10n.t("server.eula.openLink"), systemImage: "arrow.up.right.square")
                }
                Toggle(L10n.t("server.eula.consentLabel"), isOn: $agreed)
                    .disabled(isSaving)
            } footer: {
                if failed { FieldError(L10n.t("server.eula.writeError")).transition(.motionRise) }
            }
        }
        .formStyle(.grouped)
        .animation(Motion.standard, value: failed)
        .animation(Motion.snappy, value: agreed)
        .fixedSize(horizontal: false, vertical: true)
        .frame(width: 480)
        .interactiveDismissDisabled(isSaving)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.t("common.cancel")) {
                    runtime.declineEula()
                    app.activeSheet = nil
                }
                .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.t(isSaving ? "server.eula.saving" : "server.eula.acceptAndStart")) {
                    Task { await accept() }
                }
                .disabled(!agreed || isSaving)
            }
        }
    }

    /// Saves eula.txt while the sheet is open, so a failure is shown here;
    /// then closes it and runs the waiting start or restart.
    private func accept() async {
        isSaving = true
        failed = false
        do throws(CoreError) {
            try CoreClient.acceptServerEula(id: serverID)
        } catch {
            isSaving = false
            failed = true
            return
        }
        app.activeSheet = nil
        await runtime.resumeAfterEula()
    }
}
