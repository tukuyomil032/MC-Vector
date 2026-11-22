// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import GlassKit
import MCVectorCore
import SwiftUI

/// Loads the shared settings once per page and saves each change immediately,
/// reverting the control when saving fails (React SettingsWindow behavior).
@MainActor
@Observable
private final class AppSettingsModel {
    var settings = AppSettings(locale: nil, updateChannel: "stable", allowUnverifiedPluginDownloads: false)
    var error: CoreError?

    init() {
        do { settings = try CoreClient.appSettings() } catch { self.error = error }
    }
}

/// App › General: appearance, updates and plugin download security, the
/// settings React's SettingsWindow holds, plus the Native display choices.
struct AppGeneralPane: View {
    @State private var model = AppSettingsModel()
    @AppStorage(BackupsLayout.storageKey) private var backupsLayout: BackupsLayout = .cards
    @AppStorage(PluginsPaging.storageKey) private var pluginsPaging: PluginsPaging = .infinite
    @AppStorage(FilesBarSettings.hiddenKey) private var hiddenFilesBarGroups = ""

    var body: some View {
        Form {
            SettingsPreviewSection {
                AppWindowPreview(backupsLayout: backupsLayout)
            }
            Section(L10n.t("native.settings.section.appearance")) {
                SettingsRow(key: "settings.language.label") {
                    Picker(L10n.t("settings.language.label"), selection: language) {
                        Text(L10n.t("settings.language.options.en")).tag("en")
                        Text(L10n.t("settings.language.options.ja")).tag("ja")
                    }
                    .labelsHidden()
                    .fixedSize()
                }
                SettingsRow(key: "native.settings.backupsLayout", alignment: .top) {
                    SettingsVisualPicker(
                        options: BackupsLayout.allCases, selection: $backupsLayout, title: { L10n.t($0.titleKey) },
                        thumbnail: { BackupsLayoutThumbnail(layout: $0) })
                }
                SettingsRow(key: "native.settings.pluginsPaging", alignment: .top) {
                    SettingsVisualPicker(
                        options: PluginsPaging.allCases, selection: $pluginsPaging, title: { L10n.t($0.titleKey) },
                        thumbnail: { PluginsPagingThumbnail(paging: $0) })
                }
            }
            Section {
                ForEach(FilesBarSettings.Group.allCases) { group in
                    SettingsRow(title: L10n.t(group.titleKey)) {
                        Toggle(L10n.t(group.titleKey), isOn: filesBarGroupShown(group))
                            .toggleStyle(.switch)
                            .labelsHidden()
                    }
                }
            } header: {
                Text(L10n.t("native.settings.filesBar"))
                    .infoHint(L10n.help("native.settings.filesBar") ?? "")
            }
            Section(L10n.t("settings.update.title")) {
                SettingsRow(key: "native.settings.updateCheck", subtitle: L10n.t("settings.update.idle")) {
                    // Wired with the Sparkle updater (DIST-003).
                    Button(L10n.t("settings.update.checkButton")) {}
                        .disabled(true)
                        .help(L10n.t("native.notPorted"))
                }
                SettingsRow(
                    key: "settings.update.channelLabel",
                    note: model.settings.updateChannel == "beta" ? L10n.t("native.settings.betaWarning") : nil
                ) {
                    Picker(L10n.t("settings.update.channelLabel"), selection: updateChannel) {
                        Text(L10n.t("settings.update.channels.stable")).tag("stable")
                        Text(L10n.t("settings.update.channels.beta")).tag("beta")
                    }
                    .labelsHidden()
                    .fixedSize()
                }
            }
            Section(L10n.t("settings.security.title")) {
                SettingsRow(
                    key: "settings.security.label",
                    note: model.settings.allowUnverifiedPluginDownloads ? L10n.t("settings.security.warning") : nil
                ) {
                    Toggle(L10n.t("settings.security.label"), isOn: allowUnverified)
                        .toggleStyle(.switch)
                        .labelsHidden()
                }
            }
        }
        .formStyle(.grouped)
        .settingsErrorAlert($model.error)
    }

    // MARK: Bindings that save at once

    /// One group of the Files bar, shown or hidden.
    private func filesBarGroupShown(_ group: FilesBarSettings.Group) -> Binding<Bool> {
        Binding(
            get: { !hiddenFilesBarGroups.split(separator: ",").contains(Substring(group.rawValue)) },
            set: { shown in
                var hidden = Set(hiddenFilesBarGroups.split(separator: ",").map(String.init))
                if shown { hidden.remove(group.rawValue) } else { hidden.insert(group.rawValue) }
                hiddenFilesBarGroups = hidden.sorted().joined(separator: ",")
            }
        )
    }
    private var language: Binding<String> {
        Binding(
            get: { model.settings.locale ?? L10n.language },
            set: { newValue in
                do throws(CoreError) {
                    try CoreClient.setLocale(newValue)
                    model.settings.locale = newValue
                    L10n.configure(locale: newValue)
                } catch {
                    model.error = error
                }
            })
    }

    private var updateChannel: Binding<String> {
        Binding(
            get: { model.settings.updateChannel },
            set: { newValue in
                do throws(CoreError) {
                    try CoreClient.setUpdateChannel(newValue)
                    withAnimation(Motion.snappy) { model.settings.updateChannel = newValue }
                } catch {
                    model.error = error
                }
            })
    }

    private var allowUnverified: Binding<Bool> {
        Binding(
            get: { model.settings.allowUnverifiedPluginDownloads },
            set: { newValue in
                do throws(CoreError) {
                    try CoreClient.setAllowUnverifiedPluginDownloads(newValue)
                    withAnimation(Motion.snappy) { model.settings.allowUnverifiedPluginDownloads = newValue }
                } catch {
                    model.error = error
                }
            })
    }
}

/// App › About, shaped like Snapzy's: the icon, name and version on top,
/// then who made it and where to get help.
struct AboutPane: View {
    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "–"
        let build = info?["CFBundleVersion"] as? String ?? "–"
        return "MC-Vector Native \(short) (\(build))"
    }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 6) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable()
                        .frame(width: 112, height: 112)
                        .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
                    Text(verbatim: "MC-Vector")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                    Text(L10n.t("native.settings.tagline"))
                        .foregroundStyle(.secondary)
                    Text(verbatim: version)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .padding(.top, 6)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
            }
            Section {
                LabeledContent(L10n.t("native.settings.author")) { Text(verbatim: "tukuyomi032") }
                LabeledContent(L10n.t("native.settings.license")) { Text(verbatim: "GPL-3.0-or-later") }
            }
            Section {
                LabeledContent(L10n.t("native.settings.support")) {
                    VStack(alignment: .trailing, spacing: 10) {
                        AboutLink(title: "GitHub", url: "https://github.com/tukuyomil032/MC-Vector")
                        AboutLink(
                            title: L10n.t("native.settings.reportIssue"),
                            url: "https://github.com/tukuyomil032/MC-Vector/issues")
                        if let notices = Bundle.main.url(forResource: "ThirdPartyNotices", withExtension: "txt") {
                            Button {
                                NSWorkspace.shared.open(notices)
                            } label: {
                                Label(L10n.t("native.settings.thirdPartyNotices"), systemImage: "arrow.up.right")
                                    .labelStyle(TrailingIconLabelStyle())
                            }
                            .buttonStyle(.link)
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
    }
}

private struct AboutLink: View {
    let title: String
    let url: String

    var body: some View {
        if let destination = URL(string: url) {
            Link(destination: destination) {
                Label(title, systemImage: "arrow.up.right").labelStyle(TrailingIconLabelStyle())
            }
        }
    }
}

/// Title first, then a small icon (Snapzy's "GitHub ↗").
private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.title
            configuration.icon.font(.caption.weight(.semibold))
        }
    }
}

extension View {
    /// A failed save is shown as an alert; the control keeps the stored value.
    fileprivate func settingsErrorAlert(_ error: Binding<CoreError?>) -> some View {
        alert(
            L10n.t("native.settings.saveFailed"),
            isPresented: Binding(get: { error.wrappedValue != nil }, set: { if !$0 { error.wrappedValue = nil } }),
            presenting: error.wrappedValue
        ) { _ in
            Button(L10n.t("common.close")) { error.wrappedValue = nil }
        } message: { error in
            Text(error.uiText)
        }
    }
}
