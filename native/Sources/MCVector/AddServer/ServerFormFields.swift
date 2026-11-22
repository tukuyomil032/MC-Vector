// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
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
            LabeledContent(L10n.t("addServer.port.label")) {
                RollingNumberField(title: L10n.t("addServer.port.label"), text: $portText, range: 1...65_535)
            }
            LabeledContent(L10n.t("addServer.memory.label")) {
                RollingNumberField(
                    title: L10n.t("addServer.memory.label"), text: $memoryText, range: 1...1_024,
                    unit: L10n.t("native.addServer.memoryUnit")
                )
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
            case .downloading(let percent):
                RollingPercent(label: downloadingLabel, fraction: percent.map { Double($0) / 100 })
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

/// A number that rolls to its new value like the dashboard's figures, with a
/// stepper beside it. Clicking the number turns it into a text field for typing;
/// Return or leaving the field shows the rolling number again.
struct RollingNumberField: View {
    let title: String
    @Binding var text: String
    let range: ClosedRange<Int>
    var unit: String?
    var step: Int = 1

    @State private var isEditing = false
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Group {
                if isEditing {
                    TextField(title, text: $text)
                        .labelsHidden()
                        .multilineTextAlignment(.trailing)
                        .focused($focused)
                        .onSubmit { isEditing = false }
                        .onChange(of: focused) { _, isFocused in if !isFocused { isEditing = false } }
                } else {
                    Button {
                        isEditing = true
                        focused = true
                    } label: {
                        Text(text.isEmpty ? "–" : text)
                            .monospacedDigit()
                            .contentTransition(.numericText(value: Double(Int(text) ?? 0)))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help(L10n.t("native.addServer.clickToType"))
                    .accessibilityLabel(Text(title))
                    .accessibilityValue(Text(text))
                }
            }
            .frame(width: 72)
            if let unit {
                Text(unit).foregroundStyle(.secondary)
            }
            Stepper(
                title,
                value: Binding(
                    get: { Int(text) ?? range.lowerBound },
                    set: { value in
                        withAnimation(Motion.value) {
                            text = String(min(max(value, range.lowerBound), range.upperBound))
                        }
                    }
                ),
                in: range,
                step: step
            )
            .labelsHidden()
        }
        .animation(Motion.value, value: text)
    }
}

/// The version picker as a menu button whose number rolls when it changes.
struct VersionMenu: View {
    let title: String
    let versions: [String]
    @Binding var selection: String

    var body: some View {
        LabeledContent(title) {
            Menu {
                Picker(title, selection: $selection) {
                    ForEach(versions, id: \.self) { version in
                        Text(version).tag(version)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } label: {
                Text(selection.isEmpty ? "–" : selection)
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }
            .menuStyle(.button)
            .fixedSize()
            .animation(Motion.value, value: selection)
        }
    }
}
