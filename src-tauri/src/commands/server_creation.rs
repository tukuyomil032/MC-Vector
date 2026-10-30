use std::fs;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Number;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use super::file_utils::{
    complete_server_import_for_creation, is_link_or_reparse_point, resolve_managed_request,
    ManagedPathRequest, ManagedRoot, ServerImportManager,
};
use super::server_jar::install_server_jar_for_creation;
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::state::operation_manager::{OperationKind, ServerOperationManager};

const AUTO_DOWNLOAD_SOFTWARE: [&str; 4] = ["Paper", "LeafMC", "Vanilla", "Fabric"];
const AVAILABLE_SOFTWARE: [&str; 12] = [
    "Paper",
    "LeafMC",
    "Vanilla",
    "Fabric",
    "Spigot",
    "Forge",
    "Velocity",
    "Waterfall",
    "BungeeCord",
    "Purpur",
    "CraftBukkit",
    "NeoForge",
];

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewServerProfileRequest {
    pub operation_id: String,
    pub name: String,
    #[serde(default)]
    pub profile_name: Option<String>,
    #[serde(default)]
    pub group_name: Option<String>,
    pub version: String,
    pub software: String,
    pub port: u32,
    pub memory_gb: u32,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub auto_restart_on_crash: Option<bool>,
    #[serde(default)]
    pub max_auto_restarts: Option<u32>,
    #[serde(default)]
    pub auto_restart_delay_sec: Option<u32>,
    #[serde(default)]
    pub auto_backup_enabled: Option<bool>,
    #[serde(default)]
    pub auto_backup_interval_min: Option<u32>,
    #[serde(default)]
    pub auto_backup_schedule_type: Option<String>,
    #[serde(default)]
    pub auto_backup_time: Option<String>,
    #[serde(default)]
    pub auto_backup_weekday: Option<u32>,
    #[serde(default)]
    pub auto_backup_retain_count: Option<u32>,
    #[serde(default)]
    pub auto_backup_retain_days: Option<u32>,
    #[serde(default)]
    pub backup_restart_after_safe_backup: Option<bool>,
    #[serde(default)]
    pub jvm_args: Option<String>,
    #[serde(default)]
    pub notify_on_crash: Option<bool>,
    #[serde(default)]
    pub notify_on_start: Option<bool>,
    #[serde(default)]
    pub notify_on_high_cpu: Option<bool>,
    #[serde(default)]
    pub notify_high_cpu_threshold: Option<u32>,
    #[serde(default)]
    pub import_token: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedServerProfile {
    pub server: MinecraftServer,
    pub jar_installed: bool,
}

fn validate_operation_id(operation_id: &str) -> Result<String, String> {
    let normalized = operation_id.trim();
    Uuid::parse_str(normalized)
        .map_err(|_| "Server creation operation ID is invalid".to_string())?;
    Ok(normalized.to_owned())
}

fn normalize_text(
    field: &str,
    value: Option<String>,
    max_bytes: usize,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > max_bytes || value.chars().any(char::is_control) {
        return Err(format!("{field} is invalid"));
    }
    Ok(Some(value.to_owned()))
}

fn normalize_backup_time(value: Option<String>) -> Result<String, String> {
    let value = value.unwrap_or_else(|| "03:00".to_string());
    let value = value.trim();
    if value.len() != 5
        || value.as_bytes()[2] != b':'
        || !value.as_bytes()[..2].iter().all(u8::is_ascii_digit)
        || !value.as_bytes()[3..].iter().all(u8::is_ascii_digit)
    {
        return Err("Automatic backup time must use HH:MM format".to_string());
    }
    let hour = value[..2]
        .parse::<u8>()
        .map_err(|_| "Automatic backup time is invalid".to_string())?;
    let minute = value[3..]
        .parse::<u8>()
        .map_err(|_| "Automatic backup time is invalid".to_string())?;
    if hour > 23 || minute > 59 {
        return Err("Automatic backup time is invalid".to_string());
    }
    Ok(value.to_owned())
}

fn build_profile(
    request: NewServerProfileRequest,
    server_id: String,
    server_path: String,
) -> Result<MinecraftServer, String> {
    let name = request.name.trim();
    if name.is_empty() || name.len() > 128 || name.chars().any(char::is_control) {
        return Err("Server name is invalid".to_string());
    }
    let is_import = request
        .import_token
        .as_deref()
        .is_some_and(|token| !token.trim().is_empty());
    if (!is_import
        && !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')))
        || (is_import
            && name
                .chars()
                .any(|character| matches!(character, '/' | '\\' | ':')))
    {
        return Err("Server name contains unsupported characters".to_string());
    }
    let software = request.software.trim();
    if !AVAILABLE_SOFTWARE.contains(&software) {
        return Err("Server software is invalid".to_string());
    }
    let version = request.version.trim();
    if (version.is_empty() && !is_import)
        || version.len() > 128
        || version.chars().any(char::is_control)
    {
        return Err("Server version is invalid".to_string());
    }
    if !(1..=65_535).contains(&request.port) {
        return Err("Server port must be between 1 and 65535".to_string());
    }
    if !(1..=1_024).contains(&request.memory_gb) {
        return Err("Server memory must be between 1 and 1024 GB".to_string());
    }

    let profile_name = normalize_text("Profile name", request.profile_name, 128)?;
    let group_name = normalize_text("Group name", request.group_name, 128)?;
    let java_path = normalize_text("Java path", request.java_path, 4_096)?;
    let jvm_args = normalize_text("JVM arguments", request.jvm_args, 8_192)?;
    let schedule_type = match request.auto_backup_schedule_type.as_deref() {
        None | Some("") | Some("interval") => "interval".to_string(),
        Some("daily") => "daily".to_string(),
        Some("weekly") => "weekly".to_string(),
        Some(_) => return Err("Automatic backup schedule type is invalid".to_string()),
    };
    let backup_weekday = request.auto_backup_weekday.unwrap_or(0);
    if backup_weekday > 6 {
        return Err("Automatic backup weekday must be between 0 and 6".to_string());
    }
    let backup_time = normalize_backup_time(request.auto_backup_time)?;
    let max_auto_restarts = request.max_auto_restarts.unwrap_or(3).min(20);
    let restart_delay = request.auto_restart_delay_sec.unwrap_or(5).clamp(1, 300);
    let backup_interval = request
        .auto_backup_interval_min
        .unwrap_or(60)
        .clamp(1, 43_200);

    Ok(MinecraftServer {
        id: server_id,
        name: name.to_owned(),
        profile_name,
        group_name,
        version: version.to_owned(),
        software: software.to_owned(),
        port: Number::from(request.port),
        memory: Number::from(request.memory_gb.saturating_mul(1024)),
        path: server_path,
        status: "offline".to_string(),
        java_path,
        auto_restart_on_crash: Some(request.auto_restart_on_crash.unwrap_or(false)),
        max_auto_restarts: Some(Number::from(max_auto_restarts)),
        auto_restart_delay_sec: Some(Number::from(restart_delay)),
        auto_backup_enabled: Some(request.auto_backup_enabled.unwrap_or(false)),
        auto_backup_interval_min: Some(Number::from(backup_interval)),
        auto_backup_schedule_type: Some(schedule_type),
        auto_backup_time: Some(backup_time),
        auto_backup_weekday: Some(Number::from(backup_weekday)),
        auto_backup_retain_count: request.auto_backup_retain_count.map(Number::from),
        auto_backup_retain_days: request.auto_backup_retain_days.map(Number::from),
        backup_restart_after_safe_backup: request.backup_restart_after_safe_backup,
        created_date: Some(Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        jvm_args,
        notify_on_crash: request.notify_on_crash,
        notify_on_start: request.notify_on_start,
        notify_on_high_cpu: request.notify_on_high_cpu,
        notify_high_cpu_threshold: request.notify_high_cpu_threshold.map(Number::from),
        unavailable_reason: None,
        extra: Default::default(),
    })
}

fn create_server_directory(app_data_dir: &Path, server_id: &str) -> Result<PathBuf, String> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: String::new(),
    };
    let directory = resolve_managed_request(app_data_dir, &request, true)?;
    match fs::symlink_metadata(&directory) {
        Ok(_) => return Err("A server folder with this ID already exists".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Failed to inspect server directory: {error}")),
    }
    fs::create_dir(&directory)
        .map_err(|error| format!("Failed to create managed server directory: {error}"))?;
    Ok(directory)
}

fn remove_server_directory(app_data_dir: &Path, server_id: &str) -> Result<(), String> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: String::new(),
    };
    let directory = resolve_managed_request(app_data_dir, &request, false)?;
    let metadata = match fs::symlink_metadata(&directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Failed to inspect server directory during rollback: {error}"
            ));
        }
    };
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Refusing to remove a changed server directory during rollback".to_string());
    }
    fs::remove_dir_all(directory)
        .map_err(|error| format!("Failed to remove server directory during rollback: {error}"))
}

async fn cleanup_failed_creation(
    app_data_dir: PathBuf,
    server_id: String,
    error: String,
) -> String {
    match tauri::async_runtime::spawn_blocking(move || {
        remove_server_directory(&app_data_dir, &server_id)
    })
    .await
    {
        Ok(Ok(())) => error,
        Ok(Err(cleanup_error)) => {
            format!("{error}; failed to remove incomplete server directory: {cleanup_error}")
        }
        Err(join_error) => {
            format!("{error}; failed to clean incomplete server directory: {join_error}")
        }
    }
}

#[tauri::command]
pub async fn create_server_profile(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    imports: State<'_, ServerImportManager>,
    operations: State<'_, ServerOperationManager>,
    request: NewServerProfileRequest,
) -> Result<CreatedServerProfile, String> {
    let operation_id = validate_operation_id(&request.operation_id)?;
    let server_id = Uuid::new_v4().to_string();
    let _operation = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let app_data_for_create = app_data_dir.clone();
    let server_id_for_create = server_id.clone();
    let directory = tauri::async_runtime::spawn_blocking(move || {
        create_server_directory(&app_data_for_create, &server_id_for_create)
    })
    .await
    .map_err(|error| format!("Server directory creation task failed: {error}"))??;
    let server_path = directory.to_string_lossy().into_owned();
    let mut server = match build_profile(request.clone(), server_id.clone(), server_path) {
        Ok(server) => server,
        Err(error) => {
            let error = cleanup_failed_creation(app_data_dir, server_id, error).await;
            return Err(error);
        }
    };

    let setup_result: Result<bool, String> = async {
        if let Some(import_token) = request.import_token.clone() {
            let import_state = imports.inner().clone();
            let import_root = app_data_dir.clone();
            let import_server_id = server.id.clone();
            tauri::async_runtime::spawn_blocking(move || {
                complete_server_import_for_creation(
                    &import_root,
                    &import_state,
                    &import_token,
                    &import_server_id,
                )
            })
            .await
            .map_err(|error| format!("Server import task failed: {error}"))??;
            Ok(true)
        } else if AUTO_DOWNLOAD_SOFTWARE.contains(&server.software.as_str()) {
            let installed_version = install_server_jar_for_creation(
                &app,
                &server.id,
                &operation_id,
                &server.software,
                &server.version,
            )
            .await?
            .ok_or_else(|| {
                format!(
                    "No official stable JAR is available for {} {}",
                    server.software, server.version
                )
            })?;
            server.version = installed_version;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    .await;

    let jar_installed = match setup_result {
        Ok(installed) => installed,
        Err(error) => {
            let error = cleanup_failed_creation(app_data_dir, server_id, error).await;
            return Err(error);
        }
    };

    let registry_for_add = registry.inner().clone();
    let server_for_add = server.clone();
    let add_result =
        tauri::async_runtime::spawn_blocking(move || registry_for_add.add_server(&server_for_add))
            .await
            .map_err(|error| format!("Server registry task failed: {error}"))?;
    if let Err(error) = add_result {
        let error = cleanup_failed_creation(app_data_dir, server_id, error).await;
        return Err(error);
    }

    Ok(CreatedServerProfile {
        server,
        jar_installed,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        build_profile, create_server_directory, normalize_backup_time, remove_server_directory,
        validate_operation_id, NewServerProfileRequest,
    };
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("mc-vector-create-test-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create temp directory");
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TempDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn request() -> NewServerProfileRequest {
        NewServerProfileRequest {
            operation_id: "4ddedb77-d536-4570-b647-b9e866e4d327".into(),
            name: "survival".into(),
            profile_name: Some("  Vanilla  ".into()),
            group_name: None,
            version: "1.21.10".into(),
            software: "Paper".into(),
            port: 25565,
            memory_gb: 4,
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
            jvm_args: None,
            notify_on_crash: None,
            notify_on_start: None,
            notify_on_high_cpu: None,
            notify_high_cpu_threshold: None,
            import_token: None,
        }
    }

    #[test]
    fn profile_defaults_are_applied_in_rust_and_ui_only_fields_are_not_accepted() {
        let profile = build_profile(
            request(),
            "server-id".into(),
            "/managed/servers/server-id".into(),
        )
        .unwrap();
        assert_eq!(profile.id, "server-id");
        assert_eq!(profile.path, "/managed/servers/server-id");
        assert_eq!(profile.memory.as_u64(), Some(4096));
        assert_eq!(profile.port.as_u64(), Some(25565));
        assert_eq!(profile.status, "offline");
        assert_eq!(profile.profile_name.as_deref(), Some("Vanilla"));
        assert_eq!(profile.auto_restart_on_crash, Some(false));
        assert_eq!(
            profile
                .max_auto_restarts
                .as_ref()
                .and_then(|value| value.as_u64()),
            Some(3)
        );
        assert_eq!(
            profile
                .auto_backup_interval_min
                .as_ref()
                .and_then(|value| value.as_u64()),
            Some(60)
        );
        assert!(profile.created_date.is_some());
        assert!(profile.unavailable_reason.is_none());
        assert!(profile.extra.is_empty());
    }

    #[test]
    fn profile_validation_rejects_invalid_software_pathlike_names_and_limits() {
        let mut invalid = request();
        invalid.software = "https://evil.test/server.jar".into();
        assert!(build_profile(invalid, "id".into(), "/p".into()).is_err());

        let mut invalid = request();
        invalid.name = "../outside".into();
        assert!(build_profile(invalid, "id".into(), "/p".into()).is_err());

        let mut invalid = request();
        invalid.port = 65_536;
        assert!(build_profile(invalid, "id".into(), "/p".into()).is_err());

        let mut invalid = request();
        invalid.memory_gb = 0;
        assert!(build_profile(invalid, "id".into(), "/p".into()).is_err());
    }

    #[test]
    fn imported_profile_keeps_a_human_name_and_unknown_version() {
        let mut imported = request();
        imported.name = "My Imported Server".into();
        imported.version.clear();
        imported.import_token = Some("opaque-token".into());

        let profile = build_profile(imported, "id".into(), "/p".into()).unwrap();
        assert_eq!(profile.name, "My Imported Server");
        assert!(profile.version.is_empty());
    }

    #[test]
    fn managed_directory_creation_is_unique_and_rollback_stays_in_managed_storage() {
        let app_data = TempDirectory::new();
        let server_id = Uuid::new_v4().to_string();
        let created = create_server_directory(app_data.path(), &server_id).unwrap();
        let managed_root = fs::canonicalize(app_data.path().join("servers")).unwrap();
        assert!(created.starts_with(managed_root));
        assert!(created.is_dir());
        assert!(create_server_directory(app_data.path(), &server_id).is_err());

        remove_server_directory(app_data.path(), &server_id).unwrap();
        assert!(!created.exists());
        remove_server_directory(app_data.path(), &server_id).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_to_create_or_remove_through_a_managed_symlink() {
        use std::os::unix::fs::symlink;

        let app_data = TempDirectory::new();
        let outside = TempDirectory::new();
        fs::create_dir(app_data.path().join("servers")).unwrap();
        symlink(outside.path(), app_data.path().join("servers/server-id")).unwrap();

        assert!(create_server_directory(app_data.path(), "server-id").is_err());
        assert!(remove_server_directory(app_data.path(), "server-id").is_err());
        assert!(outside.path().is_dir());
    }

    #[test]
    fn schedule_fields_are_normalized_and_malformed_times_fail_closed() {
        let mut configured = request();
        configured.auto_backup_schedule_type = Some("weekly".into());
        configured.auto_backup_time = Some("09:45".into());
        configured.auto_backup_weekday = Some(6);
        let profile = build_profile(configured, "id".into(), "/p".into()).unwrap();
        assert_eq!(profile.auto_backup_schedule_type.as_deref(), Some("weekly"));
        assert_eq!(profile.auto_backup_time.as_deref(), Some("09:45"));
        assert_eq!(
            profile
                .auto_backup_weekday
                .as_ref()
                .and_then(|value| value.as_u64()),
            Some(6)
        );

        let mut malformed = request();
        malformed.auto_backup_time = Some("25:75".into());
        assert!(build_profile(malformed, "id".into(), "/p".into()).is_err());
        assert!(normalize_backup_time(Some("3:00".into())).is_err());
    }

    #[test]
    fn operation_correlation_requires_uuid_and_ignores_server_identity() {
        assert_eq!(
            validate_operation_id(" 4ddedb77-d536-4570-b647-b9e866e4d327 ").unwrap(),
            "4ddedb77-d536-4570-b647-b9e866e4d327"
        );
        assert!(validate_operation_id("../../server").is_err());
    }
}
