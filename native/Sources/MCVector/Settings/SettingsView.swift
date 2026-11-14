// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// The Settings window (⌘, / app menu / toolbar gear), shaped like System Settings:
/// a searchable sidebar of panes with icon tiles, and a grouped form on the right.
/// Holds the same settings as React's SettingsWindow (language, update channel,
/// unverified plugin downloads) plus an About pane.
struct SettingsView: View {
    @State private var selection: SettingsPane? = Self.initialPane
    @State private var search = ""

    private static var initialPane: SettingsPane {
        #if DEBUG
        // capture.sh opens a pane directly with `--capture-state SETTINGS-<pane>`.
        if let id = CaptureState.requestedID, id.hasPrefix("SETTINGS-"),
           let pane = SettingsPane(rawValue: String(id.dropFirst("SETTINGS-".count))) {
            return pane
        }
        #endif
        return .general
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(SettingsPane.groups, id: \.self) { group in
                    Section {
                        ForEach(group.filter { $0.matches(search) }) { pane in
                            Label {
                                Text(pane.title)
                            } icon: {
                                SettingsIconTile(symbol: pane.symbol, color: pane.tint)
                            }
                            .tag(pane)
                        }
                    }
                }
            }
            .searchable(text: $search, placement: .sidebar, prompt: Text(L10n.t("native.settings.search")))
            .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 260)
            // Like System Settings, the sidebar is always shown.
            .toolbar(removing: .sidebarToggle)
        } detail: {
            Group {
                switch selection ?? .general {
                case .general: GeneralPane()
                case .updates: UpdatesPane()
                case .security: SecurityPane()
                case .about: AboutPane()
                }
            }
            .navigationTitle((selection ?? .general).title)
        }
        .frame(minWidth: 680, idealWidth: 720, minHeight: 460, idealHeight: 480)
        #if DEBUG
        .onAppear { selection = Self.initialPane }
        #endif
    }
}

enum SettingsPane: String, Identifiable, Hashable {
    case general, updates, security, about

    var id: String { rawValue }

    /// Sidebar groups, separated like System Settings.
    static let groups: [[SettingsPane]] = [[.general, .updates, .security], [.about]]

    var title: String {
        switch self {
        case .general: L10n.t("native.settings.general")
        case .updates: L10n.t("settings.update.title")
        case .security: L10n.t("settings.security.title")
        case .about: L10n.t("native.settings.about")
        }
    }

    var symbol: String {
        switch self {
        case .general: "gearshape.fill"
        case .updates: "arrow.down.circle.fill"
        case .security: "lock.shield.fill"
        case .about: "info.circle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .general: .gray
        case .updates: .blue
        case .security: .red
        case .about: .indigo
        }
    }

    /// Search matches the pane title and the labels it contains.
    func matches(_ query: String) -> Bool {
        let query = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !query.isEmpty else { return true }
        let words: [String] = switch self {
        case .general: [L10n.t("settings.language.label"), "language"]
        case .updates: [L10n.t("settings.update.channelLabel"), "update", "beta"]
        case .security: [L10n.t("settings.security.label"), "plugin", "security"]
        case .about: ["version", "github", "license"]
        }
        return ([title] + words).contains { $0.lowercased().contains(query) }
    }
}

/// System Settings style icon: a white symbol on a colored rounded square.
private struct SettingsIconTile: View {
    let symbol: String
    let color: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(color.gradient, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

// MARK: Panes

/// Loads the shared settings once per pane and saves each change immediately,
/// reverting the control when saving fails (React SettingsWindow behavior).
@MainActor
@Observable
private final class SettingsModel {
    var settings = AppSettings(locale: nil, updateChannel: "stable", allowUnverifiedPluginDownloads: false)
    var error: CoreError?

    init() {
        do { settings = try CoreClient.appSettings() } catch { self.error = error }
    }
}

private struct GeneralPane: View {
    @State private var model = SettingsModel()

    var body: some View {
        Form {
            Section {
                Picker(L10n.t("settings.language.label"), selection: Binding<String>(
                    get: { model.settings.locale ?? L10n.language },
                    set: { newValue in
                        do throws(CoreError) {
                            try CoreClient.setLocale(newValue)
                            model.settings.locale = newValue
                            L10n.configure(locale: newValue)
                        } catch {
                            model.error = error
                        }
                    }
                )) {
                    Text(L10n.t("settings.language.options.en")).tag("en")
                    Text(L10n.t("settings.language.options.ja")).tag("ja")
                }
            } footer: {
                Text(L10n.t("settings.language.description"))
            }
        }
        .formStyle(.grouped)
        .settingsErrorAlert($model.error)
    }
}

private struct UpdatesPane: View {
    @State private var model = SettingsModel()

    var body: some View {
        Form {
            Section {
                LabeledContent(L10n.t("settings.update.description")) {
                    // Wired with the Sparkle updater (DIST-003).
                    Button(L10n.t("settings.update.checkButton")) {}
                        .disabled(true)
                        .help(L10n.t("native.notPorted"))
                }
                LabeledContent(L10n.t("native.settings.status"), value: L10n.t("settings.update.idle"))
            }
            Section {
                Picker(L10n.t("settings.update.channelLabel"), selection: Binding(
                    get: { model.settings.updateChannel },
                    set: { newValue in
                        do throws(CoreError) {
                            try CoreClient.setUpdateChannel(newValue)
                            model.settings.updateChannel = newValue
                        } catch {
                            model.error = error
                        }
                    }
                )) {
                    Text(L10n.t("settings.update.channels.stable")).tag("stable")
                    Text(L10n.t("settings.update.channels.beta")).tag("beta")
                }
            } footer: {
                Text(L10n.t(
                    model.settings.updateChannel == "beta"
                        ? "settings.update.betaDescription" : "settings.update.stableDescription"
                ))
            }
        }
        .formStyle(.grouped)
        .settingsErrorAlert($model.error)
    }
}

private struct SecurityPane: View {
    @State private var model = SettingsModel()

    var body: some View {
        Form {
            Section {
                Toggle(L10n.t("settings.security.label"), isOn: Binding(
                    get: { model.settings.allowUnverifiedPluginDownloads },
                    set: { newValue in
                        do throws(CoreError) {
                            try CoreClient.setAllowUnverifiedPluginDownloads(newValue)
                            model.settings.allowUnverifiedPluginDownloads = newValue
                        } catch {
                            model.error = error
                        }
                    }
                ))
            } header: {
                Text(L10n.t("settings.security.description"))
            } footer: {
                if model.settings.allowUnverifiedPluginDownloads {
                    Label(L10n.t("settings.security.warning"), systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }
        }
        .formStyle(.grouped)
        .settingsErrorAlert($model.error)
    }
}

private struct AboutPane: View {
    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "–"
        let build = info?["CFBundleVersion"] as? String ?? "–"
        return "MC-Vector Native \(short) (\(build))"
    }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 8) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable()
                        .frame(width: 96, height: 96)
                    Text("MC-Vector")
                        .font(.title.bold())
                    Text(L10n.t("native.settings.tagline"))
                        .foregroundStyle(.secondary)
                    Text(version)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            Section {
                LabeledContent(L10n.t("native.settings.author"), value: "tukuyomi032")
                LabeledContent(L10n.t("native.settings.license"), value: "GPL-3.0-or-later")
                Link(destination: URL(string: "https://github.com/tukuyomil032/MC-Vector")!) {
                    Label("GitHub", systemImage: "arrow.up.right.square")
                }
                Link(destination: URL(string: "https://github.com/tukuyomil032/MC-Vector/issues")!) {
                    Label(L10n.t("native.settings.reportIssue"), systemImage: "arrow.up.right.square")
                }
            }
        }
        .formStyle(.grouped)
    }
}

private extension View {
    /// A failed save is shown as an alert; the control keeps the stored value.
    func settingsErrorAlert(_ error: Binding<CoreError?>) -> some View {
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
