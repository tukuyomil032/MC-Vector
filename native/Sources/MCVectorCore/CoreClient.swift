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
        do {
            switch try MCVectorCore.start(debugBuild: isDebugBuild, bundlePath: bundlePath) {
            case let .ready(dataDir):
                return .ready(dataDirectory: dataDir)
            case let .heldByOther(owner):
                return .heldByOther(owner)
            }
        } catch {
            throw CoreError.unexpected(error)
        }
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
}

extension LockOwnerInfo: @unchecked Sendable {}
extension ServerProfile: @unchecked Sendable {}
