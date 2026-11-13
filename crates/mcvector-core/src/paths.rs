//! Shared application data root (DATA-001).
//!
//! The Tauri edition stores its data in Tauri's `app_data_dir`, which on every
//! desktop OS is `dirs::data_dir()` joined with the bundle identifier. The
//! Native edition has a different bundle identifier but must read and write the
//! same directory, so the Tauri identifier is pinned here as a constant.

use std::path::PathBuf;

/// Bundle identifier of the Tauri edition; the shared data root is named after it.
pub const SHARED_DATA_IDENTIFIER: &str = "com.tukuyomi032.mcvector";

/// Identifier of the Tauri debug build (`src-tauri/tauri.debug.conf.json`).
/// Debug builds of both editions share this data root so development never
/// touches the release data.
pub const DEBUG_DATA_IDENTIFIER: &str = "com.tukuyomi032.mcvector.debug";

/// Returns `<platform data dir>/com.tukuyomi032.mcvector`
/// (macOS: ~/Library/Application Support/com.tukuyomi032.mcvector). None if the platform data dir is unknown.
pub fn app_data_dir() -> Option<PathBuf> {
    data_dir_for(SHARED_DATA_IDENTIFIER)
}

/// Returns `<platform data dir>/<identifier>`, the same rule Tauri uses for
/// `app_data_dir`. Pass [`SHARED_DATA_IDENTIFIER`] or [`DEBUG_DATA_IDENTIFIER`].
pub fn data_dir_for(identifier: &str) -> Option<PathBuf> {
    dirs::data_dir().map(|dir| dir.join(identifier))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_data_dir_ends_with_shared_identifier() {
        let Some(path) = app_data_dir() else {
            eprintln!("platform data dir unknown; skipping");
            return;
        };

        assert!(
            path.ends_with(SHARED_DATA_IDENTIFIER),
            "expected {} to end with {SHARED_DATA_IDENTIFIER}",
            path.display()
        );
        assert_eq!(path.parent(), dirs::data_dir().as_deref());
    }

    #[test]
    fn debug_data_dir_is_a_sibling_of_the_release_root() {
        let (Some(release), Some(debug)) = (app_data_dir(), data_dir_for(DEBUG_DATA_IDENTIFIER))
        else {
            eprintln!("platform data dir unknown; skipping");
            return;
        };
        assert_ne!(release, debug);
        assert_eq!(release.parent(), debug.parent());
        assert!(debug.ends_with(DEBUG_DATA_IDENTIFIER));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn app_data_dir_lives_under_macos_application_support() {
        let Some(path) = app_data_dir() else {
            eprintln!("platform data dir unknown; skipping");
            return;
        };

        assert!(
            path.to_string_lossy()
                .contains("Library/Application Support"),
            "expected {} to contain Library/Application Support",
            path.display()
        );
    }
}
