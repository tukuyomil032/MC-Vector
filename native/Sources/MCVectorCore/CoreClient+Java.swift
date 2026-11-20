// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// A Java runtime download that keeps its progress stream alive independently
/// of the screen that started it.
public struct JavaInstallOperation: Sendable {
    public let operationID: String
    public let progress: AsyncStream<JavaInstallProgress>
    private let task: Task<Result<JavaRuntimeRecord, CoreError>, Never>

    fileprivate init(
        operationID: String,
        progress: AsyncStream<JavaInstallProgress>,
        task: Task<Result<JavaRuntimeRecord, CoreError>, Never>
    ) {
        self.operationID = operationID
        self.progress = progress
        self.task = task
    }

    public func value() async throws(CoreError) -> JavaRuntimeRecord {
        try await task.value.get()
    }

    /// Requests cancellation; the install stops at its next checkpoint
    /// (between download chunks, archive entries, or before the final swap).
    @discardableResult
    public func cancel() async -> Bool {
        await CoreClient.cancelJavaInstall(operationID: operationID)
    }
}

extension CoreClient {
    // MARK: Java runtimes

    /// Registered runtimes (managed downloads and custom runtimes), newest major first.
    public static func javaRuntimes() async throws(CoreError) -> [JavaRuntimeRecord] {
        try await detachedCall { try await MCVectorCore.javaRuntimes() }
    }

    /// Adoptium LTS majors with their installed state; `offline` is true when
    /// the built-in list (8, 17, 21, 25) is shown instead.
    public static func javaAvailableReleases() async throws(CoreError) -> JavaReleaseList {
        try await detachedCall { try await MCVectorCore.javaAvailableReleases() }
    }

    /// Starts downloading and installing the newest Temurin JDK of `major`.
    /// The stream is connected before the worker starts.
    public static func installJava(major: UInt32) -> JavaInstallOperation {
        let operationID = UUID().uuidString.lowercased()
        let pair = AsyncStream<JavaInstallProgress>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let observer = JavaInstallProgressForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<JavaRuntimeRecord, CoreError>, Never> = Task.detached(priority: .userInitiated) {
            defer { continuation.finish() }
            do {
                return .success(
                    try await MCVectorCore.installJavaRuntime(
                        operationId: operationID,
                        major: major,
                        observer: observer
                    )
                )
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return JavaInstallOperation(operationID: operationID, progress: pair.stream, task: task)
    }

    /// Requests cancellation of an active Java install.
    @discardableResult
    public static func cancelJavaInstall(operationID: String) async -> Bool {
        await MCVectorCore.cancelJavaInstall(operationId: operationID)
    }

    /// Removes a runtime. A managed runtime's folder is deleted too; this fails
    /// with `java.in_use` while a running server uses it.
    public static func deleteJava(major: UInt32) async throws(CoreError) {
        try await detachedCall { try await MCVectorCore.deleteJavaRuntime(major: major) }
    }

    /// Registers a java executable or Java home the user picked. The path must
    /// be app-managed or a trusted system location, and `-version` must succeed.
    public static func addCustomJava(path: String) async throws(CoreError) -> JavaRuntimeRecord {
        try await detachedCall { try await MCVectorCore.addCustomJavaRuntime(path: path) }
    }

    /// The Java major `software` at `version` needs, or nil (proxies, unknown versions).
    public static func requiredJava(software: String, version: String) async -> JavaRequirementRecord? {
        await Task.detached(priority: .userInitiated) {
            await MCVectorCore.requiredJavaForVersion(software: software, version: version)
        }.value
    }

    /// The server's configured Java against what its Minecraft version needs.
    public static func javaCompatibility(serverID: String) async throws(CoreError) -> ServerJavaCompatibility {
        try await detachedCall { try await MCVectorCore.serverJavaCompatibility(serverId: serverID) }
    }
}

/// Feeds UniFFI callbacks into a bounded stream; only the newest progress matters.
private final class JavaInstallProgressForwarder: JavaInstallObserver {
    private let continuation: AsyncStream<JavaInstallProgress>.Continuation

    init(_ continuation: AsyncStream<JavaInstallProgress>.Continuation) {
        self.continuation = continuation
    }

    func onProgress(event: JavaInstallProgress) {
        continuation.yield(event)
    }
}
