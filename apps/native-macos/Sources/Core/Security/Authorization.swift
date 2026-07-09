import Foundation

/// Role-based authorization, ported from `security.rs`'s `authorize` and
/// `is_mutating_action`. Deliberately a free function, not a type -- the
/// Rust original is pure and stateless (no lock, no actor, no I/O), so a
/// Swift `actor` here would add isolation overhead with nothing to
/// protect. Compare with `RateLimiter`, which genuinely needs an actor
/// because it owns mutable shared state.
///
/// Not wired into any command or view model: this app has no
/// user/role/authentication concept yet. A future task connects this once
/// "current role" exists somewhere real.
public func authorize(role: Role, action: String) throws {
    let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedAction.isEmpty else {
        throw SecurityError.emptyAction
    }

    switch role {
    case .admin:
        return
    case .user:
        guard normalizedAction == "start_server" || normalizedAction == "stop_server" else {
            throw SecurityError.forbidden(role: role.rawName, action: normalizedAction)
        }
    case .viewer:
        guard !isMutatingAction(normalizedAction) else {
            throw SecurityError.forbidden(role: role.rawName, action: normalizedAction)
        }
    }
}

/// Whether `action` is treated as mutating (state-changing) rather than
/// read-only, matching Rust's `is_mutating_action`. An empty action is
/// conservatively treated as mutating -- `authorize` never reaches this
/// with an empty action itself (it rejects that earlier), but the
/// function is ported standalone for fidelity with the Rust source, which
/// exposes the same conservative default.
public func isMutatingAction(_ action: String) -> Bool {
    let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedAction.isEmpty else {
        return true
    }

    let isReadOnly = normalizedAction.hasPrefix("get_")
        || normalizedAction.hasPrefix("list_")
        || normalizedAction.hasPrefix("read_")
        || normalizedAction.hasPrefix("fetch_")
        || normalizedAction.hasPrefix("sanitize_")
        || normalizedAction == "authorize_action"
        || normalizedAction == "rate_limit_check"

    return !isReadOnly
}
