use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryRecord {
    pub id: String,
    pub operation: RecoveryOperation,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum RecoveryOperation {
    ServerDirectoryMigration {
        server_id: String,
        legacy_directory_name: String,
        stage: DirectoryMigrationStage,
    },
    ServerJarReplacement {
        server_id: String,
        source_version: String,
        target_version: String,
        stage: ServerJarReplacementStage,
        rollback_file_name: String,
        staging_file_name: String,
        had_previous: bool,
        sha256: String,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DirectoryMigrationStage {
    Prepared,
    DirectoryCopied,
    DirectoryMoved,
    RegistryUpdated,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ServerJarReplacementStage {
    Prepared,
    PreviousJarStaged,
    NewJarInstalled,
    RegistryUpdated,
}
