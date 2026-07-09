import Foundation

/// The three authorization roles from `security.rs`'s `Role` enum.
///
/// This app has no login screen, session, or "current user" concept yet
/// (see the Phase 3-B task note for this file's introduction) -- `Role` is
/// deliberately not wired into any view model or command today. It exists
/// so a future task can gate real actions once the app knows who's asking.
public enum Role: Sendable, Equatable {
    case admin
    case user
    case viewer

    /// The wire/log-facing name for this role, matching Rust's
    /// `Role::as_str`. Used inside `SecurityError.forbidden` messages.
    var rawName: String {
        switch self {
        case .admin: "admin"
        case .user: "user"
        case .viewer: "viewer"
        }
    }

    /// Parses a free-form role string the same way Rust's `Role::parse`
    /// does: trim whitespace, lowercase, then exact-match against the
    /// three known role names. Deliberately not `init?(rawValue:)` --
    /// that would require the caller to already have normalized input,
    /// whereas Rust's `authorize_action` payload is untrusted raw text.
    public static func parse(_ value: String) throws -> Role {
        switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "admin": .admin
        case "user": .user
        case "viewer": .viewer
        default: throw SecurityError.invalidRole(value)
        }
    }
}
