// SPDX-License-Identifier: GPL-3.0-or-later

import SwiftUI

/// First step of "Add Server" (React AddServerChoiceModal): create a new
/// server or import an existing folder. Import arrives in a later phase.
struct AddServerChoiceSheet: View {
    enum Choice: Hashable {
        case create
        case importFolder
    }

    @Environment(AppState.self) private var app
    @State private var choice: Choice?

    var body: some View {
        Form {
            Section {
                Picker(L10n.t("addServer.choice.title"), selection: $choice) {
                    ChoiceRow(
                        title: L10n.t("addServer.choice.newServer"),
                        hint: L10n.t("addServer.choice.newServerHint")
                    )
                    .tag(Choice?.some(.create))
                    ChoiceRow(
                        title: L10n.t("addServer.choice.importServer"),
                        hint: L10n.t("addServer.choice.importServerHint")
                    )
                    .tag(Choice?.some(.importFolder))
                    .disabled(true)
                }
                .pickerStyle(.radioGroup)
                .labelsHidden()
            } header: {
                Text(L10n.t("addServer.choice.title"))
            } footer: {
                Text(L10n.t("native.addServer.importUnavailable"))
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.t("common.cancel")) { app.activeSheet = nil }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(L10n.t("common.next")) {
                    if choice == .create { app.activeSheet = .addServer }
                }
                .disabled(choice != .create)
            }
        }
    }
}

private struct ChoiceRow: View {
    let title: String
    let hint: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
            Text(hint)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
