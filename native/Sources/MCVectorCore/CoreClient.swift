// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// Typed entry point the SwiftUI app uses instead of the raw UniFFI functions.
///
/// Every call converts `FfiError` into `CoreError`, and blocking Rust work runs
/// off the main actor (API-005).
public enum CoreClient {
    /// Result of starting the core.
    public enum StartResult: Equatable, Sendable {
        /// This process holds the instance lock; the registry is open.
        case ready(dataDirectory: String)
        /// Another MC-Vector holds the lock. Nothing in the data folder was touched.
        case heldByOther(LockOwnerInfo?)
    }

    /// Debug builds use the `.debug` data folder shared with the Tauri debug build.
    public static var isDebugBuild: Bool {
        #if DEBUG
            true
        #else
            false
        #endif
    }

    /// Takes the cross-edition lock and opens the registry (NAT-010).
    /// Synchronous on purpose: the app calls it before any window exists.
    public static func start(bundlePath: String = Bundle.main.bundlePath) throws(CoreError) -> StartResult {
        // Debug builds only: the capture tooling points the app at fixture data
        // (native/.build/fixtures). The core ignores this in release builds.
        let dataDirOverride = isDebugBuild ? ProcessInfo.processInfo.environment["MCVECTOR_DATA_DIR"] : nil
        do {
            switch try MCVectorCore.start(
                debugBuild: isDebugBuild,
                bundlePath: bundlePath,
                debugDataDirOverride: dataDirOverride
            ) {
            case .ready(let dataDir):
                return .ready(dataDirectory: dataDir)
            case .heldByOther(let owner):
                return .heldByOther(owner)
            }
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    /// The language saved in config.json (`"en"` / `"ja"`), or nil to follow the system.
    public static func configLocale() -> String? {
        (try? MCVectorCore.configLocale()) ?? nil
    }

    /// Lists registered servers (OP-SRV-001).
    public static func servers() async throws(CoreError) -> [ServerProfile] {
        let result: Result<[ServerProfile], CoreError> = await Task.detached(priority: .userInitiated) {
            do {
                return .success(try getServers())
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }.value
        return try result.get()
    }

    // MARK: App settings (shared config.json keys)

    public static func appSettings() throws(CoreError) -> AppSettings {
        do { return try getAppSettings() } catch { throw CoreError.unexpected(error) }
    }

    public static func setLocale(_ locale: String) throws(CoreError) {
        do { try MCVectorCore.setLocale(locale: locale) } catch { throw CoreError.unexpected(error) }
    }

    public static func setUpdateChannel(_ channel: String) throws(CoreError) {
        do { try MCVectorCore.setUpdateChannel(channel: channel) } catch { throw CoreError.unexpected(error) }
    }

    public static func setAllowUnverifiedPluginDownloads(_ enabled: Bool) throws(CoreError) {
        do {
            try MCVectorCore.setAllowUnverifiedPluginDownloads(enabled: enabled)
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    // MARK: Server management (OP-SRV-004, OP-SRV-015, OP-SRV-016)

    /// Copies a stopped server's managed folder and registers it under `name`.
    public static func cloneServer(id: String, name: String) async throws(CoreError) -> ServerProfile {
        do {
            return try await MCVectorCore.cloneServer(sourceServerId: id, name: name)
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    /// Deletes a stopped server and its managed folder. Returns false when nothing was removed.
    public static func deleteServer(id: String) async throws(CoreError) -> Bool {
        do {
            return try await MCVectorCore.deleteServer(serverId: id)
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    /// Saves the server's settings as a new template named `name`.
    public static func saveTemplate(fromServer id: String, name: String) async throws(CoreError) {
        do {
            try await MCVectorCore.saveServerTemplateFromServer(serverId: id, name: name)
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    // MARK: Server creation (OP-SRV-002)

    /// Identifies this app in provider requests. Call once at startup.
    public static func setAppVersion(_ version: String) {
        MCVectorCore.setAppVersion(version: version)
    }

    /// The add-server form's software choices, in display order.
    public static func softwareOptions() -> [SoftwareOption] {
        MCVectorCore.softwareOptions()
    }

    /// The core's server-name rule (trimmed `[A-Za-z0-9_-]`, 1–128 bytes).
    public static func isValidServerName(_ name: String) -> Bool {
        MCVectorCore.isValidServerName(name: name)
    }

    /// Saved server templates.
    public static func serverTemplates() async throws(CoreError) -> [ServerTemplateInfo] {
        let result: Result<[ServerTemplateInfo], CoreError> = await Task.detached(priority: .userInitiated) {
            do {
                return .success(try MCVectorCore.serverTemplates())
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }.value
        return try result.get()
    }

    /// Creates a server. `onStage` is called from a background thread.
    /// Cancel with `cancelServerCreation(operationID:)`; a cancelled creation
    /// throws `operation.cancelled` and leaves nothing behind.
    public static func createServer(
        _ input: NewServerInput,
        onStage: @escaping @Sendable (CreationStage) -> Void
    ) async throws(CoreError) -> CreatedServerInfo {
        do {
            return try await MCVectorCore.createServer(input: input, observer: StageObserver(onStage))
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    // MARK: Files (OP-FILE-001..009)

    /// Runs a core call and turns its error into CoreError.
    private static func call<T>(_ work: () async throws -> T) async throws(CoreError) -> T {
        do { return try await work() } catch { throw CoreError.unexpected(error) }
    }

    /// UniFFI work is kept away from the caller's executor, including async
    /// bindings whose synchronous entry work can access files or locks.
    static func detachedCall<T: Sendable>(
        _ work: @escaping @Sendable () async throws -> T
    ) async throws(CoreError) -> T {
        let result: Result<T, CoreError> = await Task.detached(priority: .userInitiated) {
            do {
                return .success(try await work())
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }.value
        return try result.get()
    }

    public static func listFiles(serverID: String, relative: String) async throws(CoreError) -> [FileItem] {
        try await call { try await MCVectorCore.listFiles(serverId: serverID, relative: relative) }
    }

    public static func createFileEntry(
        serverID: String, parent: String, name: String, isDirectory: Bool
    ) async throws(CoreError) {
        try await call {
            try await MCVectorCore.createFileEntry(
                serverId: serverID, parent: parent, name: name, isDirectory: isDirectory)
        }
    }

    public static func renameFileEntry(serverID: String, relative: String, newName: String) async throws(CoreError) {
        try await call {
            try await MCVectorCore.renameFileEntry(serverId: serverID, relative: relative, newName: newName)
        }
    }

    public static func moveFileEntries(serverID: String, entries: [String], destination: String) async throws(CoreError)
    {
        try await call {
            try await MCVectorCore.moveFileEntries(serverId: serverID, entries: entries, destination: destination)
        }
    }

    public static func deleteFileEntries(serverID: String, entries: [String]) async throws(CoreError) {
        try await call { try await MCVectorCore.deleteFileEntries(serverId: serverID, entries: entries) }
    }

    public static func folderSize(serverID: String, relative: String) async throws(CoreError) -> FolderSize {
        try await call { try await MCVectorCore.folderSize(serverId: serverID, relative: relative) }
    }

    public static func importFileEntries(serverID: String, destination: String, sources: [URL]) async throws(CoreError)
        -> UInt32
    {
        try await call {
            try await MCVectorCore.importFileEntries(
                serverId: serverID,
                destination: destination,
                sources: sources.map { $0.path(percentEncoded: false) }
            )
        }
    }

    public static func fileEntryURL(serverID: String, relative: String) throws(CoreError) -> URL {
        do {
            return URL(fileURLWithPath: try MCVectorCore.fileEntryPath(serverId: serverID, relative: relative))
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    public static func readTextDocument(serverID: String, relative: String) async throws(CoreError) -> TextDocumentInfo
    {
        try await call { try await MCVectorCore.readTextDocument(serverId: serverID, relative: relative) }
    }

    public static func writeTextDocument(serverID: String, relative: String, document: TextDocumentInfo)
        async throws(CoreError)
    {
        try await call {
            try await MCVectorCore.writeTextDocument(serverId: serverID, relative: relative, document: document)
        }
    }

    // MARK: Server import (OP-SRV-003)

    /// Analyzes a picked server folder without copying it. Keep the token and
    /// pass it as `NewServerInput.importToken`, or cancel it.
    public static func beginServerImport(folder: URL) async throws(CoreError) -> ImportAnalysisInfo {
        do {
            return try await MCVectorCore.beginServerImport(path: folder.path(percentEncoded: false))
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    /// Forgets a picked folder.
    public static func cancelServerImport(token: String) {
        MCVectorCore.cancelServerImport(token: token)
    }

    // MARK: Running servers (OP-SRV-005..008)

    /// Receives console lines, status changes and stats of running servers.
    public static func subscribeServerEvents(_ observer: ServerEventObserver) {
        MCVectorCore.subscribeServerEvents(observer: observer)
    }

    public static func startServer(id: String) async throws(CoreError) {
        do { try await MCVectorCore.startServer(serverId: id) } catch { throw CoreError.unexpected(error) }
    }

    public static func stopServer(id: String) async throws(CoreError) {
        do { try await MCVectorCore.stopServer(serverId: id) } catch { throw CoreError.unexpected(error) }
    }

    public static func restartServer(id: String) async throws(CoreError) {
        do { try await MCVectorCore.restartServer(serverId: id) } catch { throw CoreError.unexpected(error) }
    }

    public static func sendCommand(id: String, command: String) async throws(CoreError) {
        do {
            try await MCVectorCore.sendCommand(serverId: id, command: command)
        } catch {
            throw CoreError.unexpected(error)
        }
    }

    /// The current 60-second metric window of a running server.
    public static func serverMetricHistory(id: String) async -> MetricSnapshot? {
        await MCVectorCore.serverMetricHistory(serverId: id)
    }

    public static func runningServerIDs() async -> [String] {
        await MCVectorCore.runningServerIds()
    }

    /// Stops every running server; used when quitting.
    public static func shutdownAllServers() async throws(CoreError) {
        do { try await MCVectorCore.shutdownAllServers() } catch { throw CoreError.unexpected(error) }
    }

    public static func serverEulaStatus(id: String) throws(CoreError) -> EulaStatus {
        do { return try MCVectorCore.serverEulaStatus(serverId: id) } catch { throw CoreError.unexpected(error) }
    }

    public static func acceptServerEula(id: String) throws(CoreError) {
        do { try MCVectorCore.acceptServerEula(serverId: id) } catch { throw CoreError.unexpected(error) }
    }

    // MARK: Server general settings (UI-014)

    /// Reads the persisted general settings for one server.
    public static func serverSettings(serverID: String) async throws(CoreError) -> ServerSettings {
        try await detachedCall {
            try await MCVectorCore.getServerSettings(serverId: serverID)
        }
    }

    /// Saves general settings and reports whether changed values take effect after a restart.
    public static func updateServerSettings(
        serverID: String, settings: ServerSettingsUpdate
    ) async throws(CoreError) -> ServerSettingsSaveResult {
        try await detachedCall {
            try await MCVectorCore.updateServerSettings(serverId: serverID, settings: settings)
        }
    }

    // MARK: Server properties (OP-SRV-021, OP-SRV-022)

    /// Reads server.properties while preserving its line-ending and BOM metadata.
    public static func serverProperties(serverID: String) async throws(CoreError) -> ServerPropertiesSnapshot {
        try await detachedCall { try await MCVectorCore.getServerProperties(serverId: serverID) }
    }

    /// Saves property updates and returns the port when it changed.
    public static func saveServerProperties(
        serverID: String, updates: [PropertyUpdate]
    ) async throws(CoreError) -> SavePropertiesResult {
        try await detachedCall {
            try await MCVectorCore.saveServerProperties(serverId: serverID, updates: updates)
        }
    }

    // MARK: Player lists (OP-SRV-024, OP-SRV-025)

    /// Reads whitelist, operators, banned players, and banned IPs.
    public static func playerLists(serverID: String) async throws(CoreError) -> PlayerListSnapshot {
        try await detachedCall { try await MCVectorCore.getPlayerLists(serverId: serverID) }
    }

    /// Mutates a managed list and returns its canonical target for a live command.
    public static func mutatePlayerList(
        serverID: String, list: PlayerListKind, action: PlayerListAction, value: String
    ) async throws(CoreError) -> PlayerListMutationResult {
        try await detachedCall {
            try await MCVectorCore.mutatePlayerList(
                serverId: serverID, list: list, action: action, value: value
            )
        }
    }

    /// Asks a running creation to stop. False when it already finished.
    @discardableResult
    public static func cancelServerCreation(operationID: String) -> Bool {
        MCVectorCore.cancelServerCreation(operationId: operationID)
    }
}

/// Forwards creation progress from Rust to a Swift closure.
private final class StageObserver: CreationObserver {
    private let onStage: @Sendable (CreationStage) -> Void

    init(_ onStage: @escaping @Sendable (CreationStage) -> Void) {
        self.onStage = onStage
    }

    func onStage(stage: CreationStage) {
        onStage(stage)
    }
}
