//! Cross-edition instance lock (NAT-010 / DATA-007).
//!
//! The Tauri and Native editions share one data directory, so they must never
//! run at the same time. Each edition takes an exclusive advisory lock on
//! `<dir>/.mcvector-instance.lock` and records its owner in the adjacent
//! `instance-lock.owner.json` file. The OS releases the lock when the holding
//! process dies. The next owner replaces any stale metadata after acquiring the
//! lock, and the lock file itself is never deleted.

use std::fs::{File, OpenOptions, TryLockError};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const INSTANCE_LOCK_FILE: &str = ".mcvector-instance.lock";
pub const INSTANCE_LOCK_OWNER_FILE: &str = "instance-lock.owner.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edition {
    Tauri,
    Native,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockOwner {
    pub edition: Edition,
    pub pid: u32,
    pub bundle_id: String,
    pub bundle_path: String,
    pub started_at_ms: u64, // unix epoch milliseconds
}

impl LockOwner {
    /// Fills pid = std::process::id() and started_at_ms = now.
    pub fn current(
        edition: Edition,
        bundle_id: impl Into<String>,
        bundle_path: impl Into<String>,
    ) -> Self {
        Self {
            edition,
            pid: std::process::id(),
            bundle_id: bundle_id.into(),
            bundle_path: bundle_path.into(),
            started_at_ms: now_unix_ms(),
        }
    }
}

fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|elapsed| u64::try_from(elapsed.as_millis()).ok())
        .unwrap_or(0)
}

/// Holds the lock for as long as it is alive; dropping it releases the lock.
#[derive(Debug)]
pub struct InstanceLock {
    // Kept only so the advisory lock lives as long as this value; dropping the
    // File closes the descriptor and releases the lock. Drop removes owner
    // metadata before this field is closed.
    #[allow(dead_code)]
    file: File,
    path: PathBuf,
    owner_path: PathBuf,
}

impl InstanceLock {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[derive(Debug)]
pub enum LockOutcome {
    Acquired(InstanceLock),
    /// Another process holds the lock. Owner is None when the metadata could not be read or parsed
    /// (or on an older Windows build, where metadata was stored in the locked file).
    HeldByOther(Option<LockOwner>),
}

/// Lock `<dir>/.mcvector-instance.lock`, creating `dir` if needed.
pub fn acquire(dir: &Path, owner: &LockOwner) -> std::io::Result<LockOutcome> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(INSTANCE_LOCK_FILE);

    // Never truncate on open: truncating before the lock is held would erase
    // the metadata of whichever edition currently owns it.
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)?;

    match file.try_lock() {
        Ok(()) => {
            // A lock file written by an older build may still contain JSON.
            // Clear it only after owning the lock so compatibility readers can
            // never mistake that old owner for a current one after Drop.
            file.set_len(0)?;
            file.sync_all()?;

            let owner_path = owner_path(&path);
            write_owner(&owner_path, owner)?;
            Ok(LockOutcome::Acquired(InstanceLock {
                file,
                path,
                owner_path,
            }))
        }
        Err(TryLockError::WouldBlock) => Ok(LockOutcome::HeldByOther(read_owner(&path))),
        Err(TryLockError::Error(err)) => Err(err),
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        // Drop runs before the File field is closed, so a new owner cannot
        // replace this metadata until the current owner has removed it.
        let _ = std::fs::remove_file(&self.owner_path);
    }
}

fn read_owner(path: &Path) -> Option<LockOwner> {
    match std::fs::read(owner_path(path)) {
        Ok(bytes) => serde_json::from_slice(&bytes).ok(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => read_legacy_owner(path),
        Err(_) => None,
    }
}

fn owner_path(lock_path: &Path) -> PathBuf {
    lock_path.with_file_name(INSTANCE_LOCK_OWNER_FILE)
}

fn read_legacy_owner(path: &Path) -> Option<LockOwner> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let bytes = std::fs::read(path).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = path;
        None
    }
}

fn write_owner(path: &Path, owner: &LockOwner) -> std::io::Result<()> {
    let payload = serde_json::to_vec(owner).map_err(std::io::Error::other)?;
    let temporary_path = path.with_file_name(format!(
        ".{INSTANCE_LOCK_OWNER_FILE}.tmp-{}",
        Uuid::new_v4()
    ));

    let result = (|| {
        let mut temporary_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)?;
        temporary_file.write_all(&payload)?;
        temporary_file.flush()?;
        temporary_file.sync_all()?;
        drop(temporary_file);

        // The temporary file is a sibling of the destination, so rename
        // atomically replaces stale metadata on the same filesystem.
        atomic_replace_file(&temporary_path, path)
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result
}

#[cfg(not(windows))]
fn atomic_replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::rename(source, destination)
}

#[cfg(windows)]
fn atomic_replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x0000_0001;

    #[link(name = "Kernel32")]
    extern "system" {
        #[link_name = "MoveFileExW"]
        fn move_file_ex_w(existing: *const u16, new: *const u16, flags: u32) -> i32;
    }

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();

    // Both paths share a parent, so this stays on the same volume and performs
    // a replacement rename without opening a gap at the destination.
    let succeeded = unsafe {
        move_file_ex_w(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING,
        )
    };
    if succeeded == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_owner(edition: Edition) -> LockOwner {
        LockOwner {
            edition,
            pid: 4242,
            bundle_id: "com.example.mcvector".to_string(),
            bundle_path: "/Applications/MC-Vector.app".to_string(),
            started_at_ms: 1_700_000_000_000,
        }
    }

    fn expect_acquired(outcome: LockOutcome) -> InstanceLock {
        match outcome {
            LockOutcome::Acquired(lock) => lock,
            other => panic!("expected Acquired, got {other:?}"),
        }
    }

    #[test]
    fn acquire_in_empty_dir_writes_owner_metadata() {
        let dir = tempdir().unwrap();
        let owner = sample_owner(Edition::Native);

        let lock = expect_acquired(acquire(dir.path(), &owner).unwrap());
        assert_eq!(lock.path(), dir.path().join(INSTANCE_LOCK_FILE).as_path());

        let owner_path = dir.path().join(INSTANCE_LOCK_OWNER_FILE);
        assert_eq!(
            std::fs::metadata(lock.path()).unwrap().len(),
            0,
            "the lock file must not hold owner metadata"
        );
        let raw = std::fs::read_to_string(owner_path).unwrap();
        let parsed: LockOwner = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed, owner);

        let json: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(json["edition"], "native");
        assert_eq!(json["bundleId"], "com.example.mcvector");
        assert_eq!(json["bundlePath"], "/Applications/MC-Vector.app");
        assert_eq!(json["pid"], 4242);
        assert_eq!(json["startedAtMs"], 1_700_000_000_000_u64);
    }

    #[test]
    fn second_acquire_while_held_reports_first_owner() {
        let dir = tempdir().unwrap();
        let first_owner = sample_owner(Edition::Tauri);
        let _first = expect_acquired(acquire(dir.path(), &first_owner).unwrap());

        match acquire(dir.path(), &sample_owner(Edition::Native)).unwrap() {
            LockOutcome::HeldByOther(owner) => assert_eq!(owner, Some(first_owner)),
            other => panic!("expected HeldByOther, got {other:?}"),
        }
    }

    #[test]
    fn acquire_replaces_stale_owner_metadata_while_holding_the_lock() {
        let dir = tempdir().unwrap();
        let stale_owner = sample_owner(Edition::Tauri);
        let current_owner = sample_owner(Edition::Native);
        let owner_path = dir.path().join(INSTANCE_LOCK_OWNER_FILE);
        std::fs::write(&owner_path, serde_json::to_vec(&stale_owner).unwrap()).unwrap();

        let lock = expect_acquired(acquire(dir.path(), &current_owner).unwrap());
        assert_eq!(lock.path(), dir.path().join(INSTANCE_LOCK_FILE).as_path());
        let parsed: LockOwner =
            serde_json::from_slice(&std::fs::read(owner_path).unwrap()).unwrap();
        assert_eq!(parsed, current_owner);
    }

    #[test]
    fn reacquire_after_drop_replaces_metadata() {
        let dir = tempdir().unwrap();
        // Longer than the second owner so a missing truncate would corrupt the JSON.
        let first_owner = LockOwner {
            bundle_path: "/Applications/Very/Long/Path/For/Truncation/MC-Vector.app".to_string(),
            ..sample_owner(Edition::Tauri)
        };
        let first = expect_acquired(acquire(dir.path(), &first_owner).unwrap());
        let lock_path = first.path().to_path_buf();
        let owner_path = dir.path().join(INSTANCE_LOCK_OWNER_FILE);
        assert!(owner_path.is_file());
        drop(first);

        assert!(lock_path.exists(), "lock file must not be deleted on drop");
        assert!(
            !owner_path.exists(),
            "owner metadata must be removed when the lock is released"
        );

        let second_owner = LockOwner {
            pid: 7,
            bundle_path: "/a".to_string(),
            ..sample_owner(Edition::Native)
        };
        let second = expect_acquired(acquire(dir.path(), &second_owner).unwrap());
        let parsed: LockOwner =
            serde_json::from_slice(&std::fs::read(owner_path).unwrap()).unwrap();
        assert_eq!(parsed, second_owner);
        assert_eq!(std::fs::metadata(second.path()).unwrap().len(), 0);
    }

    #[test]
    fn corrupt_metadata_while_held_reports_unknown_owner() {
        let dir = tempdir().unwrap();
        let _lock = expect_acquired(acquire(dir.path(), &sample_owner(Edition::Tauri)).unwrap());

        std::fs::write(dir.path().join(INSTANCE_LOCK_OWNER_FILE), b"not json {{").unwrap();

        match acquire(dir.path(), &sample_owner(Edition::Native)).unwrap() {
            LockOutcome::HeldByOther(owner) => assert_eq!(owner, None),
            other => panic!("expected HeldByOther, got {other:?}"),
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn missing_owner_file_falls_back_to_legacy_lock_metadata() {
        let dir = tempdir().unwrap();
        let legacy_owner = sample_owner(Edition::Tauri);
        let lock = expect_acquired(acquire(dir.path(), &legacy_owner).unwrap());
        std::fs::remove_file(dir.path().join(INSTANCE_LOCK_OWNER_FILE)).unwrap();
        std::fs::write(lock.path(), serde_json::to_vec(&legacy_owner).unwrap()).unwrap();

        match acquire(dir.path(), &sample_owner(Edition::Native)).unwrap() {
            LockOutcome::HeldByOther(owner) => assert_eq!(owner, Some(legacy_owner)),
            other => panic!("expected HeldByOther, got {other:?}"),
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn invalid_owner_file_does_not_fall_back_to_legacy_lock_metadata() {
        let dir = tempdir().unwrap();
        let legacy_owner = sample_owner(Edition::Tauri);
        let lock = expect_acquired(acquire(dir.path(), &legacy_owner).unwrap());
        std::fs::write(lock.path(), serde_json::to_vec(&legacy_owner).unwrap()).unwrap();
        std::fs::write(dir.path().join(INSTANCE_LOCK_OWNER_FILE), b"not json {{").unwrap();

        match acquire(dir.path(), &sample_owner(Edition::Native)).unwrap() {
            LockOutcome::HeldByOther(owner) => assert_eq!(owner, None),
            other => panic!("expected HeldByOther, got {other:?}"),
        }
    }

    #[test]
    fn acquire_creates_missing_nested_directory() {
        let root = tempdir().unwrap();
        let dir = root.path().join("nested").join("data");
        assert!(!dir.exists());

        let lock = expect_acquired(acquire(&dir, &sample_owner(Edition::Native)).unwrap());
        assert!(dir.join(INSTANCE_LOCK_FILE).is_file());
        assert_eq!(lock.path(), dir.join(INSTANCE_LOCK_FILE).as_path());
    }
}
