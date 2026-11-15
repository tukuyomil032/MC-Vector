use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use mcvector_core::properties::{
    get_server_properties_compat as core_get_server_properties, patch_properties,
    save_server_properties_compat as core_save_server_properties, MAX_PROPERTIES_BYTES,
};

use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use super::server_registry::{JsonNumber, MinecraftServer, ServerRegistry};
use crate::state::operation_manager::{OperationKind, ServerOperationManager};

const BACKEND_PORT_START: u16 = 25_566;

#[derive(Clone, Debug)]
struct FileReplacement {
    destination: PathBuf,
    content: String,
}

#[derive(Debug)]
struct StagedReplacement {
    destination: PathBuf,
    staging: PathBuf,
    rollback: PathBuf,
    original_exists: bool,
    original_moved: bool,
    new_installed: bool,
}

impl Drop for StagedReplacement {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.staging);
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyNetworkRequest {
    pub proxy_software: String,
    pub proxy_port: u16,
    pub backend_server_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyBackendPort {
    pub server_id: String,
    pub port: u16,
}

fn server_properties_path(app_data_dir: &Path, server_id: &str) -> Result<PathBuf, String> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: "server.properties".to_string(),
    };
    let path = resolve_managed_request(app_data_dir, &request, false)?;

    let managed_root = app_data_dir.join("servers");
    let server_dir = managed_root.join(server_id);
    for directory in [&managed_root, &server_dir] {
        let metadata = fs::symlink_metadata(directory)
            .map_err(|error| format!("Failed to inspect managed server directory: {error}"))?;
        if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
            return Err("Managed server directory is not a regular directory".to_string());
        }
    }
    match fs::symlink_metadata(&path) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => {
            return Err("server.properties is not a regular file".to_string());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Failed to inspect server.properties: {error}")),
    }
    Ok(path)
}

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

fn read_properties_file(path: &Path) -> Result<String, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(error) => return Err(format!("Failed to inspect server.properties: {error}")),
    };
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err("server.properties is not a regular file".to_string());
    }
    if metadata.len() > MAX_PROPERTIES_BYTES as u64 {
        return Err("server.properties exceeds the read size limit".to_string());
    }
    fs::read_to_string(path).map_err(|error| format!("Failed to read server.properties: {error}"))
}

fn stage_replacement(replacement: FileReplacement) -> Result<StagedReplacement, String> {
    let parent = replacement
        .destination
        .parent()
        .ok_or_else(|| "server.properties has no parent directory".to_string())?;
    let parent_metadata = fs::symlink_metadata(parent)
        .map_err(|error| format!("Failed to inspect server directory: {error}"))?;
    if is_link_or_reparse_point(&parent_metadata) || !parent_metadata.is_dir() {
        return Err("Server properties parent is not a regular directory".to_string());
    }

    let staging = parent.join(format!(".server.properties-stage-{}", Uuid::new_v4()));
    let rollback = parent.join(format!(".server.properties-backup-{}", Uuid::new_v4()));
    let original_exists = match fs::symlink_metadata(&replacement.destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
                return Err("server.properties is not a regular file".to_string());
            }
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("Failed to inspect server.properties: {error}")),
    };

    let mut staged_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(|error| format!("Failed to create server properties staging file: {error}"))?;
    let write_result = (|| {
        staged_file
            .write_all(replacement.content.as_bytes())
            .map_err(|error| format!("Failed to write server properties staging file: {error}"))?;
        staged_file
            .sync_all()
            .map_err(|error| format!("Failed to sync server properties staging file: {error}"))
    })();
    drop(staged_file);
    if let Err(error) = write_result {
        let _ = fs::remove_file(&staging);
        return Err(error);
    }

    Ok(StagedReplacement {
        destination: replacement.destination,
        staging,
        rollback,
        original_exists,
        original_moved: false,
        new_installed: false,
    })
}

fn rollback_replacements(replacements: &mut [StagedReplacement]) -> Result<(), String> {
    let mut failures = Vec::new();
    for replacement in replacements.iter_mut().rev() {
        if replacement.new_installed {
            if let Err(error) = fs::remove_file(&replacement.destination) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    failures.push(format!("could not remove updated properties file: {error}"));
                }
            }
            replacement.new_installed = false;
        }
        if replacement.original_moved {
            match fs::rename(&replacement.rollback, &replacement.destination) {
                Ok(()) => replacement.original_moved = false,
                Err(error) => {
                    failures.push(format!("could not restore properties backup: {error}"))
                }
            }
        }
        let _ = fs::remove_file(&replacement.staging);
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "; rollback was incomplete and manual recovery may be required: {}",
            failures.join("; ")
        ))
    }
}

fn commit_replacements(
    replacements: &mut [StagedReplacement],
    registry: &ServerRegistry,
    updated_servers: &[MinecraftServer],
) -> Result<(), String> {
    for index in 0..replacements.len() {
        if replacements[index].original_exists {
            if let Err(error) = fs::rename(
                &replacements[index].destination,
                &replacements[index].rollback,
            ) {
                let rollback_error = rollback_replacements(replacements).err();
                return Err(format!(
                    "Failed to stage previous server.properties: {error}{}",
                    rollback_error.unwrap_or_default()
                ));
            }
            replacements[index].original_moved = true;
        }

        if let Err(error) = fs::rename(
            &replacements[index].staging,
            &replacements[index].destination,
        ) {
            let rollback_error = rollback_replacements(replacements).err();
            return Err(format!(
                "Failed to commit server.properties: {error}{}",
                rollback_error.unwrap_or_default()
            ));
        }
        replacements[index].new_installed = true;
    }

    if let Err(error) = registry.update_servers(updated_servers) {
        let rollback_error = rollback_replacements(replacements).err();
        return Err(format!(
            "Failed to update server registry; properties changes were rolled back: {error}{}",
            rollback_error.unwrap_or_default()
        ));
    }

    for replacement in replacements {
        if replacement.original_moved {
            let _ = fs::remove_file(&replacement.rollback);
        }
        let _ = fs::remove_file(&replacement.staging);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_server_properties(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<BTreeMap<String, Value>, String> {
    let server_id = server_id.trim().to_string();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let registry = registry.inner().clone();
    let snapshot =
        core_get_server_properties(operations.inner(), app_data_dir, registry, server_id)
            .await
            .map_err(|error| error.to_string())?;
    Ok(snapshot
        .entries
        .into_iter()
        .map(|entry| (entry.key, tauri_property_value(&entry.value)))
        .collect())
}

#[tauri::command]
pub async fn save_server_properties(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    updates: HashMap<String, Value>,
) -> Result<Option<u16>, String> {
    let server_id = server_id.trim().to_string();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let registry = registry.inner().clone();
    let updates = updates
        .into_iter()
        .map(|(key, value)| property_value_to_string(value).map(|value| (key, value)))
        .collect::<Result<HashMap<_, _>, _>>()?;
    core_save_server_properties(
        operations.inner(),
        app_data_dir,
        registry,
        server_id,
        updates,
    )
    .await
    .map_err(|error| error.to_string())
}

fn property_value_to_string(value: Value) -> Result<String, String> {
    match value {
        Value::String(value) => Ok(value),
        Value::Bool(value) => Ok(value.to_string()),
        Value::Number(value) => Ok(value.to_string()),
        _ => Err("Property values must be strings, numbers, or booleans".to_string()),
    }
}

fn tauri_property_value(value: &str) -> Value {
    match value {
        "true" => return Value::Bool(true),
        "false" => return Value::Bool(false),
        _ => {}
    }

    if let Ok(integer) = value.parse::<i64>() {
        let number = serde_json::Number::from(integer);
        if number.to_string() == value {
            return Value::Number(number);
        }
    }
    if let Ok(integer) = value.parse::<u64>() {
        let number = serde_json::Number::from(integer);
        if number.to_string() == value {
            return Value::Number(number);
        }
    }
    if let Ok(float) = value.parse::<f64>() {
        if let Some(number) = serde_json::Number::from_f64(float) {
            if number.to_string() == value {
                return Value::Number(number);
            }
        }
    }
    Value::String(value.to_string())
}

#[tauri::command]
pub async fn configure_proxy_network(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    request: ProxyNetworkRequest,
) -> Result<Vec<ProxyBackendPort>, String> {
    if request.proxy_port == 0 {
        return Err("Proxy port must be between 1 and 65535".to_string());
    }
    let proxy_software = request.proxy_software.trim().to_ascii_lowercase();
    if !matches!(
        proxy_software.as_str(),
        "velocity" | "waterfall" | "bungeecord"
    ) {
        return Err("Unsupported proxy software".to_string());
    }

    let mut seen = HashSet::new();
    let backend_ids = request
        .backend_server_ids
        .iter()
        .map(|server_id| server_id.trim().to_string())
        .collect::<Vec<_>>();
    for server_id in &backend_ids {
        if server_id.is_empty() || !seen.insert(server_id.clone()) {
            return Err("Backend server IDs must be non-empty and unique".to_string());
        }
    }
    let end_port = u32::from(BACKEND_PORT_START)
        .checked_add(backend_ids.len().saturating_sub(1) as u32)
        .ok_or_else(|| "Backend port range overflowed".to_string())?;
    if !backend_ids.is_empty() && end_port > u32::from(u16::MAX) {
        return Err("Too many backend servers for the supported port range".to_string());
    }

    let _guards = operations
        .acquire_many(
            backend_ids.iter().map(String::as_str),
            OperationKind::FileMutation,
        )
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let registered = registry.get_servers()?;
        let by_id = registered
            .into_iter()
            .map(|server| (server.id.clone(), server))
            .collect::<HashMap<_, _>>();
        let mut updated_servers = Vec::with_capacity(backend_ids.len());
        let mut replacements = Vec::with_capacity(backend_ids.len());
        let mut result = Vec::with_capacity(backend_ids.len());

        for (index, server_id) in backend_ids.iter().enumerate() {
            let mut server = by_id
                .get(server_id)
                .cloned()
                .ok_or_else(|| format!("Backend server {server_id} is not registered"))?;
            if matches!(
                server.software.trim().to_ascii_lowercase().as_str(),
                "velocity" | "waterfall" | "bungeecord"
            ) {
                return Err(format!(
                    "Proxy server {server_id} cannot be configured as a backend"
                ));
            }
            let port = u16::try_from(u32::from(BACKEND_PORT_START) + index as u32)
                .map_err(|_| "Backend port range overflowed".to_string())?;
            let path = server_properties_path(&app_data_dir, server_id)?;
            let original = read_properties_file(&path)?;
            let updates = HashMap::from([
                ("online-mode".to_string(), "false".to_string()),
                ("server-port".to_string(), port.to_string()),
            ]);
            let patched =
                patch_properties(&original, &updates).map_err(|error| error.to_string())?;
            replacements.push(stage_replacement(FileReplacement {
                destination: path,
                content: patched,
            })?);
            server.port = JsonNumber::from(port);
            updated_servers.push(server);
            result.push(ProxyBackendPort {
                server_id: server_id.clone(),
                port,
            });
        }

        commit_replacements(&mut replacements, &registry, &updated_servers)?;
        Ok(result)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{commit_replacements, stage_replacement, tauri_property_value, FileReplacement};
    use crate::commands::server_registry::{JsonNumber, MinecraftServer, ServerRegistry};
    use crate::test_support::test_temp_dir;
    use serde_json::Value;
    use std::collections::HashMap;
    use std::fs;
    use std::path::{Path, PathBuf};
    use uuid::Uuid;

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let path = test_temp_dir("mc-vector-properties-tests").join(Uuid::new_v4().to_string());
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample_server(id: &str, path: &Path) -> MinecraftServer {
        MinecraftServer {
            id: id.to_string(),
            name: id.to_string(),
            profile_name: None,
            group_name: None,
            version: "1.21".to_string(),
            software: "Paper".to_string(),
            port: JsonNumber::from(25565),
            memory: JsonNumber::from(2048),
            path: path.to_string_lossy().into_owned(),
            status: "offline".to_string(),
            java_path: None,
            auto_restart_on_crash: None,
            max_auto_restarts: None,
            auto_restart_delay_sec: None,
            auto_backup_enabled: None,
            auto_backup_interval_min: None,
            auto_backup_schedule_type: None,
            auto_backup_time: None,
            auto_backup_weekday: None,
            auto_backup_retain_count: None,
            auto_backup_retain_days: None,
            backup_restart_after_safe_backup: None,
            created_date: None,
            jvm_args: None,
            notify_on_crash: None,
            notify_on_start: None,
            notify_on_high_cpu: None,
            notify_high_cpu_threshold: None,
            unavailable_reason: None,
            extra: HashMap::new(),
        }
    }

    #[test]
    fn tauri_value_conversion_preserves_false_and_noncanonical_numeric_text() {
        assert_eq!(tauri_property_value("false"), Value::Bool(false));
        assert_eq!(tauri_property_value("true"), Value::Bool(true));
        assert_eq!(tauri_property_value("25565"), Value::from(25565));
        assert_eq!(
            tauri_property_value("0042"),
            Value::String("0042".to_string())
        );
        assert_eq!(
            tauri_property_value("1.50"),
            Value::String("1.50".to_string())
        );
        assert_eq!(
            tauri_property_value("1.5"),
            Value::Number(serde_json::Number::from_f64(1.5).unwrap())
        );
    }

    #[test]
    fn registry_failure_rolls_back_every_replaced_file() {
        let directory = TempDirectory::new();
        let app_data_dir = directory.path().join("app");
        let servers_dir = app_data_dir.join("servers");
        fs::create_dir_all(servers_dir.join("one")).unwrap();
        fs::create_dir_all(servers_dir.join("two")).unwrap();
        let one_path = servers_dir.join("one/server.properties");
        let two_path = servers_dir.join("two/server.properties");
        fs::write(&one_path, "server-port=25565\n").unwrap();
        fs::write(&two_path, "server-port=25566\n").unwrap();
        let registry = ServerRegistry::open(&app_data_dir).unwrap();
        registry
            .add_server(&sample_server("one", &servers_dir.join("one")))
            .unwrap();

        let mut replacements = vec![
            stage_replacement(FileReplacement {
                destination: one_path.clone(),
                content: "server-port=25001\n".to_string(),
            })
            .unwrap(),
            stage_replacement(FileReplacement {
                destination: two_path.clone(),
                content: "server-port=25002\n".to_string(),
            })
            .unwrap(),
        ];
        let mut one = sample_server("one", &servers_dir.join("one"));
        one.port = JsonNumber::from(25001);
        let missing = sample_server("missing", &servers_dir.join("missing"));

        assert!(commit_replacements(&mut replacements, &registry, &[one, missing]).is_err());
        assert_eq!(fs::read_to_string(one_path).unwrap(), "server-port=25565\n");
        assert_eq!(fs::read_to_string(two_path).unwrap(), "server-port=25566\n");
        assert_eq!(
            registry.get_servers().unwrap()[0].port,
            JsonNumber::from(25565)
        );
    }
}
