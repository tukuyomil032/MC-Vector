// SPDX-License-Identifier: GPL-3.0-or-later

import MCVectorEditorKit
import SwiftUI

/// The Properties half of the Server Settings window: the overview with links
/// to each category, one category, or search results across categories.
struct PropertiesPage: View {
    let page: ServerSettingsPage
    let search: String
    let model: PropertiesModel
    let open: (ServerSettingsPage) -> Void

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
            if !search.isEmpty {
                results
            } else if case .category(_, let id) = page, let category = model.category(id) {
                Form {
                    Section {
                        PropertyRows(keys: model.visibleKeys(of: category), model: model)
                    }
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
                    symbol: ServerSettingsSection.properties.symbol, color: ServerSettingsSection.properties.color,
                    title: L10n.t("nav.properties"), subtitle: L10n.t("native.serverSettings.propertiesSubtitle"))
            }
            .listRowBackground(Color.clear)
            Section {
                ForEach(model.visibleCategories) { category in
                    SettingsLinkRow(
                        title: category.title.current,
                        subtitle: model.visibleKeys(of: category).prefix(3).map(\.label.current)
                            .joined(separator: "、"),
                        symbol: category.symbol, color: category.tint
                    ) { open(.category(.properties, category.id)) }
                }
            }
        }
        .formStyle(.grouped)
    }

    @ViewBuilder
    private var results: some View {
        let matches = model.matches(search)
        if matches.isEmpty {
            ContentUnavailableView.search(text: search)
        } else {
            Form {
                ForEach(matches, id: \.category.id) { match in
                    Section(match.category.title.current) {
                        PropertyRows(keys: match.keys, model: model)
                    }
                }
            }
            .formStyle(.grouped)
        }
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
        SettingsRow(title: key.label.current, doc: model.docs[key.key], note: model.rangeNote(for: key)) {
            control
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
