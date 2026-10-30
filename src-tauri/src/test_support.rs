//! Shared helpers for unit tests.

use std::path::PathBuf;

/// Returns a test scratch root under `<crate>/target/<name>`.
///
/// The root is derived from the compile-time `CARGO_MANIFEST_DIR` instead of
/// `std::env::temp_dir()`, so static analysis (CodeQL `rust/path-injection`)
/// does not treat it as an uncontrolled, environment-derived path. Callers
/// should append a unique per-test component before creating directories.
pub(crate) fn test_temp_dir(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join(name)
}
