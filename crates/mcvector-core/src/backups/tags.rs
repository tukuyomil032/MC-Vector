use std::path::Path;

use crate::error::{CoreError, CoreErrorCode};
use crate::managed_files;
use crate::managed_path::is_link_or_reparse_point;

use super::{BackupMetadataCatalog, BackupMetadataEntry};

const METADATA_FILE: &str = ".mc-vector-backup-meta.json";

/// Reads `.mc-vector-backup-meta.json`. A server without a backup directory
/// yet (no backup made so far) has no metadata, not an error.
pub fn load_backup_metadata(backup_dir: &Path) -> Result<BackupMetadataCatalog, CoreError> {
    let directory_metadata = match std::fs::symlink_metadata(backup_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(BackupMetadataCatalog::default())
        }
        Err(_) => {
            return Err(CoreError::new(
                CoreErrorCode::BackupCatalogFailed,
                "Backup metadata could not be read.",
            ))
        }
    };
    if is_link_or_reparse_point(&directory_metadata) || !directory_metadata.is_dir() {
        return Err(CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        ));
    }
    let metadata_path = backup_dir.join(METADATA_FILE);
    match std::fs::symlink_metadata(&metadata_path) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => {
            Err(CoreError::new(
                CoreErrorCode::BackupCatalogFailed,
                "Backup metadata file is not a regular file.",
            ))
        }
        Ok(_) => {
            let bytes = std::fs::read(metadata_path).map_err(|_| {
                CoreError::new(
                    CoreErrorCode::BackupCatalogFailed,
                    "Backup metadata could not be read.",
                )
            })?;
            serde_json::from_slice(&bytes).map_err(|_| {
                CoreError::new(
                    CoreErrorCode::BackupCatalogFailed,
                    "Backup metadata is invalid.",
                )
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(BackupMetadataCatalog::default())
        }
        Err(_) => Err(CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        )),
    }
}

/// Updates tags and note for one backup in `.mc-vector-backup-meta.json`.
/// Other catalog fields and entries are retained.
pub fn set_backup_tags(
    backup_dir: &Path,
    backup_name: &str,
    tags: Vec<String>,
    note: String,
) -> Result<BackupMetadataCatalog, CoreError> {
    let name = validate_backup_name(backup_name)?;
    validate_existing_backup_archive(backup_dir, &name)?;
    let directory_metadata = std::fs::symlink_metadata(backup_dir).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        )
    })?;
    if is_link_or_reparse_point(&directory_metadata) || !directory_metadata.is_dir() {
        return Err(CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        ));
    }

    let metadata_path = backup_dir.join(METADATA_FILE);
    let mut catalog = load_backup_metadata(backup_dir)?;

    let mut normalized_tags = Vec::new();
    for tag in tags {
        let tag = tag.trim();
        if !tag.is_empty() && !normalized_tags.iter().any(|saved| saved == tag) {
            normalized_tags.push(tag.to_string());
        }
    }
    let existing = catalog.entries.get(&name);
    let created_at = existing
        .map(|entry| entry.created_at.clone())
        .filter(|created_at| !created_at.is_empty())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
    catalog.entries.insert(
        name,
        BackupMetadataEntry {
            tags: normalized_tags,
            note: note.trim().to_string(),
            created_at,
        },
    );

    let bytes = serde_json::to_vec_pretty(&catalog).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be encoded.",
        )
    })?;
    managed_files::atomic_write(&metadata_path, &bytes).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be saved.",
        )
    })?;
    Ok(catalog)
}

/// Removes metadata for archives that were successfully deleted. The backup
/// catalog JSON is shared with the Tauri renderer, so unrelated fields and
/// entries are preserved. Deleting the latest entry also clears the legacy
/// snapshot state, matching the renderer's delete behavior.
pub(crate) fn remove_backup_metadata_entries(
    backup_dir: &Path,
    deleted_names: &[String],
) -> Result<(), CoreError> {
    if deleted_names.is_empty() {
        return Ok(());
    }

    let mut catalog = load_backup_metadata(backup_dir)?;
    let mut changed = false;
    for name in deleted_names {
        changed |= catalog.entries.remove(name).is_some();
    }
    if catalog
        .last_backup_name
        .as_ref()
        .is_some_and(|name| deleted_names.iter().any(|deleted| deleted == name))
    {
        catalog.last_backup_name = None;
        catalog.latest_snapshot.clear();
        changed = true;
    }
    if !changed {
        return Ok(());
    }

    let metadata_path = backup_dir.join(METADATA_FILE);
    let bytes = serde_json::to_vec_pretty(&catalog).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be encoded.",
        )
    })?;
    managed_files::atomic_write(&metadata_path, &bytes).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be saved.",
        )
    })
}

fn validate_existing_backup_archive(backup_dir: &Path, name: &str) -> Result<(), CoreError> {
    let directory_metadata = std::fs::symlink_metadata(backup_dir).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        )
    })?;
    if is_link_or_reparse_point(&directory_metadata) || !directory_metadata.is_dir() {
        return Err(CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        ));
    }
    let canonical_dir = std::fs::canonicalize(backup_dir).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupCatalogFailed,
            "Backup metadata could not be read.",
        )
    })?;
    let archive_path = canonical_dir.join(name);
    let archive_metadata = std::fs::symlink_metadata(&archive_path).map_err(|error| {
        let code = if error.kind() == std::io::ErrorKind::NotFound {
            CoreErrorCode::BackupNotFound
        } else {
            CoreErrorCode::BackupIo
        };
        CoreError::new(code, "Backup archive was not found.")
    })?;
    if is_link_or_reparse_point(&archive_metadata) || !archive_metadata.is_file() {
        return Err(CoreError::new(
            CoreErrorCode::BackupNotFound,
            "Backup archive was not found.",
        ));
    }
    let canonical_archive = std::fs::canonicalize(&archive_path).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupNotFound,
            "Backup archive was not found.",
        )
    })?;
    if !canonical_archive.starts_with(&canonical_dir) {
        return Err(CoreError::new(
            CoreErrorCode::BackupNotFound,
            "Backup archive was not found.",
        ));
    }
    Ok(())
}

pub fn backup_metadata_entry<'a>(
    catalog: &'a BackupMetadataCatalog,
    backup_name: &str,
) -> Option<&'a BackupMetadataEntry> {
    catalog.entries.get(backup_name)
}

fn validate_backup_name(name: &str) -> Result<String, CoreError> {
    let name = name.trim();
    if name.is_empty()
        || !name.ends_with(".zip")
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.contains("..")
        || name.chars().any(char::is_control)
    {
        return Err(CoreError::new(
            CoreErrorCode::BackupInvalidName,
            "Backup name is invalid.",
        ));
    }
    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_tags_and_note_without_dropping_catalog_data() {
        let temp = tempfile::tempdir().unwrap();
        let backup_dir = temp.path();
        std::fs::write(backup_dir.join("latest.zip"), b"archive").unwrap();
        let original = BackupMetadataCatalog {
            last_backup_name: Some("latest.zip".to_string()),
            latest_snapshot: [(
                "world/level.dat".to_string(),
                super::super::BackupSnapshotEntry {
                    size: 12,
                    modified: 34,
                },
            )]
            .into_iter()
            .collect(),
            entries: Default::default(),
        };
        let path = backup_dir.join(METADATA_FILE);
        std::fs::write(&path, serde_json::to_vec(&original).unwrap()).unwrap();

        let updated = set_backup_tags(
            backup_dir,
            "latest.zip",
            vec![
                " world ".to_string(),
                "world".to_string(),
                "safe".to_string(),
            ],
            " restore point ".to_string(),
        )
        .unwrap();
        assert_eq!(updated.last_backup_name, original.last_backup_name);
        assert_eq!(updated.latest_snapshot, original.latest_snapshot);
        let entry = updated.entries.get("latest.zip").unwrap();
        assert_eq!(entry.tags, ["world", "safe"]);
        assert_eq!(entry.note, "restore point");
        assert!(!entry.created_at.is_empty());
        let reread: BackupMetadataCatalog =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(reread, updated);
    }

    #[test]
    fn rejects_unsafe_tag_catalog_name_before_mutating() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(
            set_backup_tags(temp.path(), "../outside.zip", vec![], String::new())
                .unwrap_err()
                .code,
            CoreErrorCode::BackupInvalidName
        );
        assert!(std::fs::read_dir(temp.path()).unwrap().next().is_none());
    }

    #[test]
    fn missing_backup_directory_has_empty_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("server-1");

        assert_eq!(
            load_backup_metadata(&missing).unwrap(),
            BackupMetadataCatalog::default()
        );
        assert!(!missing.exists());
    }

    #[test]
    fn rejects_missing_archive_without_creating_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let error = set_backup_tags(
            temp.path(),
            "missing.zip",
            vec!["important".to_string()],
            "restore point".to_string(),
        )
        .unwrap_err();

        assert_eq!(error.code, CoreErrorCode::BackupNotFound);
        assert!(std::fs::read_dir(temp.path()).unwrap().next().is_none());
    }

    #[test]
    fn removes_deleted_entries_and_clears_matching_legacy_snapshot_state() {
        let temp = tempfile::tempdir().unwrap();
        let backup_dir = temp.path();
        let metadata_path = backup_dir.join(METADATA_FILE);
        let original = BackupMetadataCatalog {
            last_backup_name: Some("deleted.zip".to_string()),
            latest_snapshot: [(
                "world/level.dat".to_string(),
                super::super::BackupSnapshotEntry {
                    size: 12,
                    modified: 34,
                },
            )]
            .into_iter()
            .collect(),
            entries: [
                (
                    "deleted.zip".to_string(),
                    BackupMetadataEntry {
                        tags: vec!["old".to_string()],
                        note: "remove me".to_string(),
                        created_at: "2026-11-16T00:00:00.000Z".to_string(),
                    },
                ),
                (
                    "manual.zip".to_string(),
                    BackupMetadataEntry {
                        tags: vec!["keep".to_string()],
                        note: "preserve me".to_string(),
                        created_at: "2026-11-16T00:00:00.000Z".to_string(),
                    },
                ),
            ]
            .into_iter()
            .collect(),
        };
        std::fs::write(&metadata_path, serde_json::to_vec(&original).unwrap()).unwrap();

        remove_backup_metadata_entries(backup_dir, &["deleted.zip".to_string()]).unwrap();

        let updated = load_backup_metadata(backup_dir).unwrap();
        assert_eq!(updated.last_backup_name, None);
        assert!(updated.latest_snapshot.is_empty());
        assert!(!updated.entries.contains_key("deleted.zip"));
        assert_eq!(
            updated.entries.get("manual.zip"),
            original.entries.get("manual.zip")
        );
    }
}
