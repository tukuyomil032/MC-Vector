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
            case let .ready(dataDir):
                return .ready(dataDirectory: dataDir)
            case let .heldByOther(owner):
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
