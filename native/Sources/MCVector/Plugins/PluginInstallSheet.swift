// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// "Install this plugin?" with the files the core plans to place, required
/// dependencies and the warnings its policy raised (React install preview).
struct PluginInstallSheet: View {
    let model: PluginsModel
    let pending: PluginsModel.PendingInstall
    @Environment(\.dismiss) private var dismiss
    @Environment(FeedbackCenter.self) private var feedback

    var body: some View {
        let preview = pending.preview
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(
                    L10n.t(
                        pending.replacing == nil
                            ? "plugins.browser.installPlanConfirmTitle" : "plugins.browser.dupUpdate")
                )
                .font(.headline)
                Text(pending.title).font(.subheadline).foregroundStyle(.secondary)
            }
            VStack(spacing: 0) {
                ForEach(Array(preview.artifacts.enumerated()), id: \.element.id) { index, artifact in
                    if index > 0 { Divider() }
                    HStack(spacing: 10) {
                        PluginIcon(url: nil, name: artifact.title, size: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(artifact.title).font(.body.weight(.medium))
                            Text(artifact.version).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(artifact.fileName).font(.caption.monospaced()).foregroundStyle(.secondary)
                            if let old = artifact.installedFileName {
                                Text(L10n.t("plugins.browser.dupExistingFile", ["file": old]))
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                    .padding(10)
                }
            }
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                Text(L10n.t("plugins.browser.installPlanTarget", ["directory": preview.targetDirectory]))
                let dependencies = preview.artifacts.filter(\.dependency).map(\.title)
                if !dependencies.isEmpty {
                    Text(
                        L10n.t(
                            "plugins.browser.installPlanDependencies",
                            ["names": dependencies.joined(separator: ", ")]))
                }
                if case .confirm(let unknown, let unverified) = preview.policy {
                    if unknown {
                        Label(
                            L10n.t("plugins.browser.installPlanUnknownCompatibility"),
                            systemImage: "questionmark.circle"
                        )
                        .foregroundStyle(.orange)
                    }
                    if unverified {
                        Label(
                            L10n.t("plugins.browser.installPlanUnverifiedWarning"),
                            systemImage: "exclamationmark.shield"
                        )
                        .foregroundStyle(.orange)
                    }
                }
            }
            .font(.callout)
            .foregroundStyle(.secondary)

            HStack {
                Spacer()
                Button(L10n.t("common.cancel")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(
                    L10n.t(
                        pending.replacing == nil
                            ? "plugins.browser.installPlanConfirmButton" : "plugins.browser.update")
                ) {
                    dismiss()
                    Task { await model.execute(pending, feedback: feedback) }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(width: 460)
    }
}
