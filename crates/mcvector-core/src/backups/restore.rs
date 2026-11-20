use std::path::Path;

use super::BackupProgress;
use crate::error::{CoreError, CoreErrorCode};

/// Transactionally replaces a managed server tree with a verified archive.
pub fn restore_backup(archive: &Path, target_dir: &Path, server_id: &str) -> Result<(), CoreError> {
    restore_backup_with_progress(archive, target_dir, server_id, &mut |_| {})
}

/// Transactionally restores a backup and reports each completed archive file.
///
/// File events advance from 0.0 through 0.99 while extracting to a staging
/// directory. The final 1.0 event, with an empty `current_file`, is emitted
/// only after the staged tree is verified and atomically installed. A failed
/// restore returns an error without a successful terminal event.
pub fn restore_backup_with_progress(
    archive: &Path,
    target_dir: &Path,
    server_id: &str,
    progress: &mut dyn FnMut(BackupProgress),
) -> Result<(), CoreError> {
    super::engine::transactional_restore_archive_with_progress(
        archive, target_dir, server_id, progress,
    )
    .map_err(|message| {
        let lower = message.to_ascii_lowercase();
        if lower.contains("archive")
            || lower.contains("manifest")
            || lower.contains("checksum")
            || lower.contains("entry")
            || lower.contains("zip")
        {
            CoreError::new(
                CoreErrorCode::BackupCorruptArchive,
                "Backup archive is corrupt or fails integrity validation.",
            )
        } else {
            CoreError::new(
                CoreErrorCode::BackupRestoreFailed,
                "Backup could not be restored safely.",
            )
        }
    })
}

pub fn extract_managed_item(archive: &Path, destination: &Path) -> Result<(), CoreError> {
    super::engine::extract_item(archive, destination).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCorruptArchive,
            "Archive could not be extracted safely.",
        )
    })
}
