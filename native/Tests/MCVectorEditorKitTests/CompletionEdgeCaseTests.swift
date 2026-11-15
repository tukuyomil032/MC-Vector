// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorEditorKit
import Testing

@Suite("Editor completion and validation edge cases")
struct CompletionEdgeCaseTests {
    @Test func boolAndEnumPrefixesHighlightMatchesAndKeepOtherValuesInSchemaOrder() throws {
        let valueNames = ["survival", "creative", "adventure", "spectator"]
        let stringValues = ["peaceful", "normal", "hard"]
        let cases: [PrefixFormatCase] = [
            PrefixFormatCase(
                format: .properties, boolPath: "online-mode", enumPath: "gamemode", stringPath: "difficulty",
                boolText: "online-mode=t", enumText: "gamemode=crea", stringText: "difficulty=n",
                boolNoMatchText: "online-mode=zzz", enumNoMatchText: "gamemode=zzz"),
            PrefixFormatCase(
                format: .yaml, boolPath: "online-mode", enumPath: "gamemode", stringPath: "difficulty",
                boolText: "online-mode: t", enumText: "gamemode: crea", stringText: "difficulty: n",
                boolNoMatchText: "online-mode: zzz", enumNoMatchText: "gamemode: zzz"),
            PrefixFormatCase(
                format: .toml, boolPath: "server.online-mode", enumPath: "server.gamemode",
                stringPath: "server.difficulty", boolText: "[server]\nonline-mode = t",
                enumText: "[server]\ngamemode = crea", stringText: "[server]\ndifficulty = n",
                boolNoMatchText: "[server]\nonline-mode = zzz", enumNoMatchText: "[server]\ngamemode = zzz"),
            PrefixFormatCase(
                format: .json, boolPath: "[].online-mode", enumPath: "[].gamemode", stringPath: "[].difficulty",
                boolText: "[{\"online-mode\": t}]", enumText: "[{\"gamemode\": crea}]",
                stringText: "[{\"difficulty\": n}]", boolNoMatchText: "[{\"online-mode\": zzz}]",
                enumNoMatchText: "[{\"gamemode\": zzz}]"),
        ]

        for item in cases {
            let schema = edgeCaseSchema(
                format: item.format,
                entries: [
                    SchemaEntry(path: item.boolPath, type: .bool, doc: edgeCaseDoc),
                    SchemaEntry(
                        path: item.enumPath, type: .enum, default: .string("spectator"),
                        values: valueNames, doc: edgeCaseDoc),
                    SchemaEntry(path: item.stringPath, type: .string, values: stringValues, doc: edgeCaseDoc),
                ])

            let boolResult = try #require(edgeCaseCompletion(item.boolText, format: item.format, schema: schema))
            #expect(boolResult.candidates.map(\.label) == ["true", "false"])
            #expect(boolResult.candidates[0].matchedRanges == [0..<1])
            #expect(boolResult.candidates[1].matchedRanges.isEmpty)

            let enumResult = try #require(edgeCaseCompletion(item.enumText, format: item.format, schema: schema))
            #expect(enumResult.candidates.map(\.label) == ["creative", "survival", "adventure", "spectator"])
            #expect(enumResult.candidates[0].matchedRanges == [0..<4])
            let unmatchedEnumLabels = enumResult.candidates.dropFirst().map(\.label)
            #expect(unmatchedEnumLabels == ["survival", "adventure", "spectator"])
            #expect(enumResult.candidates.dropFirst().allSatisfy { $0.matchedRanges.isEmpty })

            let stringResult = try #require(edgeCaseCompletion(item.stringText, format: item.format, schema: schema))
            #expect(stringResult.candidates.map(\.label) == ["normal", "peaceful", "hard"])
            #expect(stringResult.candidates[0].matchedRanges == [0..<1])
            #expect(stringResult.candidates.dropFirst().allSatisfy { $0.matchedRanges.isEmpty })

            try expectNoMatchValues(
                item.boolNoMatchText, format: item.format, schema: schema, expectedLabels: ["true", "false"])
            try expectNoMatchValues(
                item.enumNoMatchText, format: item.format, schema: schema,
                expectedLabels: ["survival", "creative", "adventure", "spectator"])
        }
    }

    @Test func emptyValueCompletionKeepsCaretRangeAndEmptyPrefixAcrossFormats() throws {
        let properties = edgeCaseSchema(
            format: .properties, entries: [SchemaEntry(path: "enabled", type: .bool, doc: edgeCaseDoc)])
        let yaml = edgeCaseSchema(
            format: .yaml, entries: [SchemaEntry(path: "enabled", type: .bool, doc: edgeCaseDoc)])
        let toml = edgeCaseSchema(
            format: .toml, entries: [SchemaEntry(path: "server.enabled", type: .bool, doc: edgeCaseDoc)])
        let jsonSchema = edgeCaseSchema(
            format: .json, entries: [SchemaEntry(path: "[].enabled", type: .bool, doc: edgeCaseDoc)])

        try expectEmptyValueCompletion("enabled=", format: .properties, schema: properties)
        try expectEmptyValueCompletion("enabled:", format: .yaml, schema: yaml)
        try expectEmptyValueCompletion("enabled: ", format: .yaml, schema: yaml)
        try expectEmptyValueCompletion("[server]\nenabled = ", format: .toml, schema: toml)

        let spacedProperties = "enabled=   "
        try expectEmptyValueCompletion(
            spacedProperties, format: .properties, schema: properties,
            cursor: (spacedProperties as NSString).range(of: "=").location + 1)
        let spacedYAML = "enabled:   "
        try expectEmptyValueCompletion(
            spacedYAML, format: .yaml, schema: yaml,
            cursor: (spacedYAML as NSString).range(of: ":").location + 1)
        let spacedTOML = "[server]\nenabled =   "
        try expectEmptyValueCompletion(
            spacedTOML, format: .toml, schema: toml,
            cursor: (spacedTOML as NSString).range(of: "=").location + 2)
        let spacedJSON = "[{\"enabled\":   }]"
        try expectEmptyValueCompletion(
            spacedJSON, format: .json, schema: jsonSchema,
            cursor: (spacedJSON as NSString).range(of: ":").location + 2)
        let emptyJSON = "[{\"enabled\": }]"
        try expectEmptyValueCompletion(
            emptyJSON, format: .json, schema: jsonSchema,
            cursor: (emptyJSON as NSString).range(of: "}").location)
    }

    @Test func emptyValuesDoNotProduceDiagnosticsInAnyFormat() {
        let propertiesEntries = [
            SchemaEntry(path: "enabled", type: .bool, doc: edgeCaseDoc),
            SchemaEntry(path: "mode", type: .enum, values: ["safe", "fast"], doc: edgeCaseDoc),
        ]
        #expect(
            Validator.diagnostics(
                text: "enabled=\nmode=", format: .properties, entries: propertiesEntries
            ).isEmpty)

        let yamlEntries = [
            SchemaEntry(path: "settings", type: .section, doc: edgeCaseDoc),
            SchemaEntry(path: "settings.enabled", type: .bool, doc: edgeCaseDoc),
            SchemaEntry(path: "settings.mode", type: .enum, values: ["safe", "fast"], doc: edgeCaseDoc),
        ]
        #expect(
            Validator.diagnostics(
                text: "settings:\n  enabled:\n  mode:", format: .yaml, entries: yamlEntries
            ).isEmpty)

        let tomlEntries = [
            SchemaEntry(path: "server.enabled", type: .bool, doc: edgeCaseDoc),
            SchemaEntry(path: "server.mode", type: .enum, values: ["safe", "fast"], doc: edgeCaseDoc),
        ]
        #expect(
            Validator.diagnostics(
                text: "[server]\nenabled = \nmode = ", format: .toml, entries: tomlEntries
            ).isEmpty)

        let jsonEntries = [
            SchemaEntry(path: "[].enabled", type: .bool, doc: edgeCaseDoc),
            SchemaEntry(path: "[].mode", type: .enum, values: ["safe", "fast"], doc: edgeCaseDoc),
        ]
        #expect(
            Validator.diagnostics(
                text: "[{\"enabled\": , \"mode\": }]", format: .json, entries: jsonEntries
            ).isEmpty)

        let numericEntries = [
            SchemaEntry(path: "port", type: .int, min: 1, max: 10, doc: edgeCaseDoc)
        ]
        #expect(Validator.diagnostics(text: "port=", format: .properties, entries: numericEntries).isEmpty)
        #expect(Validator.diagnostics(text: "port:", format: .yaml, entries: numericEntries).isEmpty)
        #expect(Validator.diagnostics(text: "port = ", format: .toml, entries: numericEntries).isEmpty)
        #expect(Validator.diagnostics(text: "{\"port\": }", format: .json, entries: numericEntries).isEmpty)
    }

    @Test func quotedEmptyValuesRemainInvalidForBoolAndIntegerEntries() {
        let entries = [
            SchemaEntry(path: "enabled", type: .bool, doc: edgeCaseDoc),
            SchemaEntry(path: "port", type: .int, min: 1, max: 10, doc: edgeCaseDoc),
        ]

        expectQuotedEmptyDiagnostics("enabled=\"\"\nport=\"\"", format: .properties, entries: entries)
        expectQuotedEmptyDiagnostics("enabled: \"\"\nport: \"\"", format: .yaml, entries: entries)
        expectQuotedEmptyDiagnostics("enabled = \"\"\nport = \"\"", format: .toml, entries: entries)
        expectQuotedEmptyDiagnostics("{\"enabled\": \"\", \"port\": \"\"}", format: .json, entries: entries)
    }

    @Test func completionDetailOmitsSeparatorForMissingAndEmptyDefaults() throws {
        let cases: [DetailFormatCase] = [
            DetailFormatCase(
                format: .properties, boolPath: "enabled", stringPath: "motd",
                boolText: "enabled=", stringText: "motd="),
            DetailFormatCase(
                format: .yaml, boolPath: "enabled", stringPath: "motd",
                boolText: "enabled: ", stringText: "motd: "),
            DetailFormatCase(
                format: .toml, boolPath: "server.enabled", stringPath: "server.motd",
                boolText: "[server]\nenabled = ", stringText: "[server]\nmotd = "),
            DetailFormatCase(
                format: .json, boolPath: "[].enabled", stringPath: "[].motd",
                boolText: "[{\"enabled\": }]", stringText: "[{\"motd\": }]"),
        ]

        for item in cases {
            let schema = edgeCaseSchema(
                format: item.format,
                entries: [
                    SchemaEntry(path: item.boolPath, type: .bool, doc: edgeCaseDoc),
                    SchemaEntry(path: item.stringPath, type: .string, default: .string(""), doc: edgeCaseDoc),
                ])

            let boolResult = try #require(edgeCaseCompletion(item.boolText, format: item.format, schema: schema))
            #expect(boolResult.candidates.first?.detail == "bool")
            let stringResult = try #require(edgeCaseCompletion(item.stringText, format: item.format, schema: schema))
            #expect(stringResult.candidates.first?.detail == "string")
        }
    }
}

private let edgeCaseDoc = LocalizedText(en: "Fixture.", ja: "テスト用。")

private struct PrefixFormatCase {
    let format: ConfigFormat
    let boolPath: String
    let enumPath: String
    let stringPath: String
    let boolText: String
    let enumText: String
    let stringText: String
    let boolNoMatchText: String
    let enumNoMatchText: String
}

private struct DetailFormatCase {
    let format: ConfigFormat
    let boolPath: String
    let stringPath: String
    let boolText: String
    let stringText: String
}

private func edgeCaseSchema(format: ConfigFormat, entries: [SchemaEntry]) -> ConfigSchema {
    ConfigSchema(
        id: "edge-case-\(format.rawValue)", title: "Edge case", format: format,
        files: ["edge-case.\(format.rawValue)"], software: ["paper"],
        sources: ["https://example.invalid/edge-case"], entries: entries)
}

private func edgeCaseCompletion(
    _ text: String, format: ConfigFormat, schema: ConfigSchema, cursor: Int? = nil
) -> CompletionResult? {
    let source = text as NSString
    let inferredCursor: Int
    if format == .json {
        let closingBrace = source.range(of: "}", options: .backwards)
        inferredCursor = closingBrace.location == NSNotFound ? source.length : closingBrace.location
    } else {
        inferredCursor = source.length
    }
    return CompletionEngine.complete(
        text: text, cursor: cursor ?? inferredCursor,
        format: format, schema: schema, entries: schema.entries)
}

private func expectEmptyValueCompletion(
    _ text: String, format: ConfigFormat, schema: ConfigSchema, cursor: Int? = nil
) throws {
    let source = text as NSString
    let offset = cursor ?? source.length
    let result = try #require(edgeCaseCompletion(text, format: format, schema: schema, cursor: offset))

    #expect(result.prefix.isEmpty)
    #expect(result.replaceRange == NSRange(location: offset, length: 0))
    #expect(result.candidates.map(\.label) == ["true", "false"])
}

private func expectQuotedEmptyDiagnostics(_ text: String, format: ConfigFormat, entries: [SchemaEntry]) {
    let diagnostics = Validator.diagnostics(text: text, format: format, entries: entries)
    #expect(containsTypeMismatch(diagnostics, path: "enabled", expected: .bool))
    #expect(containsTypeMismatch(diagnostics, path: "port", expected: .int))
}

private func expectNoMatchValues(
    _ text: String, format: ConfigFormat, schema: ConfigSchema, expectedLabels: [String]
) throws {
    let result = try #require(edgeCaseCompletion(text, format: format, schema: schema))
    #expect(result.candidates.map(\.label) == expectedLabels)
    #expect(result.candidates.allSatisfy { $0.matchedRanges.isEmpty })
}

private func containsTypeMismatch(_ diagnostics: [Diagnostic], path: String, expected: ValueType) -> Bool {
    diagnostics.contains { diagnostic in
        guard diagnostic.path == path,
            case .typeMismatch(let actualType) = diagnostic.kind
        else { return false }
        return actualType == expected
    }
}
