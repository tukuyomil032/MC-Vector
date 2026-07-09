import Foundation
import Testing
@testable import Core

// Faithful, one-test-per-Rust-test port of `security.rs`'s unit tests (see
// Task 3-11). Each Swift test below names, in its doc comment, the exact
// Rust test it corresponds to. The four `ipc_contract_*` tests per Rust
// group tested an IPC dispatcher envelope that doesn't exist in this
// Swift app (there is no IPC layer here) -- those are ported as direct
// tests of the underlying function they exercised in Rust, per this
// task's scope note.
//
// Error-message assertions compare against `SecurityError.errorDescription`
// verbatim against the Rust source's string literals -- this is the
// "仕様の一致率" (spec-match fidelity) this port is reviewed against.

// MARK: - authorize

/// Ports: `admin_can_execute_any_action`.
@Test("admin can execute any action")
func adminCanExecuteAnyAction() throws {
    try authorize(role: .admin, action: "delete_world")
}

/// Ports: `user_can_start_and_stop_only`.
@Test("user can only start_server and stop_server")
func userCanStartAndStopOnly() throws {
    try authorize(role: .user, action: "start_server")
    try authorize(role: .user, action: "stop_server")

    do {
        try authorize(role: .user, action: "delete_world")
        Issue.record("expected authorize to throw for role=user action=delete_world")
    } catch let error as SecurityError {
        #expect(error.errorDescription == "Forbidden: role user is not allowed to perform action delete_world")
    }
}

/// Ports: `viewer_can_read_non_mutating_action`.
@Test("viewer can perform non-mutating (read) actions")
func viewerCanReadNonMutatingAction() throws {
    try authorize(role: .viewer, action: "get_server_status")
}

/// Ports: `viewer_is_forbidden_for_mutating_action`.
@Test("viewer is forbidden from mutating actions")
func viewerIsForbiddenForMutatingAction() throws {
    do {
        try authorize(role: .viewer, action: "start_server")
        Issue.record("expected authorize to throw for role=viewer action=start_server")
    } catch let error as SecurityError {
        #expect(error.errorDescription == "Forbidden: role viewer is not allowed to perform action start_server")
    }
}

/// Ports: `ipc_contract_authorize_action_response_shape`, adapted to test
/// `authorize` directly (no IPC dispatcher exists in this app) -- success
/// here *is* "allowed", there's no separate envelope to shape-check.
@Test("authorize succeeds (represents \"allowed\") for a role/action the role permits")
func authorizeSucceedsRepresentsAllowed() throws {
    try authorize(role: .user, action: "start_server")
}

/// Ports: `ipc_contract_authorize_action_missing_fields_error`, adapted to
/// test that an empty/whitespace-only `action` throws the exact Rust
/// error message (there's no payload/missing-field envelope in Swift --
/// the equivalent "missing field" here is an empty `action` string).
@Test("authorize throws the exact empty-action error for empty and whitespace-only action")
func authorizeEmptyActionThrowsExactMessage() throws {
    for emptyAction in ["", "   "] {
        do {
            try authorize(role: .admin, action: emptyAction)
            Issue.record("expected authorize to throw for action=\"\(emptyAction)\"")
        } catch let error as SecurityError {
            #expect(error.errorDescription == "security_gateway authorize_action requires non-empty payload.action")
        }
    }
}

// MARK: - check_rate_limit (RateLimiter)

/// Ports: `rate_limit_blocks_rapid_repeated_calls`.
@Test("rate limit blocks a second call from the same user inside the window")
func rateLimitBlocksRapidRepeatedCalls() async throws {
    let limiter = RateLimiter()
    let start = ContinuousClock.now

    try await limiter.checkRateLimit(userId: "user-1", now: start)

    do {
        try await limiter.checkRateLimit(userId: "user-1", now: start + RateLimiter.rateLimitWindow - .milliseconds(1))
        Issue.record("expected checkRateLimit to throw for a repeated call inside the window")
    } catch let error as SecurityError {
        #expect(error.errorDescription == "Forbidden: rate limit exceeded for user user-1")
    }
}

/// Ports: `rate_limit_allows_after_window`.
@Test("rate limit allows a second call from the same user once the window elapses")
func rateLimitAllowsAfterWindow() async throws {
    let limiter = RateLimiter()
    let start = ContinuousClock.now

    try await limiter.checkRateLimit(userId: "user-1", now: start)
    try await limiter.checkRateLimit(userId: "user-1", now: start + RateLimiter.rateLimitWindow)
}

/// Ports: `rate_limit_prunes_expired_entries`.
@Test("rate limit prunes expired entries and still allows a fresh user")
func rateLimitPrunesExpiredEntries() async throws {
    let limiter = RateLimiter()
    let start = ContinuousClock.now
    let staleInstant = start - (RateLimiter.rateLimitWindow + .milliseconds(10))

    try await limiter.checkRateLimit(userId: "stale-user", now: staleInstant)
    try await limiter.checkRateLimit(userId: "fresh-user", now: start)

    let trackedUserIds = await limiter.trackedUserIds()
    #expect(trackedUserIds == ["fresh-user"])
}

/// Ports: `ipc_contract_rate_limit_check_response_shape`, adapted to test
/// `RateLimiter.checkRateLimit` directly for a fresh, unique user id.
@Test("rate limit check succeeds for a fresh, unique user id")
func rateLimitCheckSucceedsForFreshUser() async throws {
    let limiter = RateLimiter()
    try await limiter.checkRateLimit(userId: "unique-user-\(UUID().uuidString)")
}

/// Ports: `ipc_contract_rate_limit_check_missing_field_error`, adapted to
/// test that an empty/whitespace-only `userId` throws the exact Rust
/// error message.
@Test("rate limit check throws the exact empty-userId error for empty and whitespace-only userId")
func rateLimitCheckEmptyUserIdThrowsExactMessage() async throws {
    let limiter = RateLimiter()
    for emptyUserId in ["", "   "] {
        do {
            try await limiter.checkRateLimit(userId: emptyUserId)
            Issue.record("expected checkRateLimit to throw for userId=\"\(emptyUserId)\"")
        } catch let error as SecurityError {
            #expect(error.errorDescription == "security_gateway rate_limit_check requires non-empty payload.userId")
        }
    }
}

// MARK: - resolve_safe_path

/// Base directory shared by the `resolveSafePath` tests, mirroring the
/// Rust tests' `<tmp>/mc-vector-security/app-data`. Computed once per
/// call (not written to disk -- `resolveSafePath` is a pure string
/// operation and never touches the filesystem) with any trailing slash
/// stripped so assertions can predictably concatenate `"/"` themselves.
private func safePathTestBase() -> String {
    var base = FileManager.default.temporaryDirectory
        .appendingPathComponent("mc-vector-security", isDirectory: true)
        .appendingPathComponent("app-data", isDirectory: true)
        .path
    if base.hasSuffix("/") {
        base.removeLast()
    }
    return base
}

/// Ports: `resolve_safe_path_rejects_traversal`.
@Test("resolve safe path rejects a traversal attempt")
func resolveSafePathRejectsTraversal() throws {
    let base = safePathTestBase()

    do {
        _ = try resolveSafePath(base: base, input: "../etc/passwd")
        Issue.record("expected resolveSafePath to throw for a traversal input")
    } catch let error as SecurityError {
        #expect(error.errorDescription == "Path traversal detected")
    }
}

/// Ports: `resolve_safe_path_builds_absolute_path`.
@Test("resolve safe path builds base joined with input")
func resolveSafePathBuildsAbsolutePath() throws {
    let base = safePathTestBase()

    let resolved = try resolveSafePath(base: base, input: "servers/a")

    #expect(resolved == base + "/servers/a")
}

/// Ports: `resolve_safe_path_rejects_windows_drive_relative_prefix`. This
/// must reject regardless of host OS -- it's the Rust original's
/// defensive byte-level check, exercised here on macOS deliberately.
@Test("resolve safe path rejects a Windows drive-relative prefix even on non-Windows hosts")
func resolveSafePathRejectsWindowsDriveRelativePrefix() throws {
    let base = safePathTestBase()

    do {
        _ = try resolveSafePath(base: base, input: "C:windows\\temp")
        Issue.record("expected resolveSafePath to throw for a drive-relative prefix input")
    } catch let error as SecurityError {
        #expect(error.errorDescription == "Path traversal detected")
    }
}

/// Ports: `ipc_contract_resolve_safe_path_response_shape`, adapted to
/// test `resolveSafePath` directly: the resolved path equals
/// `base/servers/a`, with no IPC envelope to shape-check.
@Test("resolve safe path succeeds and the resolved path matches base/input")
func resolveSafePathSucceedsAndMatchesJoin() throws {
    let base = safePathTestBase()

    let resolved = try resolveSafePath(base: base, input: "servers/a")

    #expect(resolved == base + "/servers/a")
}

/// Ports: `ipc_contract_resolve_safe_path_missing_fields_error`, adapted
/// to test that an empty/whitespace-only `base` or `input` throws the
/// exact Rust error message, in both directions.
@Test("resolve safe path throws the exact empty-fields error for empty/whitespace base or input")
func resolveSafePathEmptyFieldsThrowsExactMessage() throws {
    let base = safePathTestBase()
    let expectedMessage = "security_gateway resolve_safe_path requires non-empty payload.base and payload.input"

    for emptyBase in ["", "   "] {
        do {
            _ = try resolveSafePath(base: emptyBase, input: "servers/a")
            Issue.record("expected resolveSafePath to throw for base=\"\(emptyBase)\"")
        } catch let error as SecurityError {
            #expect(error.errorDescription == expectedMessage)
        }
    }

    for emptyInput in ["", "   "] {
        do {
            _ = try resolveSafePath(base: base, input: emptyInput)
            Issue.record("expected resolveSafePath to throw for input=\"\(emptyInput)\"")
        } catch let error as SecurityError {
            #expect(error.errorDescription == expectedMessage)
        }
    }
}

// MARK: - build_audit_entry

/// Ports: `build_audit_entry_contains_required_fields`.
@Test("build audit entry contains user, action, and a retrievable timestamp")
func buildAuditEntryContainsRequiredFields() throws {
    let entry = try buildAuditEntry(user: "user-1", action: "start_server")

    #expect(entry.user == "user-1")
    #expect(entry.action == "start_server")
    #expect(entry.timestamp > 0)
}

/// Ports: `ipc_contract_audit_log_response_shape`, adapted to test
/// `buildAuditEntry` directly: the returned fields match the inputs,
/// with no IPC envelope to shape-check.
@Test("build audit entry succeeds with fields matching the inputs")
func auditLogSucceedsWithMatchingFields() throws {
    let entry = try buildAuditEntry(user: "audit-user", action: "read_logs")

    #expect(entry.user == "audit-user")
    #expect(entry.action == "read_logs")
}

/// Ports: `ipc_contract_audit_log_missing_fields_error`, adapted to test
/// that an empty/whitespace-only `user` or `action` throws the exact
/// Rust error message, in both directions.
@Test("build audit entry throws the exact empty-fields error for empty/whitespace user or action")
func auditLogEmptyFieldsThrowsExactMessage() throws {
    let expectedMessage = "security_gateway audit_log requires non-empty payload.user and payload.action"

    for emptyUser in ["", "   "] {
        do {
            _ = try buildAuditEntry(user: emptyUser, action: "read_logs")
            Issue.record("expected buildAuditEntry to throw for user=\"\(emptyUser)\"")
        } catch let error as SecurityError {
            #expect(error.errorDescription == expectedMessage)
        }
    }

    for emptyAction in ["", "   "] {
        do {
            _ = try buildAuditEntry(user: "audit-user", action: emptyAction)
            Issue.record("expected buildAuditEntry to throw for action=\"\(emptyAction)\"")
        } catch let error as SecurityError {
            #expect(error.errorDescription == expectedMessage)
        }
    }
}
