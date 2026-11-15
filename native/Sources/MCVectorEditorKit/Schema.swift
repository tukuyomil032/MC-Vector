// SPDX-License-Identifier: GPL-3.0-or-later
import Foundation

public enum ConfigFormat: String, Sendable, Codable {
    case properties, yaml, toml, json
}

public struct MinecraftVersion: Comparable, Sendable {
    private let components: [Int]

    public init?(_ text: String) {
        let pieces = text.split(separator: ".", omittingEmptySubsequences: false)
        guard !pieces.isEmpty else { return nil }
        var numbers: [Int] = []
        for piece in pieces {
            guard !piece.isEmpty, piece.utf8.allSatisfy({ (48...57).contains($0) }),
                let number = Int(piece)
            else { return nil }
            numbers.append(number)
        }
        while numbers.count > 1, numbers.last == 0 { numbers.removeLast() }
        components = numbers
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        for index in 0..<max(lhs.components.count, rhs.components.count) {
            let left = index < lhs.components.count ? lhs.components[index] : 0
            let right = index < rhs.components.count ? rhs.components[index] : 0
            if left != right { return left < right }
        }
        return false
    }
}

public enum JSONValue: Sendable, Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    public var displayText: String {
        switch self {
        case .string(let value): return value
        case .number(let value):
            if value.isFinite, value.rounded() == value { return String(format: "%.0f", value) }
            return String(value)
        case .bool(let value): return value ? "true" : "false"
        case .null: return "null"
        case .array, .object:
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
            guard let data = try? encoder.encode(self) else { return "null" }
            return String(decoding: data, as: UTF8.self)
        }
    }
}

public struct LocalizedText: Sendable, Codable, Equatable {
    public let en: String
    public let ja: String
    public init(en: String, ja: String) {
        self.en = en
        self.ja = ja
    }
    public func text(language: String) -> String { language == "ja" ? ja : en }
}

public enum ValueType: String, Sendable, Codable {
    case bool, int, float, string, `enum`, list, map, section
}

public struct SchemaEntry: Sendable, Codable, Equatable {
    public let path: String
    public let type: ValueType
    public let `default`: JSONValue?
    public let min: Double?
    public let max: Double?
    public let values: [String]?
    public let since: String?
    public let until: String?
    public let doc: LocalizedText
    public var segments: [String] { path.components(separatedBy: ".") }

    public init(
        path: String, type: ValueType, default: JSONValue? = nil,
        min: Double? = nil, max: Double? = nil, values: [String]? = nil,
        since: String? = nil, until: String? = nil, doc: LocalizedText
    ) {
        self.path = path
        self.type = type
        self.default = `default`
        self.min = min
        self.max = max
        self.values = values
        self.since = since
        self.until = until
        self.doc = doc
    }
}

public struct ConfigSchema: Sendable, Codable {
    public let id: String
    public let title: String
    public let format: ConfigFormat
    public let files: [String]
    public let software: [String]
    public let since: String?
    public let until: String?
    public let sources: [String]
    public let entries: [SchemaEntry]

    public init(
        id: String, title: String, format: ConfigFormat, files: [String], software: [String],
        since: String? = nil, until: String? = nil, sources: [String], entries: [SchemaEntry]
    ) {
        self.id = id
        self.title = title
        self.format = format
        self.files = files
        self.software = software
        self.since = since
        self.until = until
        self.sources = sources
        self.entries = entries
    }
}

/// Immutable after loading, so a store can be shared with background analysis tasks.
public final class SchemaStore: Sendable {
    private let schemas: [ConfigSchema]

    public init(directory: URL) throws {
        let files = try FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: [.isRegularFileKey]
        )
        .filter {
            guard $0.pathExtension.lowercased() == "json" else { return false }
            return try $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true
        }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
        let decoder = JSONDecoder()
        schemas = try files.map { try decoder.decode(ConfigSchema.self, from: Data(contentsOf: $0)) }
    }

    public func schema(forRelativePath path: String, software: String, version: String?) -> ConfigSchema? {
        let id = ServerSoftware.id(for: software)
        return schemas.first {
            $0.files.contains(path) && $0.software.contains(id)
                && Self.includes(version: version, since: $0.since, until: $0.until)
        }
    }

    public func entries(of schema: ConfigSchema, version: String?) -> [SchemaEntry] {
        schema.entries.filter { Self.includes(version: version, since: $0.since, until: $0.until) }
    }

    private static func includes(version: String?, since: String?, until: String?) -> Bool {
        guard let version, let parsed = MinecraftVersion(version) else { return true }
        if let since, let lower = MinecraftVersion(since), parsed < lower { return false }
        if let until, let upper = MinecraftVersion(until), parsed > upper { return false }
        return true
    }
}

public enum ServerSoftware: Sendable {
    public static func id(for profileSoftware: String) -> String {
        switch profileSoftware.lowercased() {
        case "leafmc", "leaf": return "leaf"
        case "purpur": return "paper"
        case "neoforge": return "forge"
        case "craftbukkit", "bukkit": return "spigot"
        default: return profileSoftware.lowercased()
        }
    }
}
