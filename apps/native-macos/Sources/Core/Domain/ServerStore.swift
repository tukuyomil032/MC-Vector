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

extension ServerStore {
    /// Subdirectory name under Application Support that holds this app's
    /// own on-disk data. Distinct from the Tauri Classic app's storage.
    private static let applicationSupportSubdirectoryName = "MC-Vector Native"

    /// Resolves the production `servers.json` location under the current
    /// user's Application Support directory, creating the parent directory
    /// first if it doesn't exist yet.
    ///
    /// Non-throwing by design so it can back a `View`'s `@State` default
    /// initializer directly: directory resolution/creation failures here
    /// are exceedingly rare (a missing/unwritable Application Support
    /// directory would already be breaking most of macOS), and any real
    /// failure still surfaces later as a `ServerStore.load()`/`save()`
    /// error, which callers already handle.
    ///
    /// Tests must not call this -- it touches the real Application Support
    /// directory on the machine running the tests. Point a `ServerStore` at
    /// a temp file instead (see `ServerStoreTests`).
    public static func defaultFileURL(fileManager: FileManager = .default) -> URL {
        let supportDirectory = (try? fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true,
        )) ?? fileManager.temporaryDirectory

        let appDirectory = supportDirectory.appendingPathComponent(
            self.applicationSupportSubdirectoryName,
            isDirectory: true,
        )
        try? fileManager.createDirectory(at: appDirectory, withIntermediateDirectories: true)

        return appDirectory.appendingPathComponent("servers.json", isDirectory: false)
    }
}
