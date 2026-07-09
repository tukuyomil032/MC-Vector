import Foundation
import os

/// A single audit-log record, ported from `security.rs`'s
/// `build_audit_entry` JSON shape (`{"user", "action", "timestamp"}`).
/// `timestamp` is whole seconds since the Unix epoch, matching Rust's
/// `SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()`.
public struct AuditEntry: Sendable, Equatable {
    public let user: String
    public let action: String
    public let timestamp: UInt64
}

/// Builds (and logs) an audit entry for `user` performing `action`.
///
/// `now` defaults to the real wall clock but is an explicit parameter --
/// unlike `RateLimiter`'s elapsed-time comparisons, this doesn't need
/// `ContinuousClock` (which has no fixed epoch); it needs a `Date` to
/// convert to seconds-since-epoch, so tests can assert on a specific
/// `timestamp` without depending on wall-clock timing.
public func buildAuditEntry(user: String, action: String, now: Date = Date()) throws -> AuditEntry {
    let normalizedUser = user.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedUser.isEmpty, !normalizedAction.isEmpty else {
        throw SecurityError.emptyAuditFields
    }

    let secondsSinceEpoch = now.timeIntervalSince1970
    guard secondsSinceEpoch >= 0 else {
        throw SecurityError.auditTimestampCreationFailed
    }
    let timestamp = UInt64(secondsSinceEpoch)

    AuditLogger.logEntry(user: normalizedUser, action: normalizedAction, timestamp: timestamp)

    return AuditEntry(user: normalizedUser, action: normalizedAction, timestamp: timestamp)
}

/// Minimal `os.Logger` side effect mirroring Rust's
/// `log::info!(target: "security.audit", ...)` call. Kept to a single
/// log line with no additional behavior -- this isn't a logging
/// subsystem, just parity with the one line Rust emits.
private enum AuditLogger {
    private static let logger = Logger(subsystem: "com.mc-vector.native", category: "security.audit")

    static func logEntry(user: String, action: String, timestamp: UInt64) {
        let message = "[AUDIT] user=\(user) action=\(action) timestamp=\(timestamp)"
        self.logger.info("\(message, privacy: .public)")
    }
}
