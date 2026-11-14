// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorCore
import SwiftUI

/// Port and memory as typed by the user. Out-of-range values are reported,
/// never clamped (unlike the React NumberField).
enum ServerNumbers {
    static let defaultPort = "25565"
    static let defaultMemory = "4"

    static func port(_ text: String) -> UInt32? {
        UInt32(text.trimmingCharacters(in: .whitespaces)).flatMap { (1...65_535).contains($0) ? $0 : nil }
    }

    static func memoryGB(_ text: String) -> UInt32? {
        UInt32(text.trimmingCharacters(in: .whitespaces)).flatMap { (1...1_024).contains($0) ? $0 : nil }
    }

    static func portError(_ text: String) -> String? {
        port(text) == nil ? L10n.t("addServer.port.invalid") : nil
    }

    static func memoryError(_ text: String) -> String? {
        memoryGB(text) == nil ? L10n.t("error.server.invalid_memory") : nil
    }
}

/// The port and memory section shared by the create and import sheets.
struct PortMemorySection: View {
    @Binding var portText: String
    @Binding var memoryText: String

    var body: some View {
        Section {
            TextField(L10n.t("addServer.port.label"), text: $portText)
                .multilineTextAlignment(.trailing)
            LabeledContent(L10n.t("addServer.memory.label")) {
                HStack(spacing: 6) {
                    TextField(L10n.t("addServer.memory.label"), text: $memoryText)
                        .labelsHidden()
                        .multilineTextAlignment(.trailing)
                        .frame(width: 64)
                    Text(L10n.t("native.addServer.memoryUnit"))
                        .foregroundStyle(.secondary)
                    Stepper(
                        L10n.t("addServer.memory.label"),
                        value: Binding(
                            get: { Int(memoryText) ?? 1 },
                            set: { memoryText = String(min(max($0, 1), 1_024)) }
                        ),
                        in: 1...1_024
                    )
                    .labelsHidden()
                }
            }
        } footer: {
            VStack(alignment: .leading, spacing: 2) {
                if let error = ServerNumbers.portError(portText) { FieldError(error).transition(.motionRise) }
                if let error = ServerNumbers.memoryError(memoryText) { FieldError(error).transition(.motionRise) }
            }
            .animation(Motion.standard, value: ServerNumbers.portError(portText))
            .animation(Motion.standard, value: ServerNumbers.memoryError(memoryText))
        }
    }
}

/// The software picker, grouped like React's `softwareSelectOptions`. `extra`
/// adds a detected software that the form does not offer (Purpur, CraftBukkit).
struct SoftwarePicker: View {
    let options: [SoftwareOption]
    var extra: String?
    @Binding var selection: String

    var body: some View {
        Picker(L10n.t("addServer.software.label"), selection: $selection) {
            if let extra, !options.contains(where: { $0.name == extra }) {
                Text(extra).tag(extra)
            }
            ForEach(SoftwareGroup.allInFormOrder, id: \.self) { group in
                Section(L10n.t(group.labelKey)) {
                    ForEach(options.filter { $0.group == group }, id: \.name) { option in
                        Text(L10n.t("addServer.software.options.\(option.name.lowercased())"))
                            .tag(option.name)
                    }
                }
            }
        }
    }
}

/// A sheet title as the first row of a grouped form.
struct FormTitle: View {
    let text: String

    var body: some View {
        Section {
        } header: {
            Text(text)
                .font(.headline)
                .foregroundStyle(.primary)
        }
    }
}

struct FieldError: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Label(text, systemImage: "exclamationmark.circle.fill")
            .foregroundStyle(.red)
    }
}

/// Progress of `CoreClient.createServer`, shared by both sheets.
struct CreationProgressView: View {
    let title: String
    /// Shown while a jar downloads.
    let downloadingLabel: String
    /// Shown before the first progress event (looking up the download, or copying).
    let workingLabel: String
    let stage: CreationStage

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            switch stage {
            case .resolving:
                ProgressView { Text(workingLabel) }
            case let .downloading(percent):
                if let percent {
                    ProgressView(value: Double(percent), total: 100) {
                        Text(downloadingLabel)
                    } currentValueLabel: {
                        Text("\(percent)%").monospacedDigit()
                    }
                } else {
                    ProgressView { Text(downloadingLabel) }
                }
            case .finishing:
                ProgressView { Text(L10n.t("native.addServer.finishing")) }
            }
        }
        .progressViewStyle(.linear)
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension SoftwareGroup {
    static let allInFormOrder: [SoftwareGroup] = [.standard, .modded, .proxy]

    var labelKey: String {
        switch self {
        case .standard: "addServer.software.groups.standard"
        case .modded: "addServer.software.groups.modded"
        case .proxy: "addServer.software.groups.proxy"
        }
    }
}
