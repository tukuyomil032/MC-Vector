//! Journaled replacement of `servers/<id>/server.jar`. Every stage is written
//! to the registry's recovery journal before the next file operation, so a
//! crash at any point is undone (or completed) by [`recover_replacement`] at
//! the next start.

use std::fs;
use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::managed_path::is_link_or_reparse_point;
use crate::recovery_record::{RecoveryOperation, RecoveryRecord, ServerJarReplacementStage};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_jar::server_jar_path;

/// Replaces `destination` with the verified `staging` jar and sets the
/// profile's version and software. `after_persist` runs after each
/// journal write (tests inject crashes there).
#[allow(clippy::too_many_arguments)]
pub fn install_replacement_with_journal<F>(
    staging: &Path,
    destination: &Path,
    managed_root: &Path,
    registry: &ServerRegistry,
    server: &mut MinecraftServer,
    target_version: &str,
    target_software: &str,
    sha256: &str,
    before_swap: impl FnOnce() -> Result<(), String>,
    mut after_persist: F,
) -> Result<(), String>
where
    F: FnMut(ServerJarReplacementStage) -> Result<(), String>,
{
    if !is_sha256(sha256) {
        return Err("Server jar recovery requires a SHA-256 checksum".into());
    }
    let canonical_staging = staging
        .canonicalize()
        .map_err(|error| format!("Failed to resolve verified server jar: {error}"))?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Server jar destination has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve server jar directory: {error}"))?;
    if !canonical_staging.starts_with(managed_root)
        || !canonical_parent.starts_with(managed_root)
        || canonical_staging.parent() != Some(canonical_parent.as_path())
    {
        return Err("Server jar files must remain inside the same managed directory".into());
    }
    let staging_file_name = file_name_string(staging)?;
    validate_staging_file_name(&staging_file_name)?;
    let had_previous = match fs::symlink_metadata(destination) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => {
            return Err("Server jar destination is not a regular file".into())
        }
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("Failed to inspect server jar destination: {error}")),
    };
    let rollback_file_name = format!(".server.jar.rollback-{}", Uuid::new_v4());
    let rollback_path = parent.join(&rollback_file_name);
    let record_id = Uuid::new_v4().to_string();
    let mut record = RecoveryRecord {
        id: record_id.clone(),
        operation: RecoveryOperation::ServerJarReplacement {
            server_id: server.id.clone(),
            source_version: server.version.clone(),
            target_version: target_version.to_owned(),
            source_software: Some(server.software.clone()),
            target_software: Some(target_software.to_owned()),
            stage: ServerJarReplacementStage::Prepared,
            rollback_file_name,
            staging_file_name,
            had_previous,
            sha256: sha256.to_ascii_lowercase(),
        },
    };

    persist_jar_stage(registry, &record, ServerJarReplacementStage::Prepared)?;
    after_persist(ServerJarReplacementStage::Prepared)?;
    if let Err(error) = before_swap() {
        registry.delete_recovery_record(&record_id)?;
        return Err(error);
    }

    if had_previous {
        fs::rename(destination, &rollback_path)
            .map_err(|error| format!("Failed to stage existing server jar: {error}"))?;
        set_jar_stage(&mut record, ServerJarReplacementStage::PreviousJarStaged);
        persist_jar_stage(
            registry,
            &record,
            ServerJarReplacementStage::PreviousJarStaged,
        )?;
        after_persist(ServerJarReplacementStage::PreviousJarStaged)?;
    }

    if let Err(error) = fs::rename(staging, destination) {
        if had_previous {
            if let Err(restore_error) = fs::rename(&rollback_path, destination) {
                return Err(format!(
                    "Failed to install server jar ({error}) and restore previous jar ({restore_error}); recovery journal retained"
                ));
            }
        }
        return Err(format!("Failed to publish verified server jar: {error}"));
    }
    set_jar_stage(&mut record, ServerJarReplacementStage::NewJarInstalled);
    persist_jar_stage(
        registry,
        &record,
        ServerJarReplacementStage::NewJarInstalled,
    )?;
    after_persist(ServerJarReplacementStage::NewJarInstalled)?;

    server.version = target_version.to_owned();
    server.software = target_software.to_owned();
    match registry.update_server(server) {
        Ok(true) => {}
        Ok(false) => {
            return rollback_replacement_after_registry_failure(
                destination,
                &rollback_path,
                had_previous,
                &record_id,
                registry,
                "Server disappeared from registry during upgrade".to_string(),
                sha256,
            );
        }
        Err(error) => {
            return rollback_replacement_after_registry_failure(
                destination,
                &rollback_path,
                had_previous,
                &record_id,
                registry,
                error,
                sha256,
            );
        }
    }

    set_jar_stage(&mut record, ServerJarReplacementStage::RegistryUpdated);
    if let Err(error) = persist_jar_stage(
        registry,
        &record,
        ServerJarReplacementStage::RegistryUpdated,
    ) {
        // The registry now names the installed version. The previous jar stays
        // recoverable under the earlier journal stage if this write fails.
        log::warn!("Could not persist completed server jar stage: {error}");
    } else {
        after_persist(ServerJarReplacementStage::RegistryUpdated)?;
    }

    if had_previous {
        if let Err(error) = fs::remove_file(&rollback_path) {
            log::warn!(
                "Could not remove previous server jar {:?}: {error}",
                rollback_path
            );
            return Ok(());
        }
    }
    if let Err(error) = registry.delete_recovery_record(&record_id) {
        log::warn!("Could not clear completed server jar recovery journal: {error}");
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn set_jar_stage(record: &mut RecoveryRecord, stage: ServerJarReplacementStage) {
    if let RecoveryOperation::ServerJarReplacement {
        stage: current_stage,
        ..
    } = &mut record.operation
    {
        *current_stage = stage;
    }
}

fn persist_jar_stage(
    registry: &ServerRegistry,
    record: &RecoveryRecord,
    stage: ServerJarReplacementStage,
) -> Result<(), String> {
    registry
        .save_recovery_record(record)
        .map_err(|error| format!("Could not persist server jar stage {stage:?}: {error}"))
}

fn rollback_replacement_after_registry_failure(
    destination: &Path,
    rollback_path: &Path,
    had_previous: bool,
    record_id: &str,
    registry: &ServerRegistry,
    registry_error: String,
    sha256: &str,
) -> Result<(), String> {
    match restore_replacement(destination, rollback_path, had_previous, sha256) {
        Ok(()) => {
            let _ = registry.delete_recovery_record(record_id);
            Err(format!("{registry_error}; installed server jar was rolled back"))
        }
        Err(recovery_error) => Err(format!(
            "{registry_error}; server jar rollback failed: {recovery_error}; recovery journal retained"
        )),
    }
}

fn restore_replacement(
    destination: &Path,
    rollback_path: &Path,
    had_previous: bool,
    expected_sha256: &str,
) -> Result<(), String> {
    if regular_file_state(destination)?.is_some() {
        if file_sha256(destination)? != expected_sha256.to_ascii_lowercase() {
            return Err("Refusing to remove a server jar changed after installation".into());
        }
        fs::remove_file(destination)
            .map_err(|error| format!("Failed to remove newly installed server jar: {error}"))?;
    }
    if had_previous {
        if regular_file_state(rollback_path)?.is_none() {
            return Err("Previous server jar rollback file is missing".into());
        }
        fs::rename(rollback_path, destination)
            .map_err(|error| format!("Failed to restore previous server jar: {error}"))?;
    }
    Ok(())
}

/// Finishes or undoes one interrupted replacement recorded in the journal.
pub fn recover_replacement(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    record: &RecoveryRecord,
) -> Result<(), String> {
    let RecoveryOperation::ServerJarReplacement {
        server_id,
        source_version,
        target_version,
        source_software,
        target_software,
        rollback_file_name,
        staging_file_name,
        had_previous,
        sha256,
        ..
    } = &record.operation
    else {
        return Err("Expected a server jar replacement journal".into());
    };
    let record_id = &record.id;
    validate_server_jar_recovery_names(rollback_file_name, staging_file_name)?;
    if !is_sha256(sha256) {
        return Err("Server jar recovery record contains an invalid SHA-256 checksum".into());
    }
    let (destination, managed_root) = server_jar_path(app_data_dir, server_id)?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Server jar destination has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve server jar recovery directory: {error}"))?;
    if canonical_parent != parent || !canonical_parent.starts_with(&managed_root) {
        return Err("Server jar recovery directory is outside managed storage".into());
    }
    let rollback_path = parent.join(rollback_file_name);
    let staging_path = parent.join(staging_file_name);
    let rollback_exists = regular_file_state(&rollback_path)?.is_some();
    let destination_exists = regular_file_state(&destination)?.is_some();
    let destination_is_new =
        destination_exists && file_sha256(&destination)? == sha256.to_ascii_lowercase();
    let server = registry
        .get_servers()?
        .into_iter()
        .find(|server| server.id == *server_id);
    let current_version = server.as_ref().map(|server| server.version.as_str());

    let current_software = server.as_ref().map(|server| server.software.as_str());
    let matches_target_software = target_software
        .as_deref()
        .is_none_or(|target| current_software == Some(target));

    if current_version == Some(target_version) && matches_target_software {
        if destination_is_new {
            if rollback_exists {
                fs::remove_file(&rollback_path).map_err(|error| {
                    format!(
                        "Could not remove previous server jar {}: {error}",
                        rollback_path.display()
                    )
                })?;
            }
            remove_recovery_staging(&staging_path)?;
            return registry.delete_recovery_record(record_id);
        }
        if !destination_exists && rollback_exists {
            fs::rename(&rollback_path, &destination).map_err(|error| {
                format!(
                    "Could not restore previous server jar {}: {error}",
                    destination.display()
                )
            })?;
            if let Some(mut server) = server {
                server.version.clone_from(source_version);
                if let Some(source) = source_software {
                    server.software.clone_from(source);
                }
                server.unavailable_reason = Some(
                    "The upgraded server jar was missing at startup; the previous jar was restored. Retry the upgrade when ready.".into(),
                );
                if !registry.update_server(&server)? {
                    return Err("Server disappeared while recording jar recovery".into());
                }
            }
            remove_recovery_staging(&staging_path)?;
            return registry.delete_recovery_record(record_id);
        }
        return Err("Installed server jar is missing or changed; the previous jar was kept for manual recovery".into());
    }

    if server.is_some()
        && (current_version != Some(source_version)
            || source_software
                .as_deref()
                .is_some_and(|source| current_software != Some(source)))
    {
        return Err(format!(
            "Server registry version changed to {:?} during jar recovery",
            current_version.unwrap_or_default()
        ));
    }

    if rollback_exists {
        if destination_exists && !destination_is_new {
            return Err(
                "Server jar destination changed during recovery; both files were preserved".into(),
            );
        }
        restore_replacement(&destination, &rollback_path, true, sha256)?;
    } else if *had_previous {
        if destination_exists && !destination_is_new {
            // The existing jar was never moved aside, so the Prepared stage
            // did not touch it.
        } else {
            return Err("Previous server jar is missing; its recovery journal was kept".into());
        }
    } else if destination_is_new {
        fs::remove_file(&destination)
            .map_err(|error| format!("Could not remove uncommitted server jar: {error}"))?;
    } else if destination_exists {
        return Err(
            "Server jar destination changed during recovery; the file was preserved".into(),
        );
    }

    remove_recovery_staging(&staging_path)?;
    registry.delete_recovery_record(record_id)
}

/// A journaled jar replacement that could not be recovered at startup.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JarRecoveryFailure {
    pub server_id: Option<String>,
    pub error: String,
}

/// Recovers every interrupted server jar replacement in the journal. Other
/// journal records are left for the edition that owns them. A server whose
/// recovery fails is marked unavailable and its files are left in place.
pub fn recover_startup(app_data_dir: &Path, registry: &ServerRegistry) -> Vec<JarRecoveryFailure> {
    let records = match registry.recovery_records() {
        Ok(records) => records,
        Err(error) => {
            return vec![JarRecoveryFailure {
                server_id: None,
                error: format!("Could not read recovery journal; no files were changed: {error}"),
            }]
        }
    };
    let mut failures = Vec::new();
    for record in records {
        let RecoveryOperation::ServerJarReplacement { server_id, .. } = &record.operation else {
            continue;
        };
        if let Err(error) = recover_replacement(app_data_dir, registry, &record) {
            let error = format!(
                "Server recovery needs attention; its journal was kept and server files were left in place: {error}"
            );
            mark_server_unavailable(registry, server_id, &error);
            log::error!("Server jar recovery deferred for {server_id:?}: {error}");
            failures.push(JarRecoveryFailure {
                server_id: Some(server_id.clone()),
                error,
            });
        }
    }
    failures
}

fn mark_server_unavailable(registry: &ServerRegistry, server_id: &str, error: &str) {
    let Ok(servers) = registry.get_servers() else {
        return;
    };
    let Some(mut server) = servers.into_iter().find(|server| server.id == *server_id) else {
        return;
    };
    server.unavailable_reason = Some(error.to_owned());
    if let Err(update_error) = registry.update_server(&server) {
        log::error!("Could not record recovery error for server {server_id:?}: {update_error}");
    }
}

fn file_name_string(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| "Server jar recovery file name is invalid".to_string())
}

/// Staging names written by the verified download: `.server.jar-verified-<uuid>.part`
/// (current) or `.server.jar.part-…` (earlier releases, still in old journals).
fn validate_staging_file_name(name: &str) -> Result<(), String> {
    let known_prefix = name.starts_with(".server.jar.part-")
        || (name.starts_with(".server.jar-verified-") && name.ends_with(".part"));
    if !known_prefix
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
    {
        return Err("Verified server jar has an unsafe staging file name".into());
    }
    Ok(())
}

fn validate_server_jar_recovery_names(rollback: &str, staging: &str) -> Result<(), String> {
    let rollback_uuid = rollback
        .strip_prefix(".server.jar.rollback-")
        .ok_or_else(|| "Server jar recovery record has an unsafe rollback name".to_string())?;
    Uuid::parse_str(rollback_uuid)
        .map_err(|_| "Server jar recovery record has an unsafe rollback name".to_string())?;
    validate_staging_file_name(staging)
}

fn regular_file_state(path: &Path) -> Result<Option<()>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => Err(format!(
            "Recovery file is not a regular file: {}",
            path.display()
        )),
        Ok(_) => Ok(Some(())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Could not inspect recovery file {}: {error}",
            path.display()
        )),
    }
}

fn remove_recovery_staging(path: &Path) -> Result<(), String> {
    if regular_file_state(path)?.is_some() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not remove server jar staging file: {error}"))?;
    }
    Ok(())
}

/// Lowercase SHA-256 of a file.
pub fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open server jar for verification: {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not verify server jar: {error}"))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn jar_recovery_fixture(
        staging_name: &str,
    ) -> (tempfile::TempDir, PathBuf, ServerRegistry, PathBuf, PathBuf) {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().canonicalize().unwrap();
        let server_directory = root.join("servers/server-id");
        fs::create_dir_all(&server_directory).unwrap();
        fs::write(server_directory.join("server.jar"), b"old server jar").unwrap();
        fs::write(
            root.join("servers.json"),
            serde_json::to_vec(&serde_json::json!({
                "servers": [{
                    "id": "server-id",
                    "name": "Recovery server",
                    "version": "1.20.6",
                    "software": "Paper",
                    "port": 25565,
                    "memory": 2048,
                    "path": server_directory.to_string_lossy()
                }]
            }))
            .unwrap(),
        )
        .unwrap();
        let registry = ServerRegistry::open(&root).unwrap();
        let staging = server_directory.join(staging_name);
        fs::write(&staging, b"new server jar").unwrap();
        (directory, root, registry, server_directory, staging)
    }

    #[test]
    fn server_jar_recovery_handles_each_persisted_stage_after_simulated_crash() {
        for (index, interrupted_stage) in [
            ServerJarReplacementStage::Prepared,
            ServerJarReplacementStage::PreviousJarStaged,
            ServerJarReplacementStage::NewJarInstalled,
            ServerJarReplacementStage::RegistryUpdated,
        ]
        .into_iter()
        .enumerate()
        {
            // Both the current and the legacy staging names must recover.
            let staging_name = if index % 2 == 0 {
                format!(".server.jar-verified-{}.part", Uuid::new_v4())
            } else {
                format!(
                    ".server.jar.part-{}-0-{}",
                    std::process::id(),
                    Uuid::new_v4()
                )
            };
            let (_directory, root, registry, server_directory, staging) =
                jar_recovery_fixture(&staging_name);
            let mut server = registry.get_servers().unwrap().remove(0);
            let managed_root = root.join("servers");
            let destination = server_directory.join("server.jar");
            let sha256 = format!("{:x}", Sha256::digest(b"new server jar"));

            let error = install_replacement_with_journal(
                &staging,
                &destination,
                &managed_root,
                &registry,
                &mut server,
                "1.20.6",
                "LeafMC",
                &sha256,
                || Ok(()),
                |persisted_stage| {
                    if persisted_stage == interrupted_stage {
                        Err(format!("simulated crash after {persisted_stage:?}"))
                    } else {
                        Ok(())
                    }
                },
            )
            .expect_err("fault injection should interrupt jar replacement");
            assert!(error.contains("simulated crash"));
            assert_eq!(registry.recovery_records().unwrap().len(), 1);

            assert!(recover_startup(&root, &registry).is_empty());
            assert!(registry.recovery_records().unwrap().is_empty());
            let profile = registry.get_servers().unwrap().remove(0);
            match interrupted_stage {
                ServerJarReplacementStage::RegistryUpdated => {
                    assert_eq!(profile.version, "1.20.6");
                    assert_eq!(profile.software, "LeafMC");
                    assert_eq!(fs::read(&destination).unwrap(), b"new server jar");
                }
                _ => {
                    assert_eq!(profile.version, "1.20.6");
                    assert_eq!(profile.software, "Paper");
                    assert_eq!(fs::read(&destination).unwrap(), b"old server jar");
                }
            }
        }
    }

    #[test]
    fn staging_names_must_come_from_the_verified_download() {
        assert!(validate_staging_file_name(".server.jar-verified-1234-abcd.part").is_ok());
        assert!(validate_staging_file_name(".server.jar.part-1-0-abc").is_ok());
        for name in [
            "server.jar",
            ".server.jar-verified-x",
            "../x.part",
            ".server.jar.part-a/b",
        ] {
            assert!(validate_staging_file_name(name).is_err(), "{name}");
        }
    }
}
