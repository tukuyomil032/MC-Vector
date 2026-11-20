use std::path::Path;

use crate::error::{CoreError, CoreErrorCode};

use super::BackupRecord;

/// Deletes one validated backup archive and rebuilds its shared catalog.
pub fn delete_backup(
    backup_dir: &Path,
    server_id: &str,
    backup_name: &str,
) -> Result<Vec<BackupRecord>, CoreError> {
    super::engine::delete_backup(backup_dir, server_id, backup_name).map_err(|message| {
        let code = if message.to_ascii_lowercase().contains("name") {
            CoreErrorCode::BackupInvalidName
        } else if message.contains("not found") {
            CoreErrorCode::BackupNotFound
        } else if message.to_ascii_lowercase().contains("manifest")
            || message.to_ascii_lowercase().contains("archive")
        {
            CoreErrorCode::BackupCorruptArchive
        } else {
            CoreErrorCode::BackupIo
        };
        let safe_message = match code {
            CoreErrorCode::BackupInvalidName => "Backup name is invalid.",
            CoreErrorCode::BackupNotFound => "Backup was not found.",
            CoreErrorCode::BackupCorruptArchive => {
                "Backup archive is corrupt or fails integrity validation."
            }
            _ => "Backup could not be deleted.",
        };
        CoreError::new(code, safe_message)
    })
}
