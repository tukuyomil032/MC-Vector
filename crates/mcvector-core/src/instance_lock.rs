//! Cross-edition instance lock (NAT-010 / DATA-007).
//!
//! The Tauri and Native editions share one data directory, so they must never
//! run at the same time. Each edition takes an exclusive advisory lock on
//! `<dir>/.mcvector-instance.lock` and records its owner there as JSON. The OS
//! releases the lock when the holding process dies, so a crash never leaves a
//! stale lock behind. The lock file itself is never deleted.

use std::fs::{File, OpenOptions, TryLockError};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const INSTANCE_LOCK_FILE: &str = ".mcvector-instance.lock";

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
    // File closes the descriptor and releases the flock.
    #[allow(dead_code)]
    file: File,
    path: PathBuf,
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
    /// (always the case on Windows, where the lock is mandatory and blocks reads).
    HeldByOther(Option<LockOwner>),
}

/// Lock `<dir>/.mcvector-instance.lock`, creating `dir` if needed.
pub fn acquire(dir: &Path, owner: &LockOwner) -> std::io::Result<LockOutcome> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(INSTANCE_LOCK_FILE);

    // Never truncate on open: truncating before the lock is held would erase
    // the metadata of whichever edition currently owns it.
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)?;

    match file.try_lock() {
        Ok(()) => {
            let payload = serde_json::to_vec(owner).map_err(std::io::Error::other)?;
            file.set_len(0)?;
            file.seek(SeekFrom::Start(0))?;
            file.write_all(&payload)?;
            file.flush()?;
            file.sync_all()?;
            Ok(LockOutcome::Acquired(InstanceLock { file, path }))
        }
        Err(TryLockError::WouldBlock) => Ok(LockOutcome::HeldByOther(read_owner(&path))),
        Err(TryLockError::Error(err)) => Err(err),
    }
}

fn read_owner(path: &Path) -> Option<LockOwner> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
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

        let raw = std::fs::read_to_string(lock.path()).unwrap();
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
            // Unix locks are advisory, so the owner metadata stays readable. On
            // Windows the lock is mandatory and the owner reads back as None.
            LockOutcome::HeldByOther(owner) => {
                if cfg!(unix) {
                    assert_eq!(owner, Some(first_owner));
                }
            }
            other => panic!("expected HeldByOther, got {other:?}"),
        }
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
        drop(first);

        assert!(lock_path.exists(), "lock file must not be deleted on drop");

        let second_owner = LockOwner {
            pid: 7,
            bundle_path: "/a".to_string(),
            ..sample_owner(Edition::Native)
        };
        let second = expect_acquired(acquire(dir.path(), &second_owner).unwrap());
        let parsed: LockOwner =
            serde_json::from_slice(&std::fs::read(second.path()).unwrap()).unwrap();
        assert_eq!(parsed, second_owner);
    }

    // Writing through a second handle while the lock is held only works with
    // advisory (Unix) locks.
    #[cfg(unix)]
    #[test]
    fn corrupt_metadata_while_held_reports_unknown_owner() {
        let dir = tempdir().unwrap();
        let lock = expect_acquired(acquire(dir.path(), &sample_owner(Edition::Tauri)).unwrap());

        // A separate handle (std::fs::write) overwrites the metadata while the lock is held.
        std::fs::write(lock.path(), b"not json {{").unwrap();

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
