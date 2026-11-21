// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// A server jar upgrade that keeps its progress stream alive independently of
/// the screen that started it.
public struct ServerJarUpgradeOperation: Sendable {
    public let operationID: String
    public let progress: AsyncStream<ServerJarUpgradeProgress>
    private let task: Task<Result<ServerJarUpgradeResult, CoreError>, Never>

    fileprivate init(
        operationID: String,
        progress: AsyncStream<ServerJarUpgradeProgress>,
        task: Task<Result<ServerJarUpgradeResult, CoreError>, Never>
    ) {
        self.operationID = operationID
        self.progress = progress
        self.task = task
    }

    public func value() async throws(CoreError) -> ServerJarUpgradeResult {
        try await task.value.get()
    }

    /// Requests cancellation; honored until the jar swap starts.
    @discardableResult
    public func cancel() async -> Bool {
        await CoreClient.cancelServerJarUpgrade(operationID: operationID)
    }
}

extension CoreClient {
    // MARK: Server version and software change

    /// Release versions the selected provider offers for the server, newest first.
    public static func serverJarUpgradeCandidates(
        serverID: String,
        targetSoftware: String? = nil
    ) async throws(CoreError) -> ServerJarCandidates {
        try await detachedCall {
            try await MCVectorCore.serverJarUpgradeCandidates(serverId: serverID, targetSoftware: targetSoftware)
        }
    }

    /// Compares the version recorded in the registry with metadata in server.jar.
    public static func serverJarVersionStatus(serverID: String) async throws(CoreError) -> ServerJarVersionStatus {
        try await detachedCall { try await MCVectorCore.serverJarVersionStatus(serverId: serverID) }
    }

    /// Writes the version detected in server.jar to the registry.
    public static func syncVersionFromJar(serverID: String) async throws(CoreError) -> ServerJarVersionStatus {
        try await detachedCall { try await MCVectorCore.syncVersionFromJar(serverId: serverID) }
    }

    /// Checks the channel of the best available build for a release.
    public static func serverJarVersionAvailability(
        software: String,
        version: String
    ) async throws(CoreError) -> ServerJarVersionAvailability {
        try await detachedCall {
            try await MCVectorCore.serverJarVersionAvailability(software: software, version: version)
        }
    }

    /// Resolves `targetVersion` (the newest with an eligible build when nil) into a short-lived plan.
    /// Show `verified`, `serverRunning` and `requiredJava` before executing.
    public static func prepareServerJarUpgrade(
        serverID: String,
        targetVersion: String? = nil,
        targetSoftware: String? = nil,
        allowUnstable: Bool = false,
        allowDowngrade: Bool = false
    ) async throws(CoreError) -> ServerJarUpgradePlan {
        try await detachedCall {
            try await MCVectorCore.prepareServerJarUpgrade(
                serverId: serverID,
                targetVersion: targetVersion,
                targetSoftware: targetSoftware,
                allowUnstable: allowUnstable,
                allowDowngrade: allowDowngrade
            )
        }
    }

    /// Installs a prepared plan. The plan is consumed even on failure; prepare
    /// a new one to retry. Fails with `server.running` until the server stops.
    public static func executeServerJarUpgrade(planID: String) -> ServerJarUpgradeOperation {
        let operationID = UUID().uuidString.lowercased()
        let pair = AsyncStream<ServerJarUpgradeProgress>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let observer = ServerJarUpgradeProgressForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<ServerJarUpgradeResult, CoreError>, Never> = Task.detached(priority: .userInitiated) {
            defer { continuation.finish() }
            do {
                return .success(
                    try await MCVectorCore.executeServerJarUpgrade(
                        operationId: operationID,
                        planId: planID,
                        observer: observer
                    )
                )
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return ServerJarUpgradeOperation(operationID: operationID, progress: pair.stream, task: task)
    }

    /// Requests cancellation of an active upgrade.
    @discardableResult
    public static func cancelServerJarUpgrade(operationID: String) async -> Bool {
        await MCVectorCore.cancelServerJarUpgrade(operationId: operationID)
    }
}

/// Feeds UniFFI callbacks into a bounded stream; only the newest progress matters.
private final class ServerJarUpgradeProgressForwarder: ServerJarUpgradeObserver {
    private let continuation: AsyncStream<ServerJarUpgradeProgress>.Continuation

    init(_ continuation: AsyncStream<ServerJarUpgradeProgress>.Continuation) {
        self.continuation = continuation
    }

    func onProgress(event: ServerJarUpgradeProgress) {
        continuation.yield(event)
    }
}
