// SPDX-License-Identifier: GPL-3.0-or-later

import Foundation

/// A manual backup that keeps its progress stream alive independently of the
/// screen that started it.
public struct BackupOperation: Sendable {
    public let operationID: String
    public let progress: AsyncStream<BackupProgressEvent>
    private let task: Task<Result<BackupCreateOutcome, CoreError>, Never>

    fileprivate init(
        operationID: String,
        progress: AsyncStream<BackupProgressEvent>,
        task: Task<Result<BackupCreateOutcome, CoreError>, Never>
    ) {
        self.operationID = operationID
        self.progress = progress
        self.task = task
    }

    public func value() async throws(CoreError) -> BackupCreateOutcome {
        try await task.value.get()
    }

    @discardableResult
    public func cancel() async -> Bool {
        await CoreClient.cancelBackup(operationID: operationID)
    }
}

/// A restore operation that streams file-level progress and remains active
/// independently of the screen that started it.
public struct BackupRestoreOperation: Sendable {
    public let operationID: String
    public let progress: AsyncStream<BackupProgressEvent>
    private let task: Task<Result<Void, CoreError>, Never>

    fileprivate init(
        operationID: String,
        progress: AsyncStream<BackupProgressEvent>,
        task: Task<Result<Void, CoreError>, Never>
    ) {
        self.operationID = operationID
        self.progress = progress
        self.task = task
    }

    public func value() async throws(CoreError) {
        try await task.value.get()
    }
}

/// One Native scheduler tick and its progress stream. The app owns the timer;
/// dropping this handle does not cancel a due automatic backup.
public struct AutomaticBackupTick: Sendable {
    public let progress: AsyncStream<BackupProgressEvent>
    private let task: Task<Result<[AutomaticBackupTickResult], CoreError>, Never>

    fileprivate init(
        progress: AsyncStream<BackupProgressEvent>,
        task: Task<Result<[AutomaticBackupTickResult], CoreError>, Never>
    ) {
        self.progress = progress
        self.task = task
    }

    public func value() async throws(CoreError) -> [AutomaticBackupTickResult] {
        try await task.value.get()
    }
}

extension CoreClient {
    // MARK: Backups (OP-BACK-001..005)

    /// Loads verified full-backup manifests for one managed server.
    public static func backups(serverID: String) async throws(CoreError) -> [BackupRecord] {
        try await detachedCall { try await MCVectorCore.listManagedBackups(serverId: serverID) }
    }

    /// Starts a manual full backup and returns a progress stream before the
    /// archive worker starts. Cancellation is available only at safe archive
    /// checkpoints through `BackupOperation.cancel()`.
    public static func createBackup(
        serverID: String,
        backupName: String? = nil,
        compressionLevel: Int64? = nil,
        stopRunningServer: Bool = false
    ) -> BackupOperation {
        let operationID = UUID().uuidString.lowercased()
        let input = BackupCreateInput(
            operationId: operationID,
            serverId: serverID,
            backupName: backupName,
            compressionLevel: compressionLevel,
            stopRunningServer: stopRunningServer
        )
        let pair = AsyncStream<BackupProgressEvent>.makeStream(
            bufferingPolicy: .bufferingNewest(1)
        )
        let observer = BackupProgressForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<BackupCreateOutcome, CoreError>, Never> = Task.detached(priority: .userInitiated) {
            defer { continuation.finish() }
            do {
                return .success(try await MCVectorCore.createManagedBackup(input: input, observer: observer))
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return BackupOperation(operationID: operationID, progress: pair.stream, task: task)
    }

    /// Loads the shared tags and notes catalog for one server.
    public static func backupMetadata(serverID: String) async throws(CoreError) -> BackupMetadataCatalog {
        try await detachedCall {
            try await MCVectorCore.loadManagedBackupMetadata(serverId: serverID)
        }
    }

    /// Saves tags and a note for one backup.
    public static func setBackupMetadata(
        serverID: String,
        backupName: String,
        tags: [String],
        note: String
    ) async throws(CoreError) -> BackupMetadataCatalog {
        try await detachedCall {
            try await MCVectorCore.setManagedBackupTags(
                serverId: serverID,
                backupName: backupName,
                tags: tags,
                note: note
            )
        }
    }

    /// Starts restoring a verified backup into a stopped server.
    ///
    /// Restore progress is observable, but restore does not support
    /// cancellation because replacement has no safe cancellation contract.
    public static func restoreBackupWithProgress(
        serverID: String,
        backupName: String
    ) -> BackupRestoreOperation {
        let operationID = UUID().uuidString.lowercased()
        let pair = AsyncStream<BackupProgressEvent>.makeStream(
            bufferingPolicy: .bufferingNewest(1)
        )
        let observer = BackupProgressForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<Void, CoreError>, Never> = Task.detached(priority: .userInitiated) {
            defer { continuation.finish() }
            do {
                try await MCVectorCore.restoreManagedBackupWithProgress(
                    serverId: serverID,
                    backupName: backupName,
                    operationId: operationID,
                    observer: observer
                )
                return .success(())
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return BackupRestoreOperation(
            operationID: operationID,
            progress: pair.stream,
            task: task
        )
    }

    /// Restores a verified backup into a stopped server without observing progress.
    /// Prefer `restoreBackupWithProgress` for user initiated restores.
    public static func restoreBackup(serverID: String, backupName: String) async throws(CoreError) {
        try await detachedCall {
            try await MCVectorCore.restoreManagedBackup(serverId: serverID, backupName: backupName)
        }
    }

    /// Deletes an archive and receives the refreshed manifest list.
    public static func deleteBackup(serverID: String, backupName: String) async throws(CoreError) -> [BackupRecord] {
        try await detachedCall {
            try await MCVectorCore.deleteManagedBackup(serverId: serverID, backupName: backupName)
        }
    }

    /// Applies the configured count and age policy.
    public static func applyBackupRetention(
        serverID: String,
        retainCount: UInt32,
        retainDays: UInt32
    ) async throws(CoreError) -> BackupRetentionReport {
        try await detachedCall {
            try await MCVectorCore.applyManagedBackupRetention(
                serverId: serverID,
                retainCount: retainCount,
                retainDays: retainDays
            )
        }
    }

    /// Estimates duration from up to five usable recent backup records.
    public static func estimateBackupDuration(
        targetBytes: UInt64,
        history: [BackupRecord]
    ) -> BackupEstimate? {
        MCVectorCore.estimateBackupDuration(targetBytes: targetBytes, history: history)
    }

    /// Cancels an active manual or automatic backup at its next safe checkpoint.
    @discardableResult
    public static func cancelBackup(operationID: String) async -> Bool {
        await MCVectorCore.cancelBackup(operationId: operationID)
    }

    /// Starts one tick of the Native automatic-backup scheduler. The app calls
    /// this from its timer and keeps the returned stream in its runtime model.
    public static func tickAutomaticBackups() -> AutomaticBackupTick {
        let pair = AsyncStream<BackupProgressEvent>.makeStream(
            bufferingPolicy: .bufferingNewest(1)
        )
        let observer = BackupProgressForwarder(pair.continuation)
        let continuation = pair.continuation
        let task: Task<Result<[AutomaticBackupTickResult], CoreError>, Never> = Task.detached(priority: .userInitiated)
        {
            defer { continuation.finish() }
            do {
                return .success(try await MCVectorCore.tickAutomaticBackups(observer: observer))
            } catch {
                return .failure(CoreError.unexpected(error))
            }
        }
        return AutomaticBackupTick(progress: pair.stream, task: task)
    }
}

/// Feeds UniFFI callbacks into a bounded stream. Progress is an update of the
/// latest percentage, so retaining only the newest pending value is enough.
private final class BackupProgressForwarder: BackupProgressObserver {
    private let continuation: AsyncStream<BackupProgressEvent>.Continuation

    init(_ continuation: AsyncStream<BackupProgressEvent>.Continuation) {
        self.continuation = continuation
    }

    func onProgress(event: BackupProgressEvent) {
        continuation.yield(event)
    }
}
