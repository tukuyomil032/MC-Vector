import Foundation

/// Minimal, independent reader/writer for the Native app's own
/// `servers.json`.
///
/// This does not interoperate with the Tauri Classic app's on-disk store —
/// the Native app manages its own file, whose location is injected as a
/// `URL` so tests can point it at a temp directory. This is intentionally
/// thin: just enough to prove `Server`/`ServerTemplate` round-trip through
/// JSON and that a real file can be read and written. CRUD/UI wiring is
/// out of scope for this task.
public actor ServerStore {
    private let fileURL: URL

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public func load() throws -> ServersFile {
        let data = try Data(contentsOf: self.fileURL)
        return try JSONDecoder().decode(ServersFile.self, from: data)
    }

    public func save(_ file: ServersFile) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(file)
        try data.write(to: self.fileURL, options: .atomic)
    }
}
