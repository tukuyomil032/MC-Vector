//! Shared, framework-independent backup operations.
//!
//! Paths passed here must already have been resolved below a managed root.
//! Callers are responsible for server registration and per-server operation
//! locking; this module revalidates archive names and filesystem entries.

pub mod auto;
pub mod catalog;
pub mod create;
pub mod delete;
mod engine;
pub mod estimate;
pub mod restore;
pub mod tags;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub use catalog::{apply_retention, list_backups, BackupRetentionReport};
pub use create::{create_backup, CreateBackupRequest, CreateBackupResult};
pub use delete::delete_backup;
pub use estimate::{
    estimate_backup, estimate_backup_duration_ms, BackupDurationSample, BackupEstimate,
};
pub use restore::{restore_backup, restore_backup_with_progress};
pub use tags::{backup_metadata_entry, load_backup_metadata, set_backup_tags};

pub const AUTOMATIC_BACKUP_CANCELLED_ERROR: &str = "automatic-backup-cancelled";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManagedBackupPaths {
    pub server_dir: PathBuf,
    pub backup_dir: PathBuf,
}

/// Resolves the server and backup folders through the shared managed-path
/// policy. Callers must still acquire the server operation lock before using
/// these paths for a mutation.
pub fn resolve_managed_paths(
    app_data_dir: &Path,
    server_id: &str,
    create_backup_dir: bool,
) -> Result<ManagedBackupPaths, crate::error::CoreError> {
    use crate::error::{CoreError, CoreErrorCode};
    use crate::managed_path::{
        resolve_managed_request, validate_server_id, ManagedPathRequest, ManagedRoot,
    };

    let server_id = validate_server_id(server_id)
        .map_err(|_| CoreError::new(CoreErrorCode::ServerInvalidName, "Server ID is invalid."))?;
    let server_dir = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.clone()),
            relative_path: String::new(),
        },
        false,
    )
    .map_err(|_| {
        CoreError::new(
            CoreErrorCode::ServerUnmanaged,
            "Server folder is not managed.",
        )
    })?;
    let backup_dir = resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some(server_id),
            relative_path: String::new(),
        },
        create_backup_dir,
    )
    .map_err(|_| CoreError::new(CoreErrorCode::BackupIo, "Backup folder is unavailable."))?;
    Ok(ManagedBackupPaths {
        server_dir,
        backup_dir,
    })
}

/// Acquires the shared core operation guard used by native backup mutations.
pub async fn acquire_operation(
    operations: &crate::operations::ServerOperationManager,
    server_id: &str,
    kind: crate::operations::OperationKind,
) -> Result<crate::operations::OperationGuard, crate::error::CoreError> {
    let server_id = crate::managed_path::validate_server_id(server_id).map_err(|_| {
        crate::error::CoreError::new(
            crate::error::CoreErrorCode::ServerInvalidName,
            "Server ID is invalid.",
        )
    })?;
    operations.acquire(&server_id, kind).await.map_err(|_| {
        crate::error::CoreError::new(
            crate::error::CoreErrorCode::ServerOperationFailed,
            "Another server operation is in progress.",
        )
    })
}

/// Metadata recorded in every full backup archive and exposed by the catalog.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub backup_id: String,
    pub server_id: String,
    pub archive_path: String,
    pub kind: String,
    pub consistency: String,
    pub origin: String,
    pub created_at: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub archive_sha256: String,
    pub manifest_version: u32,
    pub restore_eligible: bool,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

/// Origin marker persisted in the archive manifest.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BackupOrigin {
    Manual,
    Automatic,
}

impl BackupOrigin {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Automatic => "automatic",
        }
    }
}

/// Progress from archive creation. `fraction` is normalized to 0.0–1.0;
/// `current_file` is relative to the managed server root.
#[derive(Clone, Debug, PartialEq)]
pub struct BackupProgress {
    pub fraction: f32,
    pub current_file: String,
}

/// The tag-and-note catalog used by the existing Backups view.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupMetadataCatalog {
    pub last_backup_name: Option<String>,
    #[serde(default)]
    pub latest_snapshot: BTreeMap<String, BackupSnapshotEntry>,
    #[serde(default)]
    pub entries: BTreeMap<String, BackupMetadataEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSnapshotEntry {
    pub size: u64,
    pub modified: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupMetadataEntry {
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub created_at: String,
}
