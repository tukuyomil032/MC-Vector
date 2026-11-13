//! Structured core errors (NAT-005 / API-003).
//!
//! Every failure surfaced by `mcvector-core` is a [`CoreError`]: a stable
//! [`CoreErrorCode`], a human-readable message, and a `retryable` flag. The
//! Swift UI localizes errors through [`CoreErrorCode::localization_key`], so
//! the code strings are a cross-language contract.
//!
//! Rules for this module:
//!
//! - Messages must never contain secrets, absolute local paths (for example
//!   `/Users/<name>/...`), or backtraces. Messages are plain English and may
//!   be shown to users or written to logs.
//! - Codes are `<domain>.<reason>` in snake_case.
//! - A new code must be added to the [`CoreErrorCode`] enum AND to
//!   [`CoreErrorCode::ALL`]. The unit tests fail if the two disagree.

use std::fmt;

/// Stable identifiers for every core failure. The string form (see
/// [`CoreErrorCode::as_str`]) is what crosses the FFI boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CoreErrorCode {
    /// Another MC-Vector instance holds the lock. Retryable once that app quits.
    LockHeldByOther,
    /// The lock file could not be opened or locked (for example, permissions).
    LockUnavailable,
    /// The platform application-data directory could not be resolved.
    PathAppDataUnavailable,
    /// The operation was cancelled by the caller.
    OperationCancelled,
    /// An unexpected failure with no more specific code.
    InternalUnknown,
    /// Data was requested before the core took the instance lock and opened the registry.
    CoreNotStarted,
    /// The server registry database could not be opened or migrated.
    RegistryOpenFailed,
    /// The server registry could not be read.
    RegistryReadFailed,
}

impl CoreErrorCode {
    /// Every variant, in declaration order.
    pub const ALL: &'static [CoreErrorCode] = &[
        CoreErrorCode::LockHeldByOther,
        CoreErrorCode::LockUnavailable,
        CoreErrorCode::PathAppDataUnavailable,
        CoreErrorCode::OperationCancelled,
        CoreErrorCode::InternalUnknown,
        CoreErrorCode::CoreNotStarted,
        CoreErrorCode::RegistryOpenFailed,
        CoreErrorCode::RegistryReadFailed,
    ];

    /// The stable `<domain>.<reason>` string for this code.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::LockHeldByOther => "lock.held_by_other",
            Self::LockUnavailable => "lock.unavailable",
            Self::PathAppDataUnavailable => "path.app_data_unavailable",
            Self::OperationCancelled => "operation.cancelled",
            Self::InternalUnknown => "internal.unknown",
            Self::CoreNotStarted => "core.not_started",
            Self::RegistryOpenFailed => "registry.open_failed",
            Self::RegistryReadFailed => "registry.read_failed",
        }
    }

    /// Inverse of [`CoreErrorCode::as_str`]. Returns `None` for unknown strings.
    pub fn parse(code: &str) -> Option<Self> {
        Self::ALL
            .iter()
            .copied()
            .find(|candidate| candidate.as_str() == code)
    }

    /// Whether a failure with this code is worth retrying without changes.
    pub const fn default_retryable(self) -> bool {
        match self {
            Self::LockHeldByOther | Self::CoreNotStarted | Self::RegistryReadFailed => true,
            Self::LockUnavailable
            | Self::PathAppDataUnavailable
            | Self::OperationCancelled
            | Self::InternalUnknown
            | Self::RegistryOpenFailed => false,
        }
    }

    /// Localization key used by the Swift UI, for example
    /// `error.lock.held_by_other`.
    pub fn localization_key(self) -> String {
        format!("error.{}", self.as_str())
    }
}

impl fmt::Display for CoreErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A core failure: a code, a plain-English message, and a retry hint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoreError {
    pub code: CoreErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl CoreError {
    /// Creates an error whose `retryable` flag comes from the code's default.
    pub fn new(code: CoreErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retryable: code.default_retryable(),
        }
    }

    /// Overrides the retry hint for this specific failure.
    pub fn with_retryable(self, retryable: bool) -> Self {
        Self { retryable, ..self }
    }

    /// The error used when an operation is cancelled.
    pub fn cancelled() -> Self {
        Self::new(CoreErrorCode::OperationCancelled, "Operation cancelled.")
    }

    /// An unexpected failure with the `internal.unknown` code.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(CoreErrorCode::InternalUnknown, message)
    }
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CoreError {}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exhaustive on purpose: adding a variant fails to compile here until it
    /// is given an index. The test below then also requires `ALL` to contain it.
    const fn ordinal(code: CoreErrorCode) -> usize {
        match code {
            CoreErrorCode::LockHeldByOther => 0,
            CoreErrorCode::LockUnavailable => 1,
            CoreErrorCode::PathAppDataUnavailable => 2,
            CoreErrorCode::OperationCancelled => 3,
            CoreErrorCode::InternalUnknown => 4,
            CoreErrorCode::CoreNotStarted => 5,
            CoreErrorCode::RegistryOpenFailed => 6,
            CoreErrorCode::RegistryReadFailed => 7,
        }
    }

    const VARIANT_COUNT: usize = 8;

    /// Checks `^[a-z]+(_[a-z]+)*\.[a-z]+(_[a-z]+)*$` without a regex crate.
    fn is_valid_code_string(s: &str) -> bool {
        let Some((domain, reason)) = s.split_once('.') else {
            return false;
        };
        is_snake_segment(domain) && is_snake_segment(reason)
    }

    /// Matches `[a-z]+(_[a-z]+)*`: non-empty lowercase words joined by single underscores.
    fn is_snake_segment(s: &str) -> bool {
        s.split('_')
            .all(|word| !word.is_empty() && word.chars().all(|c| c.is_ascii_lowercase()))
    }

    #[test]
    fn code_strings_match_naming_rule() {
        for code in CoreErrorCode::ALL {
            let s = code.as_str();
            assert!(is_valid_code_string(s), "invalid code string: {s}");
        }
        assert!(!is_valid_code_string("lock"));
        assert!(!is_valid_code_string("Lock.held"));
        assert!(!is_valid_code_string("lock..held"));
        assert!(!is_valid_code_string("lock.held_"));
        assert!(!is_valid_code_string("lock.held.more"));
    }

    #[test]
    fn code_strings_and_retry_defaults_match_contract() {
        let expected = [
            (CoreErrorCode::LockHeldByOther, "lock.held_by_other", true),
            (CoreErrorCode::LockUnavailable, "lock.unavailable", false),
            (
                CoreErrorCode::PathAppDataUnavailable,
                "path.app_data_unavailable",
                false,
            ),
            (
                CoreErrorCode::OperationCancelled,
                "operation.cancelled",
                false,
            ),
            (CoreErrorCode::InternalUnknown, "internal.unknown", false),
            (CoreErrorCode::CoreNotStarted, "core.not_started", true),
            (CoreErrorCode::RegistryOpenFailed, "registry.open_failed", false),
            (CoreErrorCode::RegistryReadFailed, "registry.read_failed", true),
        ];
        for (code, wire, retryable) in expected {
            assert_eq!(code.as_str(), wire);
            assert_eq!(code.default_retryable(), retryable, "{wire}");
        }
    }

    #[test]
    fn all_lists_every_variant_exactly_once() {
        assert_eq!(CoreErrorCode::ALL.len(), VARIANT_COUNT);

        let mut seen = [0usize; VARIANT_COUNT];
        for code in CoreErrorCode::ALL {
            seen[ordinal(*code)] += 1;
        }
        assert!(seen.iter().all(|&count| count == 1), "counts: {seen:?}");
    }

    #[test]
    fn parse_is_inverse_of_as_str() {
        for code in CoreErrorCode::ALL {
            assert_eq!(CoreErrorCode::parse(code.as_str()), Some(*code));
        }
        assert_eq!(CoreErrorCode::parse("lock.unknown"), None);
        assert_eq!(CoreErrorCode::parse(""), None);
    }

    #[test]
    fn new_uses_default_retryable() {
        for code in CoreErrorCode::ALL {
            let error = CoreError::new(*code, "message");
            assert_eq!(error.code, *code);
            assert_eq!(error.retryable, code.default_retryable());
        }
    }

    #[test]
    fn with_retryable_overrides_default() {
        let error = CoreError::new(CoreErrorCode::LockHeldByOther, "held").with_retryable(false);
        assert!(!error.retryable);
        assert_eq!(error.code, CoreErrorCode::LockHeldByOther);

        let error = CoreError::new(CoreErrorCode::InternalUnknown, "boom").with_retryable(true);
        assert!(error.retryable);
    }

    #[test]
    fn cancelled_has_operation_cancelled_code() {
        let error = CoreError::cancelled();
        assert_eq!(error.code, CoreErrorCode::OperationCancelled);
        assert_eq!(error.message, "Operation cancelled.");
        assert!(!error.retryable);
    }

    #[test]
    fn internal_has_internal_unknown_code() {
        let error = CoreError::internal("unexpected state");
        assert_eq!(error.code, CoreErrorCode::InternalUnknown);
        assert_eq!(error.message, "unexpected state");
        assert!(!error.retryable);
    }

    #[test]
    fn display_formats_code_and_message() {
        let error = CoreError::new(
            CoreErrorCode::LockHeldByOther,
            "Another instance is running.",
        );
        assert_eq!(
            error.to_string(),
            "lock.held_by_other: Another instance is running."
        );
        assert_eq!(
            CoreErrorCode::InternalUnknown.to_string(),
            "internal.unknown"
        );
    }

    #[test]
    fn localization_key_prefixes_error() {
        assert_eq!(
            CoreErrorCode::LockHeldByOther.localization_key(),
            "error.lock.held_by_other"
        );
        for code in CoreErrorCode::ALL {
            assert_eq!(code.localization_key(), format!("error.{}", code.as_str()));
        }
    }

    #[test]
    fn core_error_implements_std_error() {
        fn assert_error<E: std::error::Error>(_: &E) {}
        assert_error(&CoreError::cancelled());
    }
}
