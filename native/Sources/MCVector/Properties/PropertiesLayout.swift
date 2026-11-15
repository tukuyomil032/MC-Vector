// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorEditorKit

/// How the Properties view groups and edits server.properties keys
/// (Contents/Resources/PropertiesLayout.json, taken from the React cards).
struct PropertiesLayout: Decodable, Sendable {
    struct Text: Decodable, Sendable {
        let en: String
        let ja: String
        var current: String { L10n.language == "ja" ? ja : en }
    }

    enum Control: String, Decodable, Sendable {
        case text, secret, toggle, number, choice
    }

    struct Key: Decodable, Identifiable, Sendable {
        let key: String
        let control: Control
        let min: Int?
        let max: Int?
        let step: Int?
        let choices: [String]?
        let label: Text
        var id: String { key }
    }

    struct Category: Decodable, Identifiable, Sendable {
        let id: String
        let title: Text
        let symbol: String
        let column: Int
        let keys: [Key]
    }

    let categories: [Category]
    /// Keys React keeps out of the cards (its hidden Advanced card).
    let hidden: [String]

    static let bundled: PropertiesLayout = {
        guard let url = Bundle.main.url(forResource: "PropertiesLayout", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let layout = try? JSONDecoder().decode(PropertiesLayout.self, from: data)
        else { return PropertiesLayout(categories: [], hidden: []) }
        return layout
    }()

    /// Documentation for each key from the bundled server.properties schema.
    @MainActor
    static func docs(software: String?, version: String?) -> [String: SchemaEntry] {
        guard let store = ConfigSchemas.store,
            let schema = store.schema(
                forRelativePath: "server.properties", software: ServerSoftware.id(for: software ?? ""),
                version: version)
        else { return [:] }
        return Dictionary(
            store.entries(of: schema, version: version).map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
    }
}
