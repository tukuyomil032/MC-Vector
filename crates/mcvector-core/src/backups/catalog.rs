use std::path::Path;
use std::sync::atomic::AtomicBool;

use crate::error::{CoreError, CoreErrorCode};

use super::BackupRecord;

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupRetentionReport {
    pub deleted_names: Vec<String>,
    pub failed_delete_count: u32,
    pub records: Vec<BackupRecord>,
}

/// Reads archive manifests and rebuilds the shared catalog for a managed
/// backup directory. A missing directory is an empty catalog.
pub fn list_backups(backup_dir: &Path, server_id: &str) -> Result<Vec<BackupRecord>, CoreError> {
    // A server can exist before its first backup has created this directory.
    // Do not rebuild the on-disk catalog in that case; there is nothing to list.
    match std::fs::metadata(backup_dir) {
        Ok(metadata) if metadata.is_dir() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Ok(_) => {
            return Err(catalog_error(
                "Backup directory is not a directory".to_string(),
            ))
        }
        Err(error) => {
            return Err(catalog_error(format!(
                "Failed to inspect backup directory: {error}"
            )))
        }
    }
    super::engine::rebuild_backup_catalog(backup_dir, server_id).map_err(catalog_error)
}

pub fn rebuild_backup_catalog(
    backup_dir: &Path,
    server_id: &str,
    cancellation: Option<&AtomicBool>,
) -> Result<Vec<BackupRecord>, CoreError> {
    super::engine::rebuild_backup_catalog_with_cancellation(backup_dir, server_id, cancellation)
        .map_err(|message| catalog_error(message))
}

pub fn apply_retention(
    backup_dir: &Path,
    server_id: &str,
    retain_count: u32,
    retain_days: u32,
    cancellation: Option<&AtomicBool>,
) -> Result<BackupRetentionReport, CoreError> {
    apply_retention_at(
        backup_dir,
        server_id,
        retain_count,
        retain_days,
        now_millis(),
        cancellation,
    )
}

pub fn apply_retention_at(
    backup_dir: &Path,
    server_id: &str,
    retain_count: u32,
    retain_days: u32,
    now_millis: u128,
    cancellation: Option<&AtomicBool>,
) -> Result<BackupRetentionReport, CoreError> {
    super::engine::apply_retention(
        backup_dir,
        server_id,
        retain_count,
        retain_days,
        now_millis,
        cancellation,
    )
    .map_err(catalog_error)
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn catalog_error(message: String) -> CoreError {
    if message == super::AUTOMATIC_BACKUP_CANCELLED_ERROR {
        CoreError::cancelled()
    } else {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup catalog could not be read or written.",
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn listing_server_without_backup_directory_is_empty() {
        let root = tempfile::tempdir().expect("temporary directory");
        let missing = root.path().join("server-1").join("backups");

        let records = super::list_backups(&missing, "server-1").expect("empty catalog");

        assert!(records.is_empty());
        assert!(!missing.exists());
    }
}
