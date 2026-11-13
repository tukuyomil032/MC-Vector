//! Cross-edition instance guard (NAT-010 / DATA-007).
//!
//! The Tauri and Native editions share one data directory, so only one of them
//! may run at a time. The lock is taken in `run()` before the Tauri runtime and
//! its plugins start, so a refused launch never touches the registry, config,
//! or Keychain.
//!
//! A second launch of the Tauri edition itself is still handled by
//! tauri-plugin-single-instance, which focuses the running window.

use mcvector_core::instance_lock::{self, Edition, InstanceLock, LockOutcome, LockOwner};
use mcvector_core::paths;

#[cfg(target_os = "macos")]
const NATIVE_BUNDLE_ID: &str = "com.tukuyomi032.mcvector.native";

/// Takes the instance lock in `<data dir>/<identifier>`, or exits the process
/// when another edition owns that data directory.
///
/// `identifier` is this build's Tauri identifier: the release build uses the
/// shared root, the debug build its own `.debug` root.
///
/// Returns `None` when this launch should continue without holding the lock:
/// another Tauri instance owns it (the single-instance plugin then hands off
/// to it), or the platform data directory is unknown.
pub fn acquire_or_exit(identifier: &str) -> Option<InstanceLock> {
    let Some(dir) = paths::data_dir_for(identifier) else {
        // The log plugin is not running yet, so write to stderr.
        eprintln!("platform data directory is unknown; skipping the instance lock");
        return None;
    };
    let bundle_path = std::env::current_exe()
        .map(|path| path.display().to_string())
        .unwrap_or_default();
    let owner = LockOwner::current(Edition::Tauri, identifier, bundle_path);

    match instance_lock::acquire(&dir, &owner) {
        Ok(LockOutcome::Acquired(lock)) => Some(lock),
        Ok(LockOutcome::HeldByOther(Some(other))) if other.edition == Edition::Tauri => None,
        Ok(LockOutcome::HeldByOther(other)) => handle_held_by_other(&dir, other.as_ref()),
        Err(error) => {
            // Fail closed: running without the lock could let both editions
            // write the same data.
            report_lock_failure(&dir, &error.to_string());
            std::process::exit(1);
        }
    }
}

#[cfg(target_os = "macos")]
fn handle_held_by_other(dir: &std::path::Path, owner: Option<&LockOwner>) -> Option<InstanceLock> {
    // On macOS the metadata is readable, so an unknown owner means it is
    // corrupt or still being written. Refuse rather than risk two editions.
    show_other_edition_dialog(dir, owner);
    std::process::exit(0);
}

#[cfg(not(target_os = "macos"))]
fn handle_held_by_other(
    _dir: &std::path::Path,
    _owner: Option<&LockOwner>,
) -> Option<InstanceLock> {
    // Windows locks are mandatory, so the owner can never be read there, and
    // the Native edition only exists on macOS: the holder is another Tauri
    // instance. Let the single-instance plugin focus it.
    None
}

/// True when the shared config asks for Japanese. Read-only, and only used
/// for the dialogs shown before the Tauri runtime starts.
fn prefers_japanese(dir: &std::path::Path) -> bool {
    std::fs::read(dir.join("config.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .and_then(|config| config.get("locale")?.as_str().map(|s| s.starts_with("ja")))
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn show_other_edition_dialog(dir: &std::path::Path, owner: Option<&LockOwner>) {
    let japanese = prefers_japanese(dir);
    let native_running = owner.is_some_and(|o| o.edition == Edition::Native);

    let (description, show_label, quit_label) = match (japanese, native_running) {
        (true, true) => (
            "MC-Vector（ネイティブ版）が起動中です。\n同じサーバーとデータを使うため、同時には起動できません。",
            "ネイティブ版を表示",
            "終了",
        ),
        (true, false) => (
            "別の MC-Vector が起動中です。\n同じサーバーとデータを使うため、同時には起動できません。",
            "起動中の MC-Vector を表示",
            "終了",
        ),
        (false, true) => (
            "MC-Vector (Native edition) is already running.\nSince they use the same server and data, they cannot be running at the same time.",
            "Show Native Edition",
            "Quit",
        ),
        (false, false) => (
            "Another MC-Vector is already running.\nSince they use the same servers and data, only one can run at a time.",
            "Show Running MC-Vector",
            "Quit",
        ),
    };

    let result = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Warning)
        .set_title("MC-Vector")
        .set_description(description)
        .set_buttons(rfd::MessageButtons::OkCancelCustom(
            show_label.to_string(),
            quit_label.to_string(),
        ))
        .show();

    if matches!(&result, rfd::MessageDialogResult::Custom(label) if label == show_label) {
        let bundle_id = owner
            .map(|o| o.bundle_id.as_str())
            .filter(|id| !id.is_empty())
            .unwrap_or(NATIVE_BUNDLE_ID);
        if let Err(error) = std::process::Command::new("open")
            .args(["-b", bundle_id])
            .status()
        {
            eprintln!("failed to activate the running MC-Vector: {error}");
        }
    }
}

fn report_lock_failure(dir: &std::path::Path, error: &str) {
    let japanese = prefers_japanese(dir);
    let message = if japanese {
        format!("MC-Vector の起動を確認できませんでした（{error}）。\nデータフォルダーの権限を確認してから、もう一度起動してください。")
    } else {
        format!("MC-Vector could not verify that no other edition is running ({error}).\nCheck the permissions of the data folder, then launch again.")
    };
    eprintln!("{message}");

    #[cfg(target_os = "macos")]
    {
        rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Error)
            .set_title("MC-Vector")
            .set_description(&message)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
    }
}

/// Logs a warning when Tauri's own data directory differs from the root that
/// mcvector-core computes for the same identifier (DATA-001). A mismatch would
/// mean the Native edition reads a different directory than this build.
pub fn verify_shared_data_dir(identifier: &str, tauri_app_data_dir: &std::path::Path) {
    match paths::data_dir_for(identifier) {
        Some(shared) if shared == tauri_app_data_dir => {}
        Some(shared) => log::warn!(
            "Tauri app_data_dir differs from the shared data root (tauri: {}, shared: {})",
            tauri_app_data_dir.display(),
            shared.display()
        ),
        None => log::warn!("shared data root is unknown on this platform"),
    }
}
