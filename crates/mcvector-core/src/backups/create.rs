use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use crate::error::{CoreError, CoreErrorCode};

use super::{BackupOrigin, BackupProgress};

/// Archive creation input. `stop_running_server` intentionally belongs to the
/// edition adapter because the core archive engine does not own a server UI or
/// process lifecycle.
#[derive(Clone, Debug)]
pub struct CreateBackupRequest {
    pub server_id: String,
    pub backup_name: Option<String>,
    pub sources: Option<Vec<String>>,
    pub compression_level: Option<i64>,
    pub origin: BackupOrigin,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateBackupResult {
    pub backup_name: String,
    /// The verified catalog row for the installed archive. It is absent when
    /// catalog rebuilding fails or does not include the created archive.
    pub record: Option<super::BackupRecord>,
    /// A successfully committed archive remains a successful create when the
    /// catalog could not be refreshed, matching the existing Tauri contract.
    pub catalog_error: Option<CoreError>,
}

/// Creates an atomic full backup archive below a previously resolved managed
/// backup directory. A cancellation received before atomic installation
/// discards the temporary archive.
pub fn create_backup(
    source_dir: &Path,
    backup_dir: &Path,
    request: CreateBackupRequest,
    cancellation: Option<&AtomicBool>,
    progress: &mut dyn FnMut(BackupProgress),
) -> Result<CreateBackupResult, CoreError> {
    let server_id = request.server_id.clone();
    let backup_name =
        super::engine::create_backup(source_dir, backup_dir, request, cancellation, progress)
            .map_err(|message| {
                if message == super::AUTOMATIC_BACKUP_CANCELLED_ERROR {
                    CoreError::cancelled()
                } else if message.to_ascii_lowercase().contains("name")
                    || message.to_ascii_lowercase().contains("filename")
                {
                    CoreError::new(CoreErrorCode::BackupInvalidName, "Backup name is invalid.")
                } else if message.to_ascii_lowercase().contains("source")
                    || message.to_ascii_lowercase().contains("entry")
                {
                    CoreError::new(
                        CoreErrorCode::BackupInvalidSource,
                        "Backup sources are invalid or contain no files.",
                    )
                } else {
                    CoreError::new(
                        CoreErrorCode::BackupIo,
                        format!("Backup could not be created: {message}"),
                    )
                }
            })?;
    let (record, catalog_error) =
        match super::catalog::rebuild_backup_catalog(backup_dir, &server_id, cancellation) {
            Ok(records) => match records
                .into_iter()
                .find(|record| record.archive_path == backup_name)
            {
                Some(record) => (Some(record), None),
                None => (
                    None,
                    Some(CoreError::new(
                        CoreErrorCode::BackupCatalogFailed,
                        "Backup catalog did not include the created archive.",
                    )),
                ),
            },
            Err(error) => (None, Some(error)),
        };
    Ok(CreateBackupResult {
        backup_name,
        record,
        catalog_error,
    })
}

pub fn compress_items(sources: Vec<PathBuf>, destination: PathBuf) -> Result<String, CoreError> {
    super::engine::compress_item(sources, destination).map_err(|_| {
        CoreError::new(
            CoreErrorCode::BackupIo,
            "Managed items could not be compressed.",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_name_gets_a_valid_default_and_progress_is_relative() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("server");
        let backup_dir = root.path().join("backups");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("server.properties"), b"online-mode=true").unwrap();
        let mut updates = Vec::new();
        let result = create_backup(
            &source,
            &backup_dir,
            CreateBackupRequest {
                server_id: "server-1".to_string(),
                backup_name: None,
                sources: None,
                compression_level: Some(5),
                origin: BackupOrigin::Manual,
            },
            None,
            &mut |progress| updates.push(progress),
        )
        .expect("create backup");

        assert!(result.backup_name.starts_with("backup-"));
        assert!(result.backup_name.ends_with(".zip"));
        assert!(result.catalog_error.is_none());
        assert!(backup_dir.join(&result.backup_name).is_file());
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].fraction, 1.0);
        assert_eq!(updates[0].current_file, "server.properties");
    }

    #[test]
    fn creates_capture_fixture_backup_with_compressible_editor_files() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("data/servers/server-1");
        let backup_dir = root.path().join("data/backups/server-1");
        for directory in [
            "config",
            "plugins/Essentials",
            "logs",
            "world/region",
            "empty",
            "editor",
        ] {
            std::fs::create_dir_all(source.join(directory)).unwrap();
        }
        for (path, contents) in [
            (
                "server.properties",
                b"motd=server-1\nserver-port=25565\n".as_slice(),
            ),
            ("eula.txt", b"eula=true\n"),
            ("server.jar", b"stand-in jar"),
            ("config/paper.yml", b"settings:\n  timings: true\n"),
            ("plugins/Essentials.jar", b"fake plugin"),
            ("plugins/Essentials/config.yml", b"newbies:\n  kit: tools\n"),
            (
                "logs/latest.log",
                b"[12:00:00 INFO]: Starting minecraft server\n",
            ),
            ("world/region/r.0.0.mca", b"region\n"),
            ("editor/sample.json", b"{\"enabled\":true}"),
        ] {
            let path = source.join(path);
            std::fs::write(path, contents).unwrap();
        }
        for (name, size) in [
            ("size-under.txt", 5 * 1024 * 1024 - 1),
            ("size-limit.txt", 5 * 1024 * 1024),
            ("size-over.txt", 5 * 1024 * 1024 + 1),
        ] {
            std::fs::write(source.join("editor").join(name), vec![b'a'; size]).unwrap();
        }

        let result = create_backup(
            &source,
            &backup_dir,
            CreateBackupRequest {
                server_id: "server-1".to_string(),
                backup_name: Some("before-update.zip".to_string()),
                sources: None,
                compression_level: Some(5),
                origin: BackupOrigin::Manual,
            },
            None,
            &mut |_| {},
        )
        .expect("capture fixture backup should be created");

        assert_eq!(result.backup_name, "before-update.zip");
        assert!(result.catalog_error.is_none());
        assert!(backup_dir.join("before-update.zip").is_file());
        let archive_path = backup_dir.join("before-update.zip");
        let mut archive =
            zip::ZipArchive::new(std::fs::File::open(&archive_path).unwrap()).unwrap();
        for index in 0..archive.len() {
            let entry = archive.by_index(index).unwrap();
            if entry.size() >= 1024 * 1024 {
                assert_eq!(entry.compression(), zip::CompressionMethod::Deflated);
            }
        }
        drop(archive);
        let restored = root.path().join("restored");
        super::super::restore::restore_backup(&archive_path, &restored, "server-1").unwrap();
        assert!(restored.join("empty").is_dir());
        for name in ["size-under.txt", "size-limit.txt", "size-over.txt"] {
            assert_eq!(
                std::fs::read(source.join("editor").join(name)).unwrap(),
                std::fs::read(restored.join("editor").join(name)).unwrap()
            );
        }
        assert_eq!(
            std::fs::read(restored.join("server.jar")).unwrap(),
            b"stand-in jar"
        );
    }
}
