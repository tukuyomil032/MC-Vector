use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use mcvector_core::managed_path::is_link_or_reparse_point;
use mcvector_core::server_jar::{
    resolve_artifact, server_jar_path, MAX_JAR_BYTES, SERVER_JAR_HOSTS,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

use super::download::download_verified_artifact;
use super::recovery_journal::{RecoveryOperation, RecoveryRecord, ServerJarReplacementStage};
use super::server::ServerManager;
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::state::operation_manager::{OperationKind, ServerOperationManager};

const PLAN_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_PENDING_PLANS: usize = 128;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareServerJarRequest {
    pub server_id: String,
    pub software: String,
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedServerJarInstall {
    pub plan_id: String,
    pub latest_version: String,
    pub verified: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerJarInstallResult {
    pub server_id: String,
    pub version: String,
}

#[derive(Clone, Debug)]
struct ServerJarPlan {
    server_id: String,
    software: String,
    source_version: String,
    target_version: String,
    url: String,
    sha256: Option<String>,
    expires_at: Instant,
}

#[derive(Default)]
pub struct ServerJarInstaller {
    plans: Arc<Mutex<HashMap<String, ServerJarPlan>>>,
}

fn validate_server_id(server_id: &str) -> Result<String, String> {
    let server_id = server_id.trim();
    if server_id.is_empty()
        || server_id.len() > 128
        || server_id.chars().any(char::is_control)
        || matches!(server_id, "." | "..")
        || server_id.contains(['/', '\\', ':'])
    {
        return Err("Server ID is invalid".into());
    }
    Ok(server_id.to_owned())
}

async fn get_registered_server(
    registry: ServerRegistry,
    server_id: String,
) -> Result<Option<MinecraftServer>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let servers = registry.get_servers()?;
        Ok(servers.into_iter().find(|server| server.id == server_id))
    })
    .await
    .map_err(|error| format!("Server registry read task failed: {error}"))?
}

async fn validate_prepare_request(
    registry: &ServerRegistry,
    request: &PrepareServerJarRequest,
) -> Result<(), String> {
    let server_id = validate_server_id(&request.server_id)?;
    if !matches!(
        request.software.as_str(),
        "Paper" | "LeafMC" | "Vanilla" | "Fabric"
    ) {
        return Err(
            "This server software does not support automatic server jar installation".into(),
        );
    }
    if request.version.trim().is_empty() || request.version.len() > 128 {
        return Err("Server version is invalid".into());
    }
    let Some(server) = get_registered_server(registry.clone(), server_id).await? else {
        return Err("Server is not registered".into());
    };
    if server.software != request.software || server.version != request.version {
        return Err("Server profile changed while preparing its upgrade".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn prepare_server_jar_install(
    registry: State<'_, ServerRegistry>,
    installer: State<'_, ServerJarInstaller>,
    request: PrepareServerJarRequest,
) -> Result<Option<PreparedServerJarInstall>, String> {
    validate_prepare_request(&registry, &request).await?;
    let Some(resolved) = resolve_artifact(&request.software, &request.version, true).await? else {
        return Ok(None);
    };
    let plan_id = Uuid::new_v4().to_string();
    let sha256 = resolved.sha256().map(str::to_owned);
    let plan = ServerJarPlan {
        server_id: request.server_id.trim().to_owned(),
        software: request.software,
        source_version: request.version,
        target_version: resolved.version.clone(),
        url: resolved.url,
        sha256: sha256.clone(),
        expires_at: Instant::now() + PLAN_TTL,
    };
    {
        let mut plans = installer.plans.lock().await;
        plans.retain(|_, plan| plan.expires_at > Instant::now());
        if plans.len() >= MAX_PENDING_PLANS {
            return Err("Too many pending server jar plans".into());
        }
        plans.insert(plan_id.clone(), plan);
    }
    Ok(Some(PreparedServerJarInstall {
        plan_id,
        latest_version: resolved.version,
        verified: sha256.is_some(),
    }))
}

fn install_replacement_with_journal<F>(
    staging: &Path,
    destination: &Path,
    managed_root: &Path,
    registry: &ServerRegistry,
    server: &mut MinecraftServer,
    target_version: &str,
    sha256: &str,
    mut after_persist: F,
) -> Result<(), String>
where
    F: FnMut(ServerJarReplacementStage) -> Result<(), String>,
{
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
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
            stage: ServerJarReplacementStage::Prepared,
            rollback_file_name,
            staging_file_name,
            had_previous,
            sha256: sha256.to_ascii_lowercase(),
        },
    };

    persist_jar_stage(registry, &record, ServerJarReplacementStage::Prepared)?;
    after_persist(ServerJarReplacementStage::Prepared)?;

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
    let rollback = restore_replacement(destination, rollback_path, had_previous, sha256);
    match rollback {
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
    match regular_file_state(destination)? {
        Some(()) => {
            if file_sha256(destination)? != expected_sha256.to_ascii_lowercase() {
                return Err("Refusing to remove a server jar changed after installation".into());
            }
            fs::remove_file(destination)
                .map_err(|error| format!("Failed to remove newly installed server jar: {error}"))?;
        }
        None => {}
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

pub(crate) fn recover_replacement(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    record_id: &str,
    server_id: &str,
    source_version: &str,
    target_version: &str,
    rollback_file_name: &str,
    staging_file_name: &str,
    had_previous: bool,
    sha256: &str,
) -> Result<(), String> {
    validate_server_jar_recovery_names(rollback_file_name, staging_file_name)?;
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
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
        .find(|server| server.id == server_id);
    let current_version = server.as_ref().map(|server| server.version.as_str());

    if current_version == Some(target_version) {
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
                server.version = source_version.to_owned();
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

    if current_version.is_some_and(|version| version != source_version) {
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
    } else if had_previous {
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

fn file_name_string(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .ok_or_else(|| "Server jar recovery file name is invalid".to_string())
}

fn validate_staging_file_name(name: &str) -> Result<(), String> {
    if !name.starts_with(".server.jar.part-")
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

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open server jar for recovery verification: {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not verify server jar during recovery: {error}"))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

async fn revalidate_upgrade(
    registry: &ServerRegistry,
    server_manager: &ServerManager,
    plan: &ServerJarPlan,
) -> Result<MinecraftServer, String> {
    if server_manager
        .servers
        .lock()
        .await
        .contains_key(&plan.server_id)
    {
        return Err("Stop the server before installing an upgrade".into());
    }
    let registry = registry.clone();
    let server_id = plan.server_id.clone();
    let software = plan.software.clone();
    let source_version = plan.source_version.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let server = registry
            .get_servers()?
            .into_iter()
            .find(|server| server.id == server_id)
            .ok_or_else(|| "Server is not registered".to_string())?;
        if server.software != software || server.version != source_version {
            return Err("Server profile changed after upgrade preparation".into());
        }
        Ok(server)
    })
    .await
    .map_err(|error| format!("Server registry read task failed: {error}"))?
}

#[tauri::command]
pub async fn execute_server_jar_install(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    installer: State<'_, ServerJarInstaller>,
    operations: State<'_, ServerOperationManager>,
    server_manager: State<'_, ServerManager>,
    plan_id: String,
) -> Result<ServerJarInstallResult, String> {
    let plan = installer
        .plans
        .lock()
        .await
        .remove(plan_id.trim())
        .ok_or_else(|| "Server jar install plan is missing or already used".to_string())?;
    if plan.expires_at <= Instant::now() {
        return Err("Server jar install plan expired; prepare it again".into());
    }
    let checksum = plan
        .sha256
        .as_deref()
        .ok_or_else(|| "Official server jar SHA-256 checksum is unavailable".to_string())?
        .to_owned();
    let _operation = operations
        .acquire(&plan.server_id, OperationKind::ArtifactInstall)
        .await?;
    if plan.expires_at <= Instant::now() {
        return Err("Server jar install plan expired while waiting; prepare it again".into());
    }
    let mut server = revalidate_upgrade(&registry, &server_manager, &plan).await?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let server_id = plan.server_id.clone();
    let (destination, managed_root) =
        tauri::async_runtime::spawn_blocking(move || server_jar_path(&app_data_dir, &server_id))
            .await
            .map_err(|error| format!("Server jar path validation task failed: {error}"))??;
    let verified = download_verified_artifact(
        &plan.url,
        &destination,
        &managed_root,
        &checksum,
        None,
        MAX_JAR_BYTES,
        Some(SERVER_JAR_HOSTS),
        {
            let app = app.clone();
            let server_id = plan.server_id.clone();
            move |downloaded, total| {
                let progress = if total > 0 {
                    ((downloaded as f64 / total as f64) * 100.0) as u32
                } else {
                    0
                };
                app.emit(
                    "download-progress",
                    serde_json::json!({
                        "serverId": server_id,
                        "progress": progress
                    }),
                )
                .map_err(|error| format!("Failed to emit download progress: {error}"))
            }
        },
    )
    .await?;

    let staging = verified.path;
    let registry = registry.inner().clone();
    let target_version = plan.target_version.clone();
    tauri::async_runtime::spawn_blocking(move || {
        install_replacement_with_journal(
            &staging,
            &destination,
            &managed_root,
            &registry,
            &mut server,
            &target_version,
            &checksum,
            |_| Ok(()),
        )
    })
    .await
    .map_err(|error| format!("Server jar installation task failed: {error}"))??;
    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "serverId": plan.server_id,
            "progress": 100
        }),
    );
    Ok(ServerJarInstallResult {
        server_id: plan.server_id,
        version: plan.target_version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::test_temp_dir;
    use std::path::PathBuf;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = test_temp_dir("mc-vector-server-jar-tests").join(Uuid::new_v4().to_string());
            fs::create_dir_all(&path).expect("temporary jar directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn jar_recovery_fixture() -> (TestDirectory, ServerRegistry, PathBuf, PathBuf) {
        let directory = TestDirectory::new();
        let server_directory = directory.path().join("servers/server-id");
        fs::create_dir_all(&server_directory).expect("server directory should be created");
        fs::write(server_directory.join("server.jar"), b"old server jar")
            .expect("previous jar should be written");
        fs::write(
            directory.path().join("servers.json"),
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
        .expect("legacy registry should be written");
        let registry = ServerRegistry::open(directory.path()).expect("registry should open");
        let staging = server_directory.join(format!(
            ".server.jar.part-{}-0-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        fs::write(&staging, b"new server jar").expect("staged jar should be written");
        (directory, registry, server_directory, staging)
    }

    #[test]
    fn server_jar_recovery_handles_each_persisted_stage_after_simulated_crash() {
        for interrupted_stage in [
            ServerJarReplacementStage::Prepared,
            ServerJarReplacementStage::PreviousJarStaged,
            ServerJarReplacementStage::NewJarInstalled,
            ServerJarReplacementStage::RegistryUpdated,
        ] {
            let (directory, registry, server_directory, staging) = jar_recovery_fixture();
            let mut server = registry.get_servers().unwrap().remove(0);
            let managed_root = fs::canonicalize(directory.path().join("servers")).unwrap();
            let destination = server_directory.join("server.jar");
            let sha256 = format!("{:x}", Sha256::digest(b"new server jar"));

            let error = install_replacement_with_journal(
                &staging,
                &destination,
                &managed_root,
                &registry,
                &mut server,
                "1.21.1",
                &sha256,
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

            assert!(
                super::super::recovery_journal::recover_startup(directory.path(), &registry)
                    .is_empty()
            );
            assert!(registry.recovery_records().unwrap().is_empty());
            let profile = registry.get_servers().unwrap().remove(0);
            match interrupted_stage {
                ServerJarReplacementStage::RegistryUpdated => {
                    assert_eq!(profile.version, "1.21.1");
                    assert_eq!(fs::read(&destination).unwrap(), b"new server jar");
                }
                ServerJarReplacementStage::Prepared
                | ServerJarReplacementStage::PreviousJarStaged
                | ServerJarReplacementStage::NewJarInstalled => {
                    assert_eq!(profile.version, "1.20.6");
                    assert_eq!(fs::read(&destination).unwrap(), b"old server jar");
                }
            }
        }
    }
}
