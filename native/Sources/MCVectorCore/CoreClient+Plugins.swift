// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

public enum PluginInstallFailure: Sendable {
    case incompatible
    case checksum
    case unverified
    case size
    case destination
    case source
}

extension CoreError {
    public var pluginInstallFailure: PluginInstallFailure? {
        switch code {
        case "plugin.incompatible": .incompatible
        case "download.checksum_mismatch": .checksum
        case "plugin.unverified_blocked": .unverified
        case "download.too_large": .size
        case "plugin.destination_rejected": .destination
        case "plugin.source_rejected": .source
        default: nil
        }
    }
}

public struct PluginInstallOperation: Sendable {
    public let operationID: String
    public let progress: AsyncStream<PluginInstallProgress>
    private let task: Task<Result<PluginInstallResult, CoreError>, Never>

    fileprivate init(
        operationID: String, progress: AsyncStream<PluginInstallProgress>,
        task: Task<Result<PluginInstallResult, CoreError>, Never>
    ) {
        self.operationID = operationID
        self.progress = progress
        self.task = task
    }

    public func value() async throws(CoreError) -> PluginInstallResult {
        try await task.value.get()
    }

    @discardableResult
    public func cancel() async -> Bool {
        await CoreClient.cancelPluginOperation(operationID: operationID)
    }
}

extension CoreClient {
    public static func pluginSupport(software: String) -> PluginServerSupport {
        MCVectorCore.pluginServerSupport(software: software)
    }

    /// One page of results; `total` is nil when the source does not report it.
    public static func searchPlugins(_ input: PluginSearchInput) async throws(CoreError) -> PluginSearchPage {
        try await detachedCall { try await MCVectorCore.searchPlugins(input: input) }
    }

    /// Published versions for the detail view (empty for SpigotMC).
    public static func pluginVersions(
        project: PluginProject, software: String
    ) async throws(CoreError) -> [PluginVersionRecord] {
        try await detachedCall { try await MCVectorCore.pluginVersions(project: project, software: software) }
    }

    public static func pluginCategories(source: PluginSource) async throws(CoreError) -> [PluginCategory] {
        try await detachedCall { try await MCVectorCore.pluginCategories(source: source) }
    }

    public static func pluginReadmeHTML(
        source: PluginSource, body: String,
        projectURL: String
    ) async throws(CoreError) -> String {
        try await detachedCall {
            try MCVectorCore.pluginReadmeHtml(source: source, body: body, projectUrl: projectURL)
        }
    }

    public static func pluginReadme(project: PluginProject) async throws(CoreError) -> String? {
        try await detachedCall { try await MCVectorCore.pluginReadme(project: project) }
    }

    public static func preparePluginInstall(
        serverID: String, project: PluginProject,
        replaceFileName: String? = nil
    ) async throws(CoreError)
        -> PluginInstallPreview
    {
        try await detachedCall {
            try await MCVectorCore.preparePluginInstall(
                serverId: serverID, project: project,
                replaceFileName: replaceFileName)
        }
    }

    public static func executePluginInstall(
        token: String, confirmedDependencyIDs: [String] = []
    ) -> PluginInstallOperation {
        let operationID = UUID().uuidString.lowercased()
        let pair = AsyncStream<PluginInstallProgress>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let observer = PluginInstallForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<PluginInstallResult, CoreError>, Never> = Task.detached(priority: .userInitiated) {
            defer { continuation.finish() }
            do {
                return .success(
                    try await MCVectorCore.executePluginInstall(
                        operationId: operationID, token: token,
                        confirmedDependencyIds: confirmedDependencyIDs, observer: observer
                    ))
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return PluginInstallOperation(operationID: operationID, progress: pair.stream, task: task)
    }

    @discardableResult
    public static func cancelPluginOperation(operationID: String) async -> Bool {
        await MCVectorCore.cancelPluginOperation(operationId: operationID)
    }

    public static func toggleInstalledPlugin(serverID: String, fileName: String) async throws(CoreError) -> String {
        try await detachedCall {
            try await MCVectorCore.toggleInstalledPlugin(serverId: serverID, fileName: fileName)
        }
    }

    public static func uninstallPlugin(serverID: String, fileName: String) async throws(CoreError) {
        try await detachedCall {
            try await MCVectorCore.uninstallPlugin(serverId: serverID, fileName: fileName)
        }
    }
}

private final class PluginInstallForwarder: PluginInstallObserver {
    private let continuation: AsyncStream<PluginInstallProgress>.Continuation

    init(_ continuation: AsyncStream<PluginInstallProgress>.Continuation) {
        self.continuation = continuation
    }

    func onProgress(event: PluginInstallProgress) {
        continuation.yield(event)
    }
}

public struct PluginBulkOperation: Sendable {
    public let operationID: String
    public let progress: AsyncStream<PluginBulkProgress>
    fileprivate let task: Task<Result<PluginBulkOutcome, CoreError>, Never>

    public func value() async throws(CoreError) -> PluginBulkOutcome {
        try await task.value.get()
    }

    @discardableResult
    public func cancel() async -> Bool {
        await CoreClient.cancelPluginOperation(operationID: operationID)
    }
}

extension CoreClient {
    public static func installedPlugins(
        serverID: String,
        checkUpdates: Bool = false
    ) async throws(CoreError) -> [InstalledPlugin] {
        try await detachedCall {
            try await MCVectorCore.installedPlugins(serverId: serverID, checkUpdates: checkUpdates)
        }
    }

    public static func bulkUpdatePlugins(serverID: String) -> PluginBulkOperation {
        let operationID = UUID().uuidString.lowercased()
        let pair = AsyncStream<PluginBulkProgress>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let observer = PluginBulkForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<PluginBulkOutcome, CoreError>, Never> = Task.detached(priority: .userInitiated) {
            defer { continuation.finish() }
            do {
                return .success(
                    try await MCVectorCore.bulkUpdatePlugins(
                        operationId: operationID, serverId: serverID, observer: observer
                    ))
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return PluginBulkOperation(operationID: operationID, progress: pair.stream, task: task)
    }
}

private final class PluginBulkForwarder: PluginBulkObserver {
    private let continuation: AsyncStream<PluginBulkProgress>.Continuation

    init(_ continuation: AsyncStream<PluginBulkProgress>.Continuation) {
        self.continuation = continuation
    }

    func onProgress(event: PluginBulkProgress) {
        continuation.yield(event)
    }
}
