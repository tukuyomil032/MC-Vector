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
}
