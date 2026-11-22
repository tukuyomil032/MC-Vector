// SPDX-License-Identifier: GPL-3.0-or-later

import GlassKit
import MCVectorEditorKit
import SwiftUI

/// A page of the Properties tile: its server.properties keys in small titled sections.
struct PropertiesPage: View {
    let group: PropertiesGroup
    let model: PropertiesModel
    /// The server's name, for the server list preview.
    let serverName: String

    var body: some View {
        switch model.load {
        case .loading:
            ProgressView(L10n.t("properties.loading"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let error):
            ContentUnavailableView {
                Label(L10n.t("properties.loadFailed"), systemImage: "exclamationmark.triangle")
            } description: {
                Text("\(L10n.t("properties.loadFailedDescription"))\n\(error.uiText)")
            } actions: {
                Button(L10n.t("properties.retry")) { Task { await model.reloadAgain() } }
            }
        case .loaded:
            Form {
                if group == .game {
                    SettingsPreviewSection {
                        ServerListPreview(
                            name: serverName, motd: model.values["motd"] ?? "",
                            maxPlayers: model.values["max-players"] ?? "20")
                    }
                }
                ForEach(model.sections(of: group), id: \.id) { section in
                    Section(section.title) {
                        if section.id == "distance" { distancePreview }
                        PropertyRows(keys: section.keys, model: model)
                    }
                }
            }
            .formStyle(.grouped)
        }
    }
}

extension PropertiesPage {
    /// The chunk map above the distance fields.
    private var distancePreview: some View {
        let label = { (key: String) in
            model.layout.categories.flatMap(\.keys).first { $0.key == key }?.label.current ?? key
        }
        return ChunkDistancePreview(
            viewDistance: Int(model.values["view-distance"] ?? "") ?? 10,
            simulationDistance: Int(model.values["simulation-distance"] ?? "") ?? 10,
            viewLabel: label("view-distance"), simulationLabel: label("simulation-distance"))
    }
}

/// The rows of one category.
private struct PropertyRows: View {
    let keys: [PropertiesLayout.Key]
    let model: PropertiesModel

    var body: some View {
        ForEach(keys) { key in
            PropertyRow(key: key, model: model)
        }
    }
}

/// One server.properties key as a settings row.
private struct PropertyRow: View {
    let key: PropertiesLayout.Key
    let model: PropertiesModel

    @State private var isRevealed = false

    private var value: Binding<String> {
        Binding(get: { model.values[key.key] ?? "" }, set: { model.values[key.key] = $0 })
    }

    var body: some View {
        SettingsRow(
            title: key.label.current, doc: model.docs[key.key], note: model.rangeNote(for: key),
            alignment: Self.pictured.keys.contains(key.key) ? .top : .center
        ) {
            if let options = Self.pictured[key.key] {
                SettingsVisualPicker(
                    options: options, selection: value, size: CGSize(width: 70, height: 48), title: choiceTitle
                ) { option in
                    if key.key == "gamemode" {
                        GameModeThumbnail(mode: option)
                    } else {
                        DifficultyThumbnail(difficulty: option)
                    }
                }
            } else {
                control
            }
        }
        #if DEBUG
            .onChange(of: model.captureRevealKey) { _, requested in
                if requested == key.key { isRevealed = true }
            }
        #endif
    }

    @ViewBuilder
    private var control: some View {
        switch key.control {
        case .toggle:
            Toggle(
                key.label.current,
                isOn: Binding(
                    get: { value.wrappedValue.lowercased() == "true" },
                    set: { isOn in withAnimation(Motion.snappy) { value.wrappedValue = isOn ? "true" : "false" } }
                )
            )
            .toggleStyle(.switch)
            .labelsHidden()
        case .choice:
            Picker(key.label.current, selection: value) {
                ForEach(choices, id: \.self) { choice in
                    Text(choiceTitle(choice)).tag(choice)
                }
            }
            .labelsHidden()
            .fixedSize()
        case .number:
            RollingNumberField(
                title: key.label.current, text: value, range: (key.min ?? 0)...(key.max ?? 2_147_483_647)
            )
            .fixedSize()
        case .text:
            TextField(key.label.current, text: value, prompt: Text(placeholder))
                .textFieldStyle(.roundedBorder)
                .labelsHidden()
                .multilineTextAlignment(.trailing)
                .frame(width: 260)
        case .secret:
            HStack(spacing: 6) {
                Group {
                    if isRevealed {
                        TextField(key.label.current, text: value)
                    } else {
                        SecureField(key.label.current, text: value)
                    }
                }
                .textFieldStyle(.roundedBorder)
                .labelsHidden()
                .multilineTextAlignment(.trailing)
                .frame(width: 230)
                Button {
                    isRevealed.toggle()
                } label: {
                    Image(systemName: isRevealed ? "eye.slash" : "eye")
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.borderless)
                .help(L10n.t(isRevealed ? "native.properties.hide" : "native.properties.show"))
            }
        }
    }

    /// Choices picked from pictures instead of a menu.
    private static let pictured: [String: [String]] = [
        "gamemode": ["survival", "creative", "adventure", "spectator"],
        "difficulty": ["peaceful", "easy", "normal", "hard"],
    ]

    /// The file's value is kept selectable even when it is not one of the choices.
    private var choices: [String] {
        let listed = key.choices ?? []
        let current = value.wrappedValue
        return listed.contains(current) || current.isEmpty ? listed : listed + [current]
    }

    /// The default, shown greyed out while the field is empty.
    private var placeholder: String {
        model.docs[key.key]?.default?.displayText ?? ""
    }

    /// React's option labels; other values show as written.
    private func choiceTitle(_ choice: String) -> String {
        let group = key.key == "gamemode" ? "gameMode" : key.key
        let localized = L10n.t("properties.\(group).options.\(choice)")
        return localized.hasPrefix("properties.") ? choice : localized
    }
}
