// SPDX-License-Identifier: GPL-3.0-or-later

import AppKit
import MCVectorCore
import SwiftUI

/// The General Settings categories (React ServerSettings sections).
enum GeneralSettingsCategory: String, CaseIterable, Identifiable, Sendable {
    case basic
    case runtime
    case jvm
    case autoRestart
    case autoBackup
    case notifications

    var id: String { rawValue }

    var titleKey: String { "native.serverSettings.general.\(rawValue)" }

    var symbol: String {
        switch self {
        case .basic: "server.rack"
        case .runtime: "memorychip"
        case .jvm: "cpu"
        case .autoRestart: "arrow.clockwise"
        case .autoBackup: "clock.arrow.circlepath"
        case .notifications: "bell.badge"
        }
    }

    var tint: Color {
        switch self {
        case .basic: .blue
        case .runtime: .orange
        case .jvm: .indigo
        case .autoRestart: .green
        case .autoBackup: .teal
        case .notifications: .red
        }
    }

    /// Row titles, for the overview subtitle and for search.
    var rowKeys: [String] {
        switch self {
        case .basic:
            [
                "serverSettings.serverName", "serverSettings.profileName", "serverSettings.groupName",
                "serverSettings.serverSoftware", "serverSettings.version", "serverSettings.savePath",
            ]
        case .runtime: ["serverSettings.javaRuntime", "serverSettings.memory", "serverSettings.port"]
        case .jvm: ["serverSettings.jvmArgs.presetsLabel", "serverSettings.jvmArgs.customLabel"]
        case .autoRestart:
            [
                "serverSettings.autoRestart.title", "serverSettings.autoRestart.maxRetries",
                "serverSettings.autoRestart.delaySeconds",
            ]
        case .autoBackup:
            [
                "serverSettings.autoBackup.title", "serverSettings.autoBackup.scheduleType",
                "serverSettings.autoBackup.retainCount", "serverSettings.autoBackup.retainDays",
            ]
        case .notifications:
            [
                "serverSettings.notifications.onCrash", "serverSettings.notifications.onStart",
                "serverSettings.notifications.onHighCpu", "serverSettings.notifications.cpuThreshold",
            ]
        }
    }

    func matches(_ query: String) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return ([titleKey] + rowKeys).contains { L10n.t($0).lowercased().contains(needle) }
    }
}

/// The General half of the Server Settings window.
struct GeneralSettingsPage: View {
    let page: ServerSettingsPage
    let search: String
    let model: GeneralSettingsModel
    let open: (ServerSettingsPage) -> Void

    var body: some View {
        switch model.load {
        case .loading:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let error):
            ContentUnavailableView {
                Label(L10n.t("native.serverSettings.loadFailed"), systemImage: "exclamationmark.triangle")
            } description: {
                Text(error.uiText)
            } actions: {
                Button(L10n.t("properties.retry")) { Task { await model.reload() } }
            }
        case .loaded:
            if !search.isEmpty {
                let found = GeneralSettingsCategory.allCases.filter { $0.matches(search) }
                if found.isEmpty {
                    ContentUnavailableView.search(text: search)
                } else {
                    Form {
                        ForEach(found) { category in
                            Section(L10n.t(category.titleKey)) { GeneralRows(category: category, model: model) }
                        }
                    }
                    .formStyle(.grouped)
                }
            } else if case .category(_, let id) = page, let category = GeneralSettingsCategory(rawValue: id) {
                Form {
                    GeneralRows(category: category, model: model)
                }
                .formStyle(.grouped)
            } else {
                overview
            }
        }
    }

    private var overview: some View {
        Form {
            Section {
                SettingsHero(
                    symbol: ServerSettingsSection.general.symbol, color: ServerSettingsSection.general.color,
                    title: L10n.t("nav.generalSettings"), subtitle: L10n.t("native.serverSettings.generalSubtitle"))
            }
            .listRowBackground(Color.clear)
            Section {
                ForEach(GeneralSettingsCategory.allCases) { category in
                    SettingsLinkRow(
                        title: L10n.t(category.titleKey),
                        subtitle: category.rowKeys.prefix(3).map { L10n.t($0) }.joined(separator: "、"),
                        symbol: category.symbol, color: category.tint
                    ) { open(.category(.general, category.id)) }
                }
            }
        }
        .formStyle(.grouped)
    }
}

/// The rows of one General Settings category, as Form sections.
private struct GeneralRows: View {
    let category: GeneralSettingsCategory
    let model: GeneralSettingsModel
    @Environment(\.openSettings) private var openSettings
    @State private var showsUpgrade = false

    var body: some View {
        if model.draft != nil {
            switch category {
            case .basic: basic
            case .runtime: runtime
            case .jvm: jvm
            case .autoRestart: autoRestart
            case .autoBackup: autoBackup
            case .notifications: notifications
            }
        }
    }

    // MARK: Bindings

    private func field<Value>(_ keyPath: WritableKeyPath<ServerSettingsUpdate, Value>, _ fallback: Value)
        -> Binding<Value>
    {
        Binding(
            get: { model.draft?[keyPath: keyPath] ?? fallback },
            set: { model.draft?[keyPath: keyPath] = $0 })
    }

    /// A whole-number field as text for RollingNumberField.
    private func number<Value: BinaryInteger>(_ keyPath: WritableKeyPath<ServerSettingsUpdate, Value>)
        -> Binding<String>
    {
        Binding(
            get: { model.draft.map { String($0[keyPath: keyPath]) } ?? "" },
            set: { text in if let value = Int(text) { model.draft?[keyPath: keyPath] = Value(clamping: value) } })
    }

    private func toggle(_ keyPath: WritableKeyPath<ServerSettingsUpdate, Bool>) -> Binding<Bool> {
        Binding(
            get: { model.draft?[keyPath: keyPath] ?? false },
            set: { value in withAnimation(Motion.snappy) { model.draft?[keyPath: keyPath] = value } })
    }

    private var draft: ServerSettingsUpdate { model.draft! }

    // MARK: Sections

    @ViewBuilder
    private var basic: some View {
        Section {
            SettingsRow(title: L10n.t("serverSettings.serverName")) {
                TextField(L10n.t("serverSettings.serverName"), text: field(\.name, ""))
                    .textFieldStyle(.roundedBorder).labelsHidden().frame(width: 260)
            }
            SettingsRow(title: L10n.t("serverSettings.profileName")) {
                TextField(
                    L10n.t("serverSettings.profileName"), text: field(\.profileName, ""),
                    prompt: Text(L10n.t("serverSettings.profileNamePlaceholder"))
                )
                .textFieldStyle(.roundedBorder).labelsHidden().frame(width: 260)
            }
            SettingsRow(title: L10n.t("serverSettings.groupName")) {
                TextField(
                    L10n.t("serverSettings.groupName"), text: field(\.groupName, ""),
                    prompt: Text(L10n.t("serverSettings.groupNamePlaceholder"))
                )
                .textFieldStyle(.roundedBorder).labelsHidden().frame(width: 260)
            }
        }
        Section {
            SoftwarePicker(
                options: CoreClient.softwareOptions(), extra: draft.software, selection: field(\.software, ""))
            VersionMenu(
                title: L10n.t("serverSettings.version"),
                versions: Self.versions(including: draft.version), selection: field(\.version, ""))
            SettingsRow(title: L10n.t("serverSettings.versionUpgrade.buttonLabel")) {
                Button(L10n.t("serverSettings.versionUpgrade.buttonLabel")) { showsUpgrade = true }
                    .sheet(isPresented: $showsUpgrade) {
                        UpgradeWizard(serverID: model.serverID) { Task { await model.reload() } }
                    }
                    #if DEBUG
                        .task {
                            if CaptureState.requestedID == "SERVERSETTINGS-upgrade" {
                                try? await Task.sleep(for: .milliseconds(300))
                                showsUpgrade = true
                            }
                        }
                    #endif
            }
        } footer: {
            Text(L10n.t("native.serverSettings.softwareFooter"))
        }
        Section {
            SettingsRow(title: L10n.t("serverSettings.savePath")) {
                HStack(spacing: 8) {
                    Text(model.saved?.serverPath ?? "")
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                    Button(L10n.t("native.serverSettings.showInFinder")) {
                        if let path = model.saved?.serverPath {
                            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var runtime: some View {
        Section {
            SettingsRow(title: L10n.t("serverSettings.javaRuntime")) {
                HStack(spacing: 8) {
                    Picker(L10n.t("serverSettings.javaRuntime"), selection: field(\.javaPath, nil)) {
                        Text(L10n.t("serverSettings.javaSystemDefault")).tag(String?.none)
                        if let path = draft.javaPath {
                            Text(path).tag(String?.some(path))
                        }
                    }
                    .labelsHidden()
                    .fixedSize()
                    Button(L10n.t("native.serverSettings.chooseJava")) { chooseJava() }
                }
            }
            SettingsRow(title: L10n.t("serverSettings.manageJava")) {
                Button(L10n.t("serverSettings.manageJava")) {
                    SettingsNavigation.shared.open(.java)
                    openSettings()
                }
            }
        }
        Section {
            SettingsRow(title: L10n.t("serverSettings.memory")) {
                RollingNumberField(
                    title: L10n.t("serverSettings.memory"), text: number(\.memoryMb), range: 1024...1_048_576,
                    unit: "MB", step: 512
                )
                .fixedSize()
            }
            SettingsRow(title: L10n.t("serverSettings.port")) {
                RollingNumberField(title: L10n.t("serverSettings.port"), text: number(\.port), range: 1...65535)
                    .fixedSize()
            }
        } footer: {
            Text(L10n.t("native.serverSettings.restartFooter"))
        }
    }

    @ViewBuilder
    private var jvm: some View {
        Section {
            SettingsRow(title: L10n.t("serverSettings.jvmArgs.presetsLabel")) {
                Picker(L10n.t("serverSettings.jvmArgs.presetsLabel"), selection: preset) {
                    Text(L10n.t("native.serverSettings.jvmCustom")).tag(JvmPreset?.none)
                    ForEach(JvmPreset.allCases) { preset in
                        Text(L10n.t(preset.labelKey)).tag(JvmPreset?.some(preset))
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(L10n.t("serverSettings.jvmArgs.customLabel"))
                TextEditor(text: field(\.jvmArgs, ""))
                    .font(.callout.monospaced())
                    .frame(minHeight: 90)
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(.background.secondary, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.separator))
            }
        } footer: {
            Text(L10n.t("serverSettings.jvmArgs.help"))
        }
    }

    @ViewBuilder
    private var autoRestart: some View {
        Section {
            SettingsRow(
                title: L10n.t("serverSettings.autoRestart.title"),
                help: L10n.t("serverSettings.autoRestart.enableDescription")
            ) {
                Toggle("", isOn: toggle(\.autoRestartOnCrash)).toggleStyle(.switch).labelsHidden()
            }
            if draft.autoRestartOnCrash {
                SettingsRow(title: L10n.t("serverSettings.autoRestart.maxRetries")) {
                    RollingNumberField(
                        title: L10n.t("serverSettings.autoRestart.maxRetries"), text: number(\.maxAutoRestarts),
                        range: 0...20
                    )
                    .fixedSize()
                }
                SettingsRow(title: L10n.t("serverSettings.autoRestart.delaySeconds")) {
                    RollingNumberField(
                        title: L10n.t("serverSettings.autoRestart.delaySeconds"),
                        text: number(\.autoRestartDelaySec), range: 1...300, unit: L10n.t("native.unit.seconds")
                    )
                    .fixedSize()
                }
            }
        }
    }

    @ViewBuilder
    private var autoBackup: some View {
        Section {
            SettingsRow(
                title: L10n.t("serverSettings.autoBackup.title"),
                help: L10n.t("serverSettings.autoBackup.enableDescription")
            ) {
                Toggle("", isOn: toggle(\.autoBackupEnabled)).toggleStyle(.switch).labelsHidden()
            }
            if draft.autoBackupEnabled {
                SettingsRow(title: L10n.t("serverSettings.autoBackup.scheduleType")) {
                    Picker(
                        L10n.t("serverSettings.autoBackup.scheduleType"),
                        selection: Binding(
                            get: { draft.autoBackupScheduleType },
                            set: { value in withAnimation(Motion.snappy) { model.draft?.autoBackupScheduleType = value }
                            }
                        )
                    ) {
                        Text(L10n.t("serverSettings.autoBackup.scheduleOptions.interval"))
                            .tag(AutoBackupScheduleType.interval)
                        Text(L10n.t("serverSettings.autoBackup.scheduleOptions.daily")).tag(
                            AutoBackupScheduleType.daily)
                        Text(L10n.t("serverSettings.autoBackup.scheduleOptions.weekly"))
                            .tag(AutoBackupScheduleType.weekly)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .fixedSize()
                }
                switch draft.autoBackupScheduleType {
                case .interval:
                    SettingsRow(title: L10n.t("serverSettings.autoBackup.intervalMinutes")) {
                        RollingNumberField(
                            title: L10n.t("serverSettings.autoBackup.intervalMinutes"),
                            text: number(\.autoBackupIntervalMin), range: 1...1440, unit: L10n.t("native.unit.minutes")
                        )
                        .fixedSize()
                    }
                case .daily, .weekly:
                    if draft.autoBackupScheduleType == .weekly {
                        SettingsRow(title: L10n.t("serverSettings.autoBackup.weekday")) {
                            Picker(
                                L10n.t("serverSettings.autoBackup.weekday"), selection: field(\.autoBackupWeekday, 0)
                            ) {
                                ForEach(Array(Self.weekdays.enumerated()), id: \.offset) { index, key in
                                    Text(L10n.t("serverSettings.weekdays.\(key)")).tag(UInt8(index))
                                }
                            }
                            .labelsHidden()
                            .fixedSize()
                        }
                    }
                    SettingsRow(title: L10n.t("serverSettings.autoBackup.executionTime")) {
                        DatePicker(
                            L10n.t("serverSettings.autoBackup.executionTime"), selection: backupTime,
                            displayedComponents: .hourAndMinute
                        )
                        .labelsHidden()
                    }
                }
            }
        }
        if draft.autoBackupEnabled {
            Section {
                SettingsRow(title: L10n.t("serverSettings.autoBackup.retainCount")) {
                    RollingNumberField(
                        title: L10n.t("serverSettings.autoBackup.retainCount"),
                        text: number(\.autoBackupRetainCount), range: 0...999
                    )
                    .fixedSize()
                }
                SettingsRow(title: L10n.t("serverSettings.autoBackup.retainDays")) {
                    RollingNumberField(
                        title: L10n.t("serverSettings.autoBackup.retainDays"), text: number(\.autoBackupRetainDays),
                        range: 0...365, unit: L10n.t("native.unit.days")
                    )
                    .fixedSize()
                }
            } footer: {
                Text(L10n.t("native.serverSettings.retainFooter"))
            }
        }
    }

    @ViewBuilder
    private var notifications: some View {
        Section {
            SettingsRow(title: L10n.t("serverSettings.notifications.onCrash")) {
                Toggle("", isOn: toggle(\.notifyOnCrash)).toggleStyle(.switch).labelsHidden()
            }
            SettingsRow(title: L10n.t("serverSettings.notifications.onStart")) {
                Toggle("", isOn: toggle(\.notifyOnStart)).toggleStyle(.switch).labelsHidden()
            }
            SettingsRow(title: L10n.t("serverSettings.notifications.onHighCpu")) {
                Toggle("", isOn: toggle(\.notifyOnHighCpu)).toggleStyle(.switch).labelsHidden()
            }
            if draft.notifyOnHighCpu {
                SettingsRow(title: L10n.t("serverSettings.notifications.cpuThreshold")) {
                    HStack(spacing: 10) {
                        Slider(value: cpuThreshold, in: 1...100, step: 1).frame(width: 180)
                        Text("\(draft.notifyHighCpuThreshold)%")
                            .monospacedDigit()
                            .contentTransition(.numericText(value: Double(draft.notifyHighCpuThreshold)))
                            .animation(Motion.value, value: draft.notifyHighCpuThreshold)
                            .frame(width: 44, alignment: .trailing)
                    }
                }
            }
        }
    }

    // MARK: Helpers

    private static let weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    private static func versions(including current: String) -> [String] {
        let bundled = CreateServerModel.loadBundledVersions()
        return bundled.contains(current) || current.isEmpty ? bundled : [current] + bundled
    }

    private var preset: Binding<JvmPreset?> {
        Binding(
            get: { JvmPreset.allCases.first { $0.args == draft.jvmArgs } },
            set: { model.draft?.jvmArgs = $0?.args ?? "" })
    }

    private var cpuThreshold: Binding<Double> {
        Binding(
            get: { Double(draft.notifyHighCpuThreshold) },
            set: { model.draft?.notifyHighCpuThreshold = UInt8(clamping: Int($0)) })
    }

    /// "HH:mm" as a date for DatePicker, and back.
    private var backupTime: Binding<Date> {
        Binding(
            get: {
                let parts = draft.autoBackupTime.split(separator: ":").compactMap { Int($0) }
                let components = DateComponents(
                    hour: parts.first ?? 3, minute: parts.count > 1 ? parts[1] : 0)
                return Calendar.current.date(from: components) ?? .now
            },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                model.draft?.autoBackupTime = String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
            })
    }

    private func chooseJava() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.message = L10n.t("native.serverSettings.chooseJavaMessage")
        if panel.runModal() == .OK, let url = panel.url {
            model.draft?.javaPath = url.path
        }
    }
}

/// React's JVM argument presets (src/renderer/shared/jvm-presets.ts).
enum JvmPreset: String, CaseIterable, Identifiable, Hashable {
    case aikar
    case zgc

    var id: String { rawValue }
    var labelKey: String { "serverSettings.jvmArgs.presets.\(rawValue)" }

    var args: String {
        switch self {
        case .aikar:
            "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions "
                + "-XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 "
                + "-XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 "
                + "-XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 "
                + "-XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 "
                + "-XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs "
                + "-Daikars.new.flags=true"
        case .zgc:
            "-XX:+UseZGC -XX:+ZGenerational -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch"
        }
    }
}
