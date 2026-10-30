use std::fs;
use std::path::{Path, PathBuf};

use super::file_utils::{
    is_link_or_reparse_point, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};
pub(crate) use super::recovery_record::{
    DirectoryMigrationStage, RecoveryOperation, RecoveryRecord, ServerJarReplacementStage,
};
use super::server_registry::ServerRegistry;

#[derive(Debug)]
pub(crate) struct RecoveryFailure {
    pub server_id: Option<String>,
    pub error: String,
}

pub(crate) fn recover_startup(
    app_data_dir: &Path,
    registry: &ServerRegistry,
) -> Vec<RecoveryFailure> {
    let records = match registry.recovery_records() {
        Ok(records) => records,
        Err(error) => {
            let failure = RecoveryFailure {
                server_id: None,
                error: format!("Could not read recovery journal; no files were changed: {error}"),
            };
            log::error!("Startup recovery deferred: {}", failure.error);
            return vec![failure];
        }
    };

    let mut failures = Vec::new();
    for record in records {
        let server_id = operation_server_id(&record.operation).to_owned();
        if let Err(error) = recover_record(app_data_dir, registry, &record) {
            let error = format!(
                "Server recovery needs attention; its journal was kept and server files were left in place: {error}"
            );
            mark_server_unavailable(registry, &server_id, &error);
            failures.push(RecoveryFailure {
                server_id: Some(server_id),
                error,
            });
        }
    }

    for failure in &failures {
        log::error!(
            "Startup recovery deferred for server {:?}: {}",
            failure.server_id,
            failure.error
        );
    }
    failures
}

fn operation_server_id(operation: &RecoveryOperation) -> &str {
    match operation {
        RecoveryOperation::ServerDirectoryMigration { server_id, .. }
        | RecoveryOperation::ServerJarReplacement { server_id, .. } => server_id,
    }
}

fn recover_record(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    record: &RecoveryRecord,
) -> Result<(), String> {
    match &record.operation {
        RecoveryOperation::ServerDirectoryMigration {
            server_id,
            legacy_directory_name,
            stage,
        } => recover_directory_migration(
            app_data_dir,
            registry,
            &record.id,
            server_id,
            legacy_directory_name,
            *stage,
        ),
        RecoveryOperation::ServerJarReplacement {
            server_id,
            source_version,
            target_version,
            rollback_file_name,
            staging_file_name,
            had_previous,
            sha256,
            ..
        } => super::server_jar::recover_replacement(
            app_data_dir,
            registry,
            &record.id,
            server_id,
            source_version,
            target_version,
            rollback_file_name,
            staging_file_name,
            *had_previous,
            sha256,
        ),
    }
}

fn recover_directory_migration(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    record_id: &str,
    server_id: &str,
    legacy_directory_name: &str,
    stage: DirectoryMigrationStage,
) -> Result<(), String> {
    let source = server_directory(app_data_dir, legacy_directory_name, false)?;
    let destination = server_directory(app_data_dir, server_id, false)?;
    let source_exists = safe_directory_exists(&source)?;
    let destination_exists = safe_directory_exists(&destination)?;
    let server = registry
        .get_servers()?
        .into_iter()
        .find(|server| server.id == server_id);
    let destination_is_committed = server
        .as_ref()
        .is_some_and(|server| path_points_to(&server.path, &destination));

    match (source_exists, destination_exists, destination_is_committed) {
        (true, false, true) => {
            let Some(mut server) = server else {
                return Err("Server profile disappeared during directory recovery".into());
            };
            server.path = source.to_string_lossy().to_string();
            server.unavailable_reason = Some(
                "The migrated directory was missing at startup; the preserved legacy directory was restored as the server path.".into(),
            );
            if !registry.update_server(&server)? {
                return Err("Server profile disappeared during directory recovery".into());
            }
        }
        (true, false, false) => {}
        (false, true, true) => {}
        (false, true, false) => {
            fs::rename(&destination, &source).map_err(|error| {
                format!(
                    "Could not restore legacy server directory {}: {error}",
                    source.display()
                )
            })?;
        }
        (true, true, false) if stage == DirectoryMigrationStage::DirectoryCopied => {
            let Some(mut server) = server else {
                return Err("Server profile disappeared during copied-directory recovery".into());
            };
            server.path = destination.to_string_lossy().to_string();
            server.unavailable_reason = None;
            if !registry.update_server(&server)? {
                return Err("Server profile disappeared during copied-directory recovery".into());
            }
            // Keep the legacy source as an extra safety copy. The copied
            // directory was complete before this stage was persisted.
        }
        (true, true, true) => {
            return Err(format!(
                "Both the legacy directory {} and migrated directory {} exist; inspect them before removing either",
                source.display(),
                destination.display()
            ));
        }
        (true, true, false) => {
            return Err(format!(
                "Both the legacy directory {} and migrated directory {} exist while the registry still points to the legacy directory; inspect them before removing either",
                source.display(),
                destination.display()
            ));
        }
        (false, false, _) => {
            return Err(format!(
                "Neither the legacy directory {} nor migrated directory {} exists",
                source.display(),
                destination.display()
            ));
        }
    }

    registry.delete_recovery_record(record_id)
}

fn server_directory(
    app_data_dir: &Path,
    server_id: &str,
    create_root: bool,
) -> Result<PathBuf, String> {
    resolve_managed_request(
        app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: String::new(),
        },
        create_root,
    )
}

fn safe_directory_exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_dir() => Err(format!(
            "Recovery path is not a real directory: {}",
            path.display()
        )),
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Could not inspect recovery directory {}: {error}",
            path.display()
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::safe_directory_exists;
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("mc-vector-recovery-journal-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("temporary recovery directory should be created");
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[cfg(unix)]
    #[test]
    fn recovery_refuses_a_symlink_directory() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let target = directory.path().join("target");
        fs::create_dir(&target).expect("symlink target should be created");
        let link = directory.path().join("server-directory");
        symlink(&target, &link).expect("directory symlink should be created");

        let error = safe_directory_exists(&link).expect_err("symlink should be refused");
        assert!(error.contains("Recovery path is not a real directory"));
    }
}

fn path_points_to(profile_path: &str, expected: &Path) -> bool {
    let profile_path = Path::new(profile_path);
    profile_path == expected
        || profile_path
            .canonicalize()
            .map(|canonical| canonical == expected)
            .unwrap_or(false)
}

fn mark_server_unavailable(registry: &ServerRegistry, server_id: &str, error: &str) {
    let Ok(servers) = registry.get_servers() else {
        return;
    };
    let Some(mut server) = servers.into_iter().find(|server| server.id == server_id) else {
        return;
    };
    server.unavailable_reason = Some(error.to_owned());
    if let Err(update_error) = registry.update_server(&server) {
        log::error!("Could not record recovery error for server {server_id:?}: {update_error}");
    }
}
