import Foundation

/// Every failure mode of the `security.rs`-equivalent authorization/audit
/// layer, ported one case per Rust `Err(String)` value.
///
/// The Rust original returns a bare `String` for every error; this app's
/// standing "share nothing, port everything" rule means the *logic* is
/// re-implemented, not the Rust type. To keep the "仕様の一致率" (spec-match
/// fidelity) this port is reviewed against, `errorDescription` reproduces
/// the exact Rust wording for each case rather than a Swift-idiomatic
/// rephrasing -- callers (and this module's tests) can compare against the
/// Rust source string-for-string.
public enum SecurityError: Error, LocalizedError, Equatable, Sendable {
    /// `authorize`: `payload.action` was empty/whitespace-only.
    case emptyAction
    /// `Role::parse`: the raw string didn't match `admin`/`user`/`viewer`
    /// after trim + lowercase.
    case invalidRole(String)
    /// `authorize`: the role/action combination isn't permitted.
    case forbidden(role: String, action: String)
    /// `check_rate_limit`: `payload.userId` was empty/whitespace-only.
    case emptyUserId
    /// `check_rate_limit`: the state map is at `RATE_LIMIT_MAX_ENTRIES`
    /// and the caller isn't already a tracked user.
    case rateLimiterSaturated
    /// `check_rate_limit`: this user already has a call inside the
    /// current rate-limit window.
    case rateLimitExceeded(userId: String)
    /// `resolve_safe_path`: `payload.base` and/or `payload.input` was
    /// empty/whitespace-only.
    case emptyPathInputs
    /// `resolve_safe_path`: `payload.base` was not an absolute path.
    case baseMustBeAbsolute
    /// `resolve_safe_path`: `payload.input` attempted to escape `base`
    /// (absolute input, Windows drive-letter prefix, or a `.`/`..`
    /// component).
    case pathTraversalDetected
    /// `build_audit_entry`: `payload.user` and/or `payload.action` was
    /// empty/whitespace-only.
    case emptyAuditFields
    /// `build_audit_entry`: the system clock reported a time before the
    /// Unix epoch. Practically unreachable, ported only for parity with
    /// Rust's `SystemTime::now().duration_since(UNIX_EPOCH)` failure path.
    case auditTimestampCreationFailed

    public var errorDescription: String? {
        switch self {
        case .emptyAction:
            "security_gateway authorize_action requires non-empty payload.action"
        case .invalidRole:
            "security_gateway authorize_action requires payload.role as \"admin\"|\"user\"|\"viewer\""
        case let .forbidden(role, action):
            "Forbidden: role \(role) is not allowed to perform action \(action)"
        case .emptyUserId:
            "security_gateway rate_limit_check requires non-empty payload.userId"
        case .rateLimiterSaturated:
            "Forbidden: rate limit state is saturated"
        case let .rateLimitExceeded(userId):
            "Forbidden: rate limit exceeded for user \(userId)"
        case .emptyPathInputs:
            "security_gateway resolve_safe_path requires non-empty payload.base and payload.input"
        case .baseMustBeAbsolute:
            "security_gateway resolve_safe_path payload.base must be absolute"
        case .pathTraversalDetected:
            "Path traversal detected"
        case .emptyAuditFields:
            "security_gateway audit_log requires non-empty payload.user and payload.action"
        case .auditTimestampCreationFailed:
            "Failed to create audit timestamp"
        }
    }
}
