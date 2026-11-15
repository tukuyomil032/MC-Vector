// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation
import MCVectorEditorKit
import Testing

@Suite("Editor schema and language services")
struct EditorKitTests {
    @Test func minecraftVersionsCompareNumericComponents() throws {
        let patch4 = try #require(MinecraftVersion("1.21.4"))
        let patch10 = try #require(MinecraftVersion("1.21.10"))
        let nextMajor = try #require(MinecraftVersion("26.1"))
        let compact = try #require(MinecraftVersion("1.21"))
        let explicitZero = try #require(MinecraftVersion("1.21.0"))

        #expect(patch4 < patch10)
        #expect(patch10 < nextMajor)
        #expect(compact == explicitZero)
        #expect(MinecraftVersion("1.x") == nil)
        #expect(MinecraftVersion("1..2") == nil)
    }

    @Test func schemaStoreFiltersVersionSoftwareAndExactPaths() throws {
        let store = try Fixtures.store()

        let oldest = store.schema(forRelativePath: "config/paper-global.yml", software: "Paper", version: "1.20")
        let latest = store.schema(forRelativePath: "config/paper-global.yml", software: "LeafMC", version: "1.21.4")
        #expect(oldest?.id == "paper-global")
        #expect(latest?.id == "paper-global")
        #expect(store.schema(forRelativePath: "config/paper-global.yml", software: "Paper", version: "1.19.4") == nil)
        #expect(store.schema(forRelativePath: "config/paper-global.yml", software: "Paper", version: "1.21.5") == nil)
        #expect(
            store.schema(forRelativePath: "config/paper-global.yml.bak", software: "Paper", version: "1.21.4") == nil)
        #expect(store.schema(forRelativePath: "config/paper-global.yml", software: "Spigot", version: "1.21.4") == nil)

        let schema = try #require(latest)
        let entriesAtBoundary = store.entries(of: schema, version: "1.21.4").map(\.path)
        #expect(entriesAtBoundary.contains("settings.retired"))
        #expect(entriesAtBoundary.contains("settings.modern"))
        #expect(!store.entries(of: schema, version: "1.21.3").contains { $0.path == "settings.modern" })
    }

    @Test func serverSoftwareMapsOnlyTheKnownServerAliases() {
        #expect(ServerSoftware.id(for: "Purpur") == "paper")
        #expect(ServerSoftware.id(for: "NeoForge") == "forge")
        #expect(ServerSoftware.id(for: "CraftBukkit") == "spigot")
        #expect(ServerSoftware.id(for: "LeafMC") == "leaf")
        #expect(ServerSoftware.id(for: "Velocity") == "velocity")
        #expect(ServerSoftware.id(for: "Waterfall") == "waterfall")
        #expect(ServerSoftware.id(for: "BungeeCord") == "bungeecord")
    }

    @Test func propertiesCompletionSuggestsKeysAndEnumValues() throws {
        let store = try Fixtures.store()
        let schema = try #require(
            store.schema(forRelativePath: "server.properties", software: "vanilla", version: "1.21.10"))
        let entries = store.entries(of: schema, version: "1.21.10")

        let keyResult = try #require(
            CompletionEngine.complete(
                text: "mo", cursor: 2, format: .properties, schema: schema, entries: entries
            ))
        #expect(keyResult.candidates.contains { $0.label == "motd" })

        let valueText = "gamemode=sur"
        let valueResult = try #require(
            CompletionEngine.complete(
                text: valueText, cursor: (valueText as NSString).length,
                format: .properties, schema: schema, entries: entries
            ))
        #expect(valueResult.prefix == "sur")
        #expect(valueResult.candidates.contains { $0.label == "survival" && $0.insertText == "survival" })

        let motd = try #require(keyResult.candidates.first { $0.entry?.path == "motd" })
        #expect(applying(motd, from: keyResult, to: "mo") == "motd=")

        let existingAssignment = "mo=hello"
        let assignmentResult = try #require(
            CompletionEngine.complete(
                text: existingAssignment, cursor: 2,
                format: .properties, schema: schema, entries: entries
            ))
        let assignmentMotd = try #require(assignmentResult.candidates.first { $0.entry?.path == "motd" })
        #expect(applying(assignmentMotd, from: assignmentResult, to: existingAssignment) == "motd=hello")
    }

    @Test func yamlCompletionRespectsNestedAndWildcardPaths() throws {
        let schema = try Fixtures.paperSchema()
        let entries = schema.entries
        let text = "settings:\n  "
        let result = try #require(
            CompletionEngine.complete(
                text: text, cursor: (text as NSString).length,
                format: .yaml, schema: schema, entries: entries
            ))
        let labels = Set(result.candidates.map(\.label))
        #expect(labels.contains("enabled"))
        #expect(labels.contains("mode"))
        #expect(labels.contains("max-players"))
        #expect(!labels.contains("other"))
        #expect(!labels.contains("verbose"))
        #expect(result.candidates.map(\.label) == ["enabled", "mode", "max-players", "advanced", "retired", "modern"])

        let enabled = try #require(result.candidates.first { $0.entry?.path == "settings.enabled" })
        #expect(applying(enabled, from: result, to: text) == "settings:\n  enabled: ")

        let existingSeparator = "settings:\n  en: false"
        let separatorResult = try #require(
            CompletionEngine.complete(
                text: existingSeparator,
                cursor: (existingSeparator as NSString).range(of: "en").location + 2,
                format: .yaml, schema: schema, entries: entries
            ))
        let separatorCandidate = try #require(separatorResult.candidates.first { $0.entry?.path == "settings.enabled" })
        #expect(
            applying(separatorCandidate, from: separatorResult, to: existingSeparator) == "settings:\n  enabled: false")

        let section = try #require(result.candidates.first { $0.entry?.path == "settings.advanced" })
        #expect(applying(section, from: result, to: text) == "settings:\n  advanced:\n    ")

        let wildcardText = "world-settings:\n  survival:\n    "
        let wildcardResult = try #require(
            CompletionEngine.complete(
                text: wildcardText, cursor: (wildcardText as NSString).length,
                format: .yaml, schema: schema, entries: entries
            ))
        let wildcardLabels = Set(wildcardResult.candidates.map(\.label))
        #expect(wildcardLabels.contains("verbose"))
        #expect(wildcardLabels.contains("difficulty"))
        #expect(!wildcardLabels.contains("enabled"))
    }

    @Test func yamlValueCompletionPutsDefaultsFirstAndInsertsUnquotedValues() throws {
        let schema = try Fixtures.paperSchema()
        let entries = schema.entries
        let boolText = "settings:\n  enabled: "
        let boolResult = try #require(
            CompletionEngine.complete(
                text: boolText, cursor: (boolText as NSString).length,
                format: .yaml, schema: schema, entries: entries
            ))
        #expect(boolResult.candidates.prefix(2).map(\.label) == ["true", "false"])
        let trueCandidate = try #require(boolResult.candidates.first)
        #expect(trueCandidate.insertText == "true")
        #expect(applying(trueCandidate, from: boolResult, to: boolText) == "settings:\n  enabled: true")

        let enumText = "settings:\n  mode: "
        let enumResult = try #require(
            CompletionEngine.complete(
                text: enumText, cursor: (enumText as NSString).length,
                format: .yaml, schema: schema, entries: entries
            ))
        #expect(enumResult.candidates.prefix(4).map(\.label) == ["survival", "creative", "adventure", "spectator"])
        let defaultMode = try #require(enumResult.candidates.first)
        #expect(defaultMode.insertText == "survival")
        #expect(applying(defaultMode, from: enumResult, to: enumText) == "settings:\n  mode: survival")
    }

    @Test func yamlCompletionUsesUTF16CursorAndSkipsCommentsAndBlockScalars() throws {
        let schema = try Fixtures.paperSchema()
        let entries = schema.entries
        let text = "# 🌲 server note\nsettings:\n  en"
        let utf16Cursor = (text as NSString).length
        let result = try #require(
            CompletionEngine.complete(
                text: text, cursor: utf16Cursor, format: .yaml, schema: schema, entries: entries
            ))
        #expect(result.candidates.contains { $0.label == "enabled" })

        let comment = "settings:\n  # en"
        let commentResult = CompletionEngine.complete(
            text: comment, cursor: (comment as NSString).length,
            format: .yaml, schema: schema, entries: entries
        )
        #expect(commentResult.map { $0.candidates.isEmpty } ?? true)

        let blockScalar = "settings:\n  description: |\n    en"
        let blockResult = CompletionEngine.complete(
            text: blockScalar, cursor: (blockScalar as NSString).length,
            format: .yaml, schema: schema, entries: entries
        )
        #expect(blockResult.map { $0.candidates.isEmpty } ?? true)
    }

    @Test func tomlCompletionUnderstandsTableHeadersAndKeys() throws {
        let entry = SchemaEntry(path: "server.port", type: .int, doc: Fixtures.doc)
        let schema = Fixtures.schema(
            format: .toml,
            entries: [
                SchemaEntry(path: "server", type: .section, doc: Fixtures.doc), entry,
                SchemaEntry(path: "logging.level", type: .string, doc: Fixtures.doc),
            ])

        let header = CompletionEngine.complete(
            text: "[serv", cursor: 5, format: .toml, schema: schema, entries: schema.entries
        )
        #expect(header?.candidates.contains { $0.label.contains("server") } == true)

        let keyText = "[server]\npo"
        let key = CompletionEngine.complete(
            text: keyText, cursor: (keyText as NSString).length,
            format: .toml, schema: schema, entries: schema.entries
        )
        #expect(key?.candidates.contains { $0.label == "port" } == true)
        #expect(key?.candidates.contains { $0.label == "level" } == false)
        let keyResult = try #require(key)
        let port = try #require(keyResult.candidates.first { $0.entry?.path == "server.port" })
        #expect(applying(port, from: keyResult, to: keyText) == "[server]\nport = ")

        let existingAssignment = "[server]\npo=25565"
        let assignmentResult = try #require(
            CompletionEngine.complete(
                text: existingAssignment,
                cursor: (existingAssignment as NSString).range(of: "po=").location + 2,
                format: .toml, schema: schema, entries: schema.entries
            ))
        let assignmentPort = try #require(assignmentResult.candidates.first { $0.entry?.path == "server.port" })
        #expect(applying(assignmentPort, from: assignmentResult, to: existingAssignment) == "[server]\nport = 25565")

        let valueText = "[server]\nenabled = "
        let valueSchema = Fixtures.schema(
            format: .toml,
            entries: [
                SchemaEntry(path: "server.enabled", type: .bool, default: .bool(true), doc: Fixtures.doc),
                SchemaEntry(
                    path: "server.mode", type: .enum, default: .string("survival"), values: ["survival", "creative"],
                    doc: Fixtures.doc),
            ])
        let boolValue = try #require(
            CompletionEngine.complete(
                text: valueText, cursor: (valueText as NSString).length,
                format: .toml, schema: valueSchema, entries: valueSchema.entries
            ))
        #expect(boolValue.candidates.prefix(2).map(\.label) == ["true", "false"])

        let modeText = "[server]\nmode = \"\""
        let modeCursor = (modeText as NSString).length - 1
        let modeValue = try #require(
            CompletionEngine.complete(
                text: modeText, cursor: modeCursor,
                format: .toml, schema: valueSchema, entries: valueSchema.entries
            ))
        let survival = try #require(modeValue.candidates.first { $0.label == "survival" })
        #expect(applying(survival, from: modeValue, to: modeText) == "[server]\nmode = \"survival\"")
    }

    @Test func jsonCompletionUsesArrayObjectElementSchema() throws {
        let store = try Fixtures.store()
        let schema = try #require(store.schema(forRelativePath: "ops.json", software: "Paper", version: nil))
        let text = "[\n  {\n    \"u"
        let result = try #require(
            CompletionEngine.complete(
                text: text, cursor: (text as NSString).length,
                format: .json, schema: schema, entries: schema.entries
            ))
        #expect(result.candidates.contains { $0.label == "uuid" })
        let uuid = try #require(result.candidates.first { $0.entry?.path == "[].uuid" })
        #expect(applying(uuid, from: result, to: text) == "[\n  {\n    \"uuid\": ")

        let existingKey = "[{\"u\": 2}]"
        let existingKeyCursor = (existingKey as NSString).range(of: "\"u\"").location + 2
        let existingKeyResult = try #require(
            CompletionEngine.complete(
                text: existingKey, cursor: existingKeyCursor,
                format: .json, schema: schema, entries: schema.entries
            ))
        let existingUUID = try #require(existingKeyResult.candidates.first { $0.entry?.path == "[].uuid" })
        #expect(applying(existingUUID, from: existingKeyResult, to: existingKey) == "[{\"uuid\": 2}]")
    }

    @Test func jsonValueCompletionQuotesStringsButNotBooleansAndOmitsNumbers() throws {
        let entries = [
            SchemaEntry(path: "[].enabled", type: .bool, default: .bool(true), doc: Fixtures.doc),
            SchemaEntry(
                path: "[].mode", type: .enum, default: .string("survival"), values: ["survival", "creative"],
                doc: Fixtures.doc),
            SchemaEntry(path: "[].level", type: .int, min: 1, max: 4, doc: Fixtures.doc),
        ]
        let schema = Fixtures.schema(format: .json, entries: entries)
        let boolText = "[{\"enabled\": }]"
        let boolCursor = (boolText as NSString).range(of: "}").location
        let boolResult = try #require(
            CompletionEngine.complete(
                text: boolText, cursor: boolCursor, format: .json, schema: schema, entries: entries
            ))
        #expect(boolResult.candidates.prefix(2).map(\.label) == ["true", "false"])
        let trueCandidate = try #require(boolResult.candidates.first)
        #expect(applying(trueCandidate, from: boolResult, to: boolText) == "[{\"enabled\": true}]")

        let enumText = "[{\"mode\":\"\"}]"
        let emptyQuotes = (enumText as NSString).range(of: "\"\"")
        let enumCursor = emptyQuotes.location + 1
        let enumResult = try #require(
            CompletionEngine.complete(
                text: enumText, cursor: enumCursor, format: .json, schema: schema, entries: entries
            ))
        let survival = try #require(enumResult.candidates.first { $0.label == "survival" })
        #expect(applying(survival, from: enumResult, to: enumText) == "[{\"mode\":\"survival\"}]")

        let numberText = "[{\"level\": }]"
        let numberCursor = (numberText as NSString).range(of: "}").location
        let numericResult = CompletionEngine.complete(
            text: numberText, cursor: numberCursor, format: .json, schema: schema, entries: entries
        )
        #expect(numericResult?.candidates.isEmpty == true)
    }

    @Test func fuzzyMatchReturnsScoreAndMatchedRanges() throws {
        let match = try #require(CompletionEngine.fuzzyMatch(query: "pmax", label: "player-max-players"))
        #expect(match.score > 0)
        #expect(match.ranges == [0..<1, 7..<10])
        #expect(CompletionEngine.fuzzyMatch(query: "xyz", label: "player-max-players")?.score == nil)
    }

    @Test func fuzzyMatchRanksPrefixBeforeBoundaryBeforeSubsequenceAndHandlesUnicode() throws {
        let prefix = try #require(CompletionEngine.fuzzyMatch(query: "pla", label: "player-limit"))
        let boundary = try #require(CompletionEngine.fuzzyMatch(query: "pla", label: "server-player"))
        let subsequence = try #require(CompletionEngine.fuzzyMatch(query: "pla", label: "p---l---a"))
        #expect(prefix.score > boundary.score)
        #expect(boundary.score > subsequence.score)

        let uppercase = try #require(CompletionEngine.fuzzyMatch(query: "MAX", label: "max-players"))
        #expect(uppercase.ranges == [0..<3])
        let accented = try #require(CompletionEngine.fuzzyMatch(query: "é", label: "café"))
        #expect(accented.ranges == [3..<4])

        let emptySchema = Fixtures.schema(format: .yaml, entries: [])
        let emptyResult = CompletionEngine.complete(
            text: "", cursor: 0, format: .yaml, schema: emptySchema, entries: [])
        #expect(emptyResult?.candidates.isEmpty == true)
    }

    @Test func schemaFreeWordFallbackExcludesCurrentWord() throws {
        let text = "alpha alphabet\nalp"
        let result = try #require(
            CompletionEngine.complete(
                text: text, cursor: (text as NSString).length,
                format: ConfigFormat.properties, schema: nil, entries: []
            ))
        let labels = result.candidates.map(\.label)
        #expect(labels.contains("alpha"))
        #expect(labels.contains("alphabet"))
        #expect(!labels.contains("alp"))

        let repeated = "alpha alpha\nalpha"
        let repeatedResult = try #require(
            CompletionEngine.complete(
                text: repeated, cursor: (repeated as NSString).length,
                format: ConfigFormat.properties, schema: nil, entries: []
            ))
        #expect(!repeatedResult.candidates.contains { $0.label == "alpha" })

        let shortWordText = "a ab abc alpha\n"
        let shortWordResult = try #require(
            CompletionEngine.complete(
                text: shortWordText, cursor: (shortWordText as NSString).length,
                format: ConfigFormat.properties, schema: nil, entries: []
            ))
        let shortWordLabels = Set(shortWordResult.candidates.map(\.label))
        #expect(!shortWordLabels.contains("a"))
        #expect(!shortWordLabels.contains("ab"))
        #expect(shortWordLabels.contains("abc"))
        #expect(shortWordLabels.contains("alpha"))

        let wholeDocument = "alpha\n" + String(repeating: "x", count: 4_096) + "\nalp"
        let wholeDocumentResult = try #require(
            CompletionEngine.complete(
                text: wholeDocument, cursor: (wholeDocument as NSString).length,
                format: ConfigFormat.properties, schema: nil, entries: []
            ))
        #expect(wholeDocumentResult.candidates.contains { $0.label == "alpha" })

        let partialCurrentWord = "alpha alphabet\nalphabet"
        let partialCursor = (partialCurrentWord as NSString).length - "abet".utf16.count
        let partialResult = try #require(
            CompletionEngine.complete(
                text: partialCurrentWord, cursor: partialCursor,
                format: ConfigFormat.properties, schema: nil, entries: []
            ))
        #expect(partialResult.prefix == "alph")
        #expect(partialResult.candidates.contains { $0.label == "alpha" })
        #expect(!partialResult.candidates.contains { $0.label == "alphabet" })
    }

}

extension EditorKitTests {
    @Test func hoverTargetFindsKeyAndValueWithUTF16Offsets() throws {
        let schema = try Fixtures.paperSchema()
        let text = "# 🍄 note\nsettings:\n  enabled: true\n"
        let source = text as NSString
        let keyRange = source.range(of: "enabled")
        let key = try #require(
            DocumentAnalyzer.hoverTarget(
                text: text, offset: keyRange.location + 2, format: .yaml, entries: schema.entries
            ))
        #expect(key.path == "settings.enabled")
        #expect(!key.isValue)
        #expect(key.range == keyRange)

        let valueRange = source.range(of: "true")
        let value = try #require(
            DocumentAnalyzer.hoverTarget(
                text: text, offset: valueRange.location + 1, format: .yaml, entries: schema.entries
            ))
        #expect(value.path == "settings.enabled")
        #expect(value.isValue)
    }

    @Test func hoverTargetResolvesPropertiesTomlAndJSONEntries() throws {
        let propertiesStore = try Fixtures.store()
        let propertiesSchema = try #require(
            propertiesStore.schema(
                forRelativePath: "server.properties", software: "paper", version: nil
            ))
        let propertiesText = "gamemode=survival"
        let propertiesSource = propertiesText as NSString
        let propertyValue = propertiesSource.range(of: "survival")
        let propertyHover = try #require(
            DocumentAnalyzer.hoverTarget(
                text: propertiesText, offset: propertyValue.location + 1,
                format: .properties, entries: propertiesSchema.entries
            ))
        #expect(propertyHover.path == "gamemode")
        #expect(propertyHover.isValue)

        let tomlEntries = [SchemaEntry(path: "server.port", type: .int, doc: Fixtures.doc)]
        let tomlText = "[server]\nport = 25565"
        let tomlSource = tomlText as NSString
        let tomlKey = tomlSource.range(of: "port")
        let tomlHover = try #require(
            DocumentAnalyzer.hoverTarget(
                text: tomlText, offset: tomlKey.location + 1, format: .toml, entries: tomlEntries
            ))
        #expect(tomlHover.path == "server.port")
        #expect(!tomlHover.isValue)

        let jsonStore = try Fixtures.store()
        let jsonSchema = try #require(jsonStore.schema(forRelativePath: "ops.json", software: "paper", version: nil))
        let jsonText = "[{\"uuid\":\"abcd-1234\"}]"
        let jsonSource = jsonText as NSString
        let jsonValue = jsonSource.range(of: "abcd")
        let jsonHover = try #require(
            DocumentAnalyzer.hoverTarget(
                text: jsonText, offset: jsonValue.location + 2, format: .json, entries: jsonSchema.entries
            ))
        #expect(jsonHover.path == "[].uuid")
        #expect(jsonHover.isValue)
    }

    @Test func validatorReportsTypeRangeEnumAndDuplicateProblems() throws {
        let schema = try Fixtures.paperSchema()
        let text = "settings:\n  enabled: maybe\n  max-players: 101\n  mode: impossible\n  mode: creative\n"
        let diagnostics = Validator.diagnostics(text: text, format: .yaml, entries: schema.entries)

        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "settings.enabled" else { return false }
                if case .typeMismatch(expected: .bool) = diagnostic.kind { return true }
                return false
            })
        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "settings.max-players" else { return false }
                if case .outOfRange(min: let minimum, max: let maximum) = diagnostic.kind {
                    return minimum == 1 && maximum == 100
                }
                return false
            })
        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "settings.mode" else { return false }
                if case .notAllowed(let values) = diagnostic.kind {
                    return values == ["survival", "creative", "adventure", "spectator"]
                }
                return false
            })
        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "settings.mode" else { return false }
                if case .duplicateKey = diagnostic.kind { return true }
                return false
            })
        #expect(diagnostics.allSatisfy { $0.line >= 0 })

        #expect(Validator.diagnostics(text: "unowned: value\n", format: .yaml, entries: schema.entries).isEmpty)
    }

    @Test func validatorChecksQuotedTypesAndBoundsButSkipsStringAndCollections() {
        let entries = [
            SchemaEntry(path: "settings.enabled", type: .bool, doc: Fixtures.doc),
            SchemaEntry(path: "settings.port", type: .int, min: 1, max: 10, doc: Fixtures.doc),
            SchemaEntry(path: "settings.ratio", type: .float, min: 0, max: 1, doc: Fixtures.doc),
            SchemaEntry(path: "settings.mode", type: .enum, values: ["safe", "fast"], doc: Fixtures.doc),
            SchemaEntry(path: "settings.name", type: .string, doc: Fixtures.doc),
            SchemaEntry(path: "settings.items", type: .list, doc: Fixtures.doc),
            SchemaEntry(path: "settings.options", type: .map, doc: Fixtures.doc),
        ]
        let text = """
            [settings]
            enabled = "true"
            port = "5"
            ratio = -0.5
            mode = "unsafe"
            name = 7
            items = [true, 5]
            options = { anything = true }
            """
        let diagnostics = Validator.diagnostics(text: text, format: .toml, entries: entries)
        let mismatches = diagnostics.compactMap { diagnostic -> (String, ValueType)? in
            guard case .typeMismatch(let expected) = diagnostic.kind else { return nil }
            return (diagnostic.path, expected)
        }
        #expect(mismatches.contains { $0.0 == "settings.enabled" && $0.1 == .bool })
        #expect(mismatches.contains { $0.0 == "settings.port" && $0.1 == .int })
        #expect(!diagnostics.contains { $0.path == "settings.name" })
        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "settings.ratio" else { return false }
                if case .outOfRange(let minimum, let maximum) = diagnostic.kind { return minimum == 0 && maximum == 1 }
                return false
            })
        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "settings.mode" else { return false }
                if case .notAllowed = diagnostic.kind { return true }
                return false
            })
        #expect(!diagnostics.contains { ["settings.items", "settings.options"].contains($0.path) })
    }

    @Test func validatorScopesJSONDuplicatesToTheirArrayElement() throws {
        let store = try Fixtures.store()
        let schema = try #require(store.schema(forRelativePath: "ops.json", software: "paper", version: nil))
        let text = """
            [
              {"uuid":"one","uuid":"two","level":"4"},
              {"uuid":"three","level":4}
            ]
            """
        let diagnostics = Validator.diagnostics(text: text, format: .json, entries: schema.entries)
        let duplicate = try #require(
            diagnostics.first { diagnostic in
                if case .duplicateKey = diagnostic.kind { return true }
                return false
            })
        #expect(duplicate.path == "[].uuid")
        #expect(duplicate.line == 1)
        #expect(
            diagnostics.filter { diagnostic in
                if case .duplicateKey = diagnostic.kind { return true }
                return false
            }.count == 1)
        #expect(
            diagnostics.contains { diagnostic in
                guard diagnostic.path == "[].level" else { return false }
                if case .typeMismatch(expected: .int) = diagnostic.kind { return true }
                return false
            })
    }

    @Test func completionOnFiveMiBYAMLStaysBelowFiftyMillisecondsAfterWarmup() throws {
        let schema = try Fixtures.paperSchema()
        let text = String(repeating: "x: y\n", count: 1_048_576)
        let cursor = (text as NSString).length

        _ = CompletionEngine.complete(
            text: text, cursor: cursor, format: .yaml, schema: schema, entries: schema.entries)
        let elapsed = ContinuousClock().measure {
            _ = CompletionEngine.complete(
                text: text, cursor: cursor, format: .yaml, schema: schema, entries: schema.entries)
        }
        #expect(elapsed < .milliseconds(50))
    }
}

@Suite("Editor text commands")
struct EditCommandsTests {
    @Test func commentToggleAddsAndRemovesCommentsAfterIndentation() throws {
        let text = "  enabled: true\n  mode: survival\n"
        let selection = NSRange(location: 0, length: (text as NSString).length)
        let commented = try #require(EditCommands.toggleComment(text: text, selection: selection, format: .yaml))
        let afterComment = applying(commented, to: text)
        #expect(afterComment == "  # enabled: true\n  # mode: survival\n")
        #expect(commented.selection == NSRange(location: 0, length: (afterComment as NSString).length))

        let uncommented = try #require(
            EditCommands.toggleComment(
                text: afterComment, selection: commented.selection, format: .yaml
            ))
        #expect(applying(uncommented, to: afterComment) == text)
    }

    @Test func commentToggleIgnoresFormatsWithoutLineComments() {
        let selection = NSRange(location: 0, length: 0)
        #expect(EditCommands.toggleComment(text: "{}", selection: selection, format: .json) == nil)
        #expect(EditCommands.toggleComment(text: "x", selection: selection, format: nil) == nil)
    }

    @Test func commentToggleChangesOnlySelectedLines() throws {
        let text = "first\nsecond\nthird"
        let selection = NSRange(location: 6, length: 7)  // second line and its newline
        let edit = try #require(EditCommands.toggleComment(text: text, selection: selection, format: .properties))
        #expect(applying(edit, to: text) == "first\n# second\nthird")
        #expect(edit.selection == NSRange(location: 8, length: 7))
    }

    @Test func indentAndOutdentPreserveSelectedTextUsingUTF16Offsets() throws {
        let text = "🌱\nalpha\nbeta"
        let source = text as NSString
        let beta = source.range(of: "beta")
        let indented = EditCommands.indent(text: text, selection: beta, unit: "  ")
        let afterIndent = applying(indented, to: text)
        #expect(afterIndent == "🌱\nalpha\n  beta")
        #expect(indented.selection == NSRange(location: beta.location + 2, length: beta.length))

        let outdented = EditCommands.outdent(text: afterIndent, selection: indented.selection, unit: "  ")
        #expect(applying(outdented, to: afterIndent) == text)
        #expect(outdented.selection == beta)
    }

    @Test func indentAndOutdentUpdateMultilineSelection() {
        let text = "before\none\ntwo\nafter"
        let selection = NSRange(location: 7, length: 7)
        let indented = EditCommands.indent(text: text, selection: selection, unit: "  ")
        let afterIndent = applying(indented, to: text)
        #expect(afterIndent == "before\n  one\n  two\nafter")
        #expect(indented.selection == NSRange(location: 9, length: 9))

        let outdented = EditCommands.outdent(text: afterIndent, selection: indented.selection, unit: "  ")
        #expect(applying(outdented, to: afterIndent) == text)
        #expect(outdented.selection == selection)
    }

    @Test func indentSelectionAtCRLFBoundaryDoesNotIncludeFollowingLine() {
        let text = "one\r\ntwo\r\nthree"
        let edit = EditCommands.indent(text: text, selection: NSRange(location: 0, length: 5), unit: "  ")
        #expect(applying(edit, to: text) == "  one\r\ntwo\r\nthree")
    }

    @Test func outdentRemovesPartialSpaceIndentAndLeavesUnindentedLinesAlone() {
        let text = "  one\n x\nthree"
        let edit = EditCommands.outdent(
            text: text, selection: NSRange(location: 0, length: (text as NSString).length), unit: "    ")
        #expect(applying(edit, to: text) == "one\nx\nthree")
    }

    @Test func indentUnitUsesFormatDefaults() {
        #expect(EditCommands.indentUnit(for: .yaml) == "  ")
        #expect(EditCommands.indentUnit(for: .json) == "  ")
        #expect(EditCommands.indentUnit(for: .toml) == "    ")
        #expect(EditCommands.indentUnit(for: .properties) == "    ")
        #expect(EditCommands.indentUnit(for: nil) == "\t")
    }
}

private enum Fixtures {
    static let doc = LocalizedText(en: "Fixture text.", ja: "テスト用の説明です。")

    static func store() throws -> SchemaStore {
        try SchemaStore(directory: fixtureDirectory)
    }

    static func paperSchema() throws -> ConfigSchema {
        try #require(
            store().schema(
                forRelativePath: "config/paper-global.yml", software: "paper", version: "1.21.4"
            ))
    }

    static func schema(format: ConfigFormat, entries: [SchemaEntry]) -> ConfigSchema {
        ConfigSchema(
            id: "test-\(format.rawValue)", title: "Test", format: format,
            files: ["test.\(format.rawValue)"], software: ["paper"],
            sources: ["https://example.invalid/test"], entries: entries
        )
    }

    private static var fixtureDirectory: URL {
        Bundle.module.resourceURL!.appendingPathComponent("Fixtures", isDirectory: true)
    }
}

private func applying(_ edit: TextEdit, to text: String) -> String {
    (text as NSString).replacingCharacters(in: edit.range, with: edit.replacement)
}

private func applying(_ candidate: CompletionCandidate, from result: CompletionResult, to text: String) -> String {
    (text as NSString).replacingCharacters(in: result.replaceRange, with: candidate.insertText)
}
