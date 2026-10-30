use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::recovery_record::RecoveryRecord;
use crate::state::operation_manager::{OperationKind, ServerOperationManager};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

const MIGRATION_ID: &str = "server-registry-v1";
const DATABASE_FILE: &str = "server-registry.sqlite3";

pub type JsonNumber = serde_json::Number;

fn default_server_status() -> String {
    "offline".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftServer {
    pub id: String,
    pub name: String,
    pub profile_name: Option<String>,
    pub group_name: Option<String>,
    pub version: String,
    pub software: String,
    pub port: JsonNumber,
    pub memory: JsonNumber,
    pub path: String,
    #[serde(default = "default_server_status")]
    pub status: String,
    pub java_path: Option<String>,
    pub auto_restart_on_crash: Option<bool>,
    pub max_auto_restarts: Option<JsonNumber>,
    pub auto_restart_delay_sec: Option<JsonNumber>,
    pub auto_backup_enabled: Option<bool>,
    pub auto_backup_interval_min: Option<JsonNumber>,
    pub auto_backup_schedule_type: Option<String>,
    pub auto_backup_time: Option<String>,
    pub auto_backup_weekday: Option<JsonNumber>,
    pub auto_backup_retain_count: Option<JsonNumber>,
    pub auto_backup_retain_days: Option<JsonNumber>,
    pub backup_restart_after_safe_backup: Option<bool>,
    pub created_date: Option<String>,
    pub jvm_args: Option<String>,
    pub notify_on_crash: Option<bool>,
    pub notify_on_start: Option<bool>,
    pub notify_on_high_cpu: Option<bool>,
    pub notify_high_cpu_threshold: Option<JsonNumber>,
    pub unavailable_reason: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerTemplate {
    pub id: String,
    pub name: String,
    pub profile_name: Option<String>,
    pub group_name: Option<String>,
    pub version: String,
    pub software: String,
    pub port: JsonNumber,
    pub memory: JsonNumber,
    pub java_path: Option<String>,
    pub auto_restart_on_crash: Option<bool>,
    pub max_auto_restarts: Option<JsonNumber>,
    pub auto_restart_delay_sec: Option<JsonNumber>,
    pub auto_backup_enabled: Option<bool>,
    pub auto_backup_interval_min: Option<JsonNumber>,
    pub auto_backup_schedule_type: Option<String>,
    pub auto_backup_time: Option<String>,
    pub auto_backup_weekday: Option<JsonNumber>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Clone)]
pub struct ServerRegistry {
    connection: Arc<Mutex<Connection>>,
}

impl ServerRegistry {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|error| error.to_string())?;
        let database_path = app_data_dir.join(DATABASE_FILE);
        let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA synchronous = FULL;
                 CREATE TABLE IF NOT EXISTS server_registry_entries (
                    position INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id TEXT NOT NULL,
                    payload TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS server_registry_entries_by_id
                    ON server_registry_entries(server_id);
                 CREATE UNIQUE INDEX IF NOT EXISTS server_registry_entries_unique_id
                    ON server_registry_entries(server_id);
                 CREATE TABLE IF NOT EXISTS server_template_entries (
                    position INTEGER PRIMARY KEY AUTOINCREMENT,
                    template_id TEXT NOT NULL,
                    payload TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS server_template_entries_by_id
                    ON server_template_entries(template_id);
                 CREATE UNIQUE INDEX IF NOT EXISTS server_template_entries_unique_id
                    ON server_template_entries(template_id);
                 CREATE TABLE IF NOT EXISTS registry_migrations (
                    migration_id TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );
                 CREATE TABLE IF NOT EXISTS recovery_journal (
                    record_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                 );",
            )
            .map_err(|error| error.to_string())?;

        let registry = Self {
            connection: Arc::new(Mutex::new(connection)),
        };
        registry.import_legacy_sources(app_data_dir)?;
        Ok(registry)
    }

    fn import_legacy_sources(&self, app_data_dir: &Path) -> Result<(), String> {
        let mut connection = self.lock_connection()?;
        let already_migrated = connection
            .query_row(
                "SELECT 1 FROM registry_migrations WHERE migration_id = ?1",
                [MIGRATION_ID],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();
        if already_migrated {
            return Ok(());
        }

        let (servers, templates) = read_legacy_sources(app_data_dir)?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        for server in &servers {
            insert_server_json(
                &transaction,
                "INSERT INTO server_registry_entries(server_id, payload) VALUES (?1, ?2)",
                server,
            )?;
        }
        for template in &templates {
            insert_json(
                &transaction,
                "INSERT INTO server_template_entries(template_id, payload) VALUES (?1, ?2)",
                &template.id,
                template,
            )?;
        }
        transaction
            .execute(
                "INSERT INTO registry_migrations(migration_id) VALUES (?1)",
                [MIGRATION_ID],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn get_servers(&self) -> Result<Vec<MinecraftServer>, String> {
        self.read_records("SELECT payload FROM server_registry_entries ORDER BY position")
    }

    pub(crate) fn save_recovery_record(&self, record: &RecoveryRecord) -> Result<(), String> {
        let payload = serde_json::to_string(record).map_err(|error| error.to_string())?;
        self.lock_connection()?
            .execute(
                "INSERT INTO recovery_journal(record_id, payload) VALUES (?1, ?2)
                 ON CONFLICT(record_id) DO UPDATE SET payload = excluded.payload",
                params![record.id, payload],
            )
            .map_err(|error| format!("Could not persist recovery journal: {error}"))?;
        Ok(())
    }

    pub(crate) fn recovery_records(&self) -> Result<Vec<RecoveryRecord>, String> {
        let connection = self.lock_connection()?;
        let mut statement = connection
            .prepare("SELECT payload FROM recovery_journal ORDER BY record_id")
            .map_err(|error| format!("Could not read recovery journal: {error}"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Could not read recovery journal: {error}"))?;
        rows.map(|row| {
            let payload = row.map_err(|error| error.to_string())?;
            serde_json::from_str(&payload)
                .map_err(|error| format!("Recovery journal contains an invalid record: {error}"))
        })
        .collect()
    }

    pub(crate) fn delete_recovery_record(&self, record_id: &str) -> Result<(), String> {
        self.lock_connection()?
            .execute(
                "DELETE FROM recovery_journal WHERE record_id = ?1",
                [record_id],
            )
            .map_err(|error| format!("Could not clear recovered journal: {error}"))?;
        Ok(())
    }

    pub fn add_server(&self, server: &MinecraftServer) -> Result<(), String> {
        validate_registry_id(&server.id, "Server")?;
        let mut connection = self.lock_connection()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        let exists = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM server_registry_entries WHERE server_id = ?1)",
                [&server.id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| error.to_string())?;
        if exists {
            return Err("A server with this ID already exists".to_string());
        }
        insert_server_json(
            &transaction,
            "INSERT INTO server_registry_entries(server_id, payload) VALUES (?1, ?2)",
            server,
        )?;
        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn update_server(&self, server: &MinecraftServer) -> Result<bool, String> {
        validate_registry_id(&server.id, "Server")?;
        let connection = self.lock_connection()?;
        let payload = server_profile_json(server)?;
        let changed = connection
            .execute(
                "UPDATE server_registry_entries
                 SET payload = ?1
                 WHERE position = (
                    SELECT position FROM server_registry_entries
                    WHERE server_id = ?2 ORDER BY position LIMIT 1
                 )",
                params![payload, server.id],
            )
            .map_err(|error| error.to_string())?;
        Ok(changed > 0)
    }

    pub fn update_servers(&self, servers: &[MinecraftServer]) -> Result<(), String> {
        let mut connection = self.lock_connection()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;

        for server in servers {
            validate_registry_id(&server.id, "Server")?;
            let payload = server_profile_json(server)?;
            let changed = transaction
                .execute(
                    "UPDATE server_registry_entries
                     SET payload = ?1
                     WHERE position = (
                        SELECT position FROM server_registry_entries
                        WHERE server_id = ?2 ORDER BY position LIMIT 1
                     )",
                    params![payload, server.id],
                )
                .map_err(|error| error.to_string())?;
            if changed == 0 {
                return Err(format!("Server {} is not registered", server.id));
            }
        }

        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn delete_server(&self, server_id: &str) -> Result<bool, String> {
        validate_registry_id(server_id, "Server")?;
        let connection = self.lock_connection()?;
        let deleted = connection
            .execute(
                "DELETE FROM server_registry_entries WHERE server_id = ?1",
                [server_id],
            )
            .map_err(|error| error.to_string())?;
        Ok(deleted > 0)
    }

    pub fn get_server_templates(&self) -> Result<Vec<ServerTemplate>, String> {
        self.read_records("SELECT payload FROM server_template_entries ORDER BY position")
    }

    pub fn save_server_template(&self, template: &ServerTemplate) -> Result<(), String> {
        validate_registry_id(&template.id, "Server template")?;
        let connection = self.lock_connection()?;
        let payload = serde_json::to_string(template).map_err(|error| error.to_string())?;
        let changed = connection
            .execute(
                "UPDATE server_template_entries
                 SET payload = ?1
                 WHERE position = (
                    SELECT position FROM server_template_entries
                    WHERE template_id = ?2 ORDER BY position LIMIT 1
                 )",
                params![payload, template.id],
            )
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            connection
                .execute(
                    "INSERT INTO server_template_entries(template_id, payload) VALUES (?1, ?2)",
                    params![template.id, payload],
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn delete_server_template(&self, template_id: &str) -> Result<(), String> {
        validate_registry_id(template_id, "Server template")?;
        self.lock_connection()?
            .execute(
                "DELETE FROM server_template_entries WHERE template_id = ?1",
                [template_id],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn read_records<T: DeserializeOwned>(&self, query: &str) -> Result<Vec<T>, String> {
        let connection = self.lock_connection()?;
        let mut statement = connection
            .prepare(query)
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.map(|row| {
            let payload = row.map_err(|error| error.to_string())?;
            serde_json::from_str(&payload).map_err(|error| error.to_string())
        })
        .collect()
    }

    fn lock_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "Server registry database lock is poisoned".to_string())
    }
}

fn validate_registry_id(id: &str, label: &str) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err(format!("{label} ID is empty"));
    }
    if id.len() > 128 {
        return Err(format!("{label} ID is too long"));
    }
    if id.chars().any(char::is_control) {
        return Err(format!("{label} ID contains control characters"));
    }
    if matches!(id, "." | "..") || id.contains(['/', '\\', ':']) {
        return Err(format!("{label} ID must be a single safe identifier"));
    }
    Ok(())
}

fn apply_runtime_statuses(servers: &mut [MinecraftServer], running_server_ids: &HashSet<String>) {
    for server in servers {
        server.status = if running_server_ids.contains(&server.id) {
            "online".to_string()
        } else {
            "offline".to_string()
        };
    }
}

async fn current_running_server_ids(
    server_manager: &super::server::ServerManager,
) -> HashSet<String> {
    server_manager
        .servers
        .lock()
        .await
        .keys()
        .cloned()
        .collect()
}

fn insert_json<T: Serialize>(
    connection: &Connection,
    query: &str,
    id: &str,
    record: &T,
) -> Result<(), String> {
    let payload = serde_json::to_string(record).map_err(|error| error.to_string())?;
    connection
        .execute(query, params![id, payload])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn insert_server_json(
    connection: &Connection,
    query: &str,
    server: &MinecraftServer,
) -> Result<(), String> {
    let payload = server_profile_json(server)?;
    connection
        .execute(query, params![&server.id, payload])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn server_profile_json(server: &MinecraftServer) -> Result<String, String> {
    let mut profile = serde_json::to_value(server).map_err(|error| error.to_string())?;
    if let Some(fields) = profile.as_object_mut() {
        fields.remove("status");
    }
    serde_json::to_string(&profile).map_err(|error| error.to_string())
}

fn read_legacy_sources(
    app_data_dir: &Path,
) -> Result<(Vec<MinecraftServer>, Vec<ServerTemplate>), String> {
    let servers_path = app_data_dir.join("servers.json");
    let servers_value = read_json_if_present(&servers_path)?;
    let servers_label = format!("{} servers", servers_path.display());
    let servers = match servers_value.as_ref() {
        Some(value) => {
            deserialize_legacy_list(value, &["servers"], &servers_label)?.unwrap_or_default()
        }
        None => Vec::new(),
    };

    let embedded_templates = match servers_value.as_ref() {
        Some(value) if value.is_object() => deserialize_legacy_list(
            value,
            &["serverTemplates", "templates"],
            &format!("{} templates", servers_path.display()),
        )?,
        Some(value) if value.is_array() => None,
        Some(value) => deserialize_legacy_list(
            value,
            &["serverTemplates", "templates"],
            &format!("{} templates", servers_path.display()),
        )?,
        None => None,
    };
    let mut templates: Vec<ServerTemplate> = embedded_templates.unwrap_or_default();
    let mut known_template_ids: HashSet<String> = templates
        .iter()
        .map(|template| template.id.clone())
        .collect();
    for template in read_separate_templates(app_data_dir)? {
        if known_template_ids.insert(template.id.clone()) {
            templates.push(template);
        }
    }
    Ok((servers, templates))
}

fn read_separate_templates(app_data_dir: &Path) -> Result<Vec<ServerTemplate>, String> {
    let mut templates = Vec::new();
    for file_name in [
        "templates.json",
        "server-templates.json",
        "serverTemplates.json",
    ] {
        let path = app_data_dir.join(file_name);
        let Some(value) = read_json_if_present(&path)? else {
            continue;
        };
        if let Some(file_templates) =
            deserialize_legacy_list(&value, &["serverTemplates", "templates"], file_name)?
        {
            templates.extend(file_templates);
        }
    }
    Ok(templates)
}

fn read_json_if_present(path: &Path) -> Result<Option<Value>, String> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).map(Some).map_err(|error| {
            format!(
                "Could not parse legacy registry JSON at {}: {error}. The source was left unchanged; repair the JSON or restore a valid backup before restarting.",
                path.display(),
            )
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Could not read legacy registry file {}: {error}",
            path.display()
        )),
    }
}

fn deserialize_legacy_list<T: DeserializeOwned>(
    value: &Value,
    keys: &[&str],
    label: &str,
) -> Result<Option<Vec<T>>, String> {
    let Some(list_value) = find_legacy_list(value, keys) else {
        return Ok(None);
    };
    serde_json::from_value(list_value.clone())
        .map(Some)
        .map_err(|error| format!("Could not import {label}: {error}"))
}

fn find_legacy_list<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    if value.is_array() {
        return Some(value);
    }
    let object = value.as_object()?;
    for key in keys {
        if let Some(list) = object.get(*key) {
            return Some(list);
        }
    }
    object
        .get("data")
        .and_then(|nested| find_legacy_list(nested, keys))
}

#[tauri::command]
pub async fn get_servers(
    registry: State<'_, ServerRegistry>,
    server_manager: State<'_, super::server::ServerManager>,
) -> Result<Vec<MinecraftServer>, String> {
    let registry = registry.inner().clone();
    let mut servers = tauri::async_runtime::spawn_blocking(move || registry.get_servers())
        .await
        .map_err(|error| error.to_string())??;
    let running_server_ids = current_running_server_ids(server_manager.inner()).await;
    apply_runtime_statuses(&mut servers, &running_server_ids);
    Ok(servers)
}

fn legacy_server_directory_name(
    server_path: &str,
    app_data_dir: &Path,
    server_id: &str,
) -> Option<String> {
    let servers_root = app_data_dir.join("servers");
    let path = PathBuf::from(server_path);
    if path.parent() != Some(servers_root.as_path()) {
        return None;
    }
    let directory_name = path.file_name()?.to_str()?;
    if directory_name.is_empty() || directory_name == server_id {
        return None;
    }
    Some(directory_name.to_owned())
}

#[tauri::command]
pub async fn update_server(
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    server: MinecraftServer,
) -> Result<bool, String> {
    let _guard = operations
        .acquire(&server.id, OperationKind::FileMutation)
        .await?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.update_server(&server))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_server_templates(
    registry: State<'_, ServerRegistry>,
) -> Result<Vec<ServerTemplate>, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.get_server_templates())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_server_template(
    registry: State<'_, ServerRegistry>,
    template: ServerTemplate,
) -> Result<ServerTemplate, String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        registry.save_server_template(&template)?;
        Ok(template)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_server_template(
    registry: State<'_, ServerRegistry>,
    template_id: String,
) -> Result<(), String> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || registry.delete_server_template(&template_id))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        apply_runtime_statuses, legacy_server_directory_name, JsonNumber, MinecraftServer,
        ServerRegistry, ServerTemplate, DATABASE_FILE, MIGRATION_ID,
    };
    use rusqlite::Connection;
    use serde_json::Value;
    use std::collections::{HashMap, HashSet};
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    struct TempDirectory(PathBuf);

    impl TempDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("mc-vector-registry-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("create temporary registry directory");
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

    fn sample_server(id: &str, name: &str) -> MinecraftServer {
        MinecraftServer {
            id: id.to_string(),
            name: name.to_string(),
            profile_name: None,
            group_name: None,
            version: "1.21".to_string(),
            software: "Paper".to_string(),
            port: JsonNumber::from(25565),
            memory: JsonNumber::from(2048),
            path: format!("/servers/{id}"),
            status: "offline".to_string(),
            java_path: None,
            auto_restart_on_crash: Some(false),
            max_auto_restarts: Some(JsonNumber::from(3)),
            auto_restart_delay_sec: Some(JsonNumber::from(5)),
            auto_backup_enabled: Some(false),
            auto_backup_interval_min: Some(JsonNumber::from(60)),
            auto_backup_schedule_type: Some("interval".to_string()),
            auto_backup_time: Some("03:00".to_string()),
            auto_backup_weekday: Some(JsonNumber::from(0)),
            auto_backup_retain_count: Some(JsonNumber::from(0)),
            auto_backup_retain_days: Some(JsonNumber::from(0)),
            backup_restart_after_safe_backup: Some(false),
            created_date: Some("2026-10-29T00:00:00.000Z".to_string()),
            jvm_args: None,
            notify_on_crash: Some(false),
            notify_on_start: Some(false),
            notify_on_high_cpu: Some(false),
            notify_high_cpu_threshold: Some(JsonNumber::from_f64(80.0).unwrap()),
            unavailable_reason: None,
            extra: HashMap::new(),
        }
    }

    fn sample_template(id: &str, name: &str) -> ServerTemplate {
        ServerTemplate {
            id: id.to_string(),
            name: name.to_string(),
            profile_name: None,
            group_name: None,
            version: "1.21".to_string(),
            software: "Paper".to_string(),
            port: JsonNumber::from(25565),
            memory: JsonNumber::from(2048),
            java_path: None,
            auto_restart_on_crash: Some(false),
            max_auto_restarts: Some(JsonNumber::from(3)),
            auto_restart_delay_sec: Some(JsonNumber::from(5)),
            auto_backup_enabled: Some(false),
            auto_backup_interval_min: Some(JsonNumber::from(60)),
            auto_backup_schedule_type: Some("interval".to_string()),
            auto_backup_time: Some("03:00".to_string()),
            auto_backup_weekday: Some(JsonNumber::from(0)),
            extra: HashMap::new(),
        }
    }

    #[test]
    fn legacy_directory_detection_only_accepts_direct_managed_children() {
        let app_data = TempDirectory::new();
        let root = app_data.path();
        assert_eq!(
            legacy_server_directory_name(
                root.join("servers/legacy-name").to_str().unwrap(),
                root,
                "server-id"
            )
            .as_deref(),
            Some("legacy-name")
        );
        for path in [
            root.join("servers/server-id"),
            root.join("outside/legacy-name"),
            root.join("servers/nested/legacy-name"),
            root.join("servers/../outside"),
        ] {
            assert_eq!(
                legacy_server_directory_name(path.to_str().unwrap(), root, "server-id"),
                None,
                "unexpected legacy migration candidate: {}",
                path.display()
            );
        }
    }

    #[test]
    fn imports_legacy_servers_and_templates_without_modifying_json_sources() {
        let directory = TempDirectory::new();
        let mut server = serde_json::to_value(sample_server("s1", "Legacy server")).unwrap();
        server["status"] = serde_json::json!("restarting");
        server["autoBackupRetainDays"] = serde_json::json!(1.5);
        server["autoBackupRetainCount"] = serde_json::json!(-2);
        server["legacyExtension"] = serde_json::json!({ "preserve": true });
        let valid_server =
            serde_json::to_value(sample_server("s2", "Second valid server")).unwrap();
        let mut template = serde_json::to_value(sample_template("t1", "Legacy template")).unwrap();
        template["autoBackupIntervalMin"] =
            Value::Number("1.234567890123456789".parse::<JsonNumber>().unwrap());
        template["autoBackupWeekday"] = serde_json::json!(-1.5);
        let valid_template =
            serde_json::to_value(sample_template("t2", "Second valid template")).unwrap();
        let servers_file = serde_json::json!({
            "servers": [server, valid_server],
            "serverTemplates": [template, valid_template],
        });
        let original = serde_json::to_string_pretty(&servers_file).unwrap();
        fs::write(directory.path().join("servers.json"), &original).unwrap();

        let registry = ServerRegistry::open(directory.path()).unwrap();

        let mut imported_servers = registry.get_servers().unwrap();
        assert_eq!(imported_servers.len(), 2);
        assert_eq!(imported_servers[1].name, "Second valid server");
        let imported_server = imported_servers.remove(0);
        assert_eq!(imported_server.name, "Legacy server");
        assert_eq!(imported_server.status, "offline");
        assert_eq!(
            imported_server
                .auto_backup_retain_days
                .as_ref()
                .unwrap()
                .as_f64(),
            Some(1.5)
        );
        assert_eq!(
            imported_server
                .auto_backup_retain_count
                .as_ref()
                .unwrap()
                .as_i64(),
            Some(-2)
        );
        assert_eq!(imported_server.extra["legacyExtension"]["preserve"], true);
        registry.update_server(&imported_server).unwrap();
        assert_eq!(
            registry.get_servers().unwrap()[0].extra["legacyExtension"]["preserve"],
            true
        );
        let mut imported_templates = registry.get_server_templates().unwrap();
        assert_eq!(imported_templates.len(), 2);
        assert_eq!(imported_templates[1].name, "Second valid template");
        assert_eq!(
            imported_templates[0]
                .auto_backup_interval_min
                .as_ref()
                .unwrap()
                .to_string(),
            "1.234567890123456789"
        );
        assert_eq!(
            imported_templates[0]
                .auto_backup_weekday
                .as_ref()
                .unwrap()
                .as_f64(),
            Some(-1.5)
        );
        registry
            .save_server_template(&imported_templates.remove(0))
            .unwrap();
        assert_eq!(
            registry.get_server_templates().unwrap()[0]
                .auto_backup_interval_min
                .as_ref()
                .unwrap()
                .to_string(),
            "1.234567890123456789"
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("servers.json")).unwrap(),
            original
        );
        assert!(directory.path().join(DATABASE_FILE).exists());

        let connection = Connection::open(directory.path().join(DATABASE_FILE)).unwrap();
        let payload: String = connection
            .query_row(
                "SELECT payload FROM server_registry_entries WHERE server_id = 's1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let profile: Value = serde_json::from_str(&payload).unwrap();
        assert!(profile.get("status").is_none());
        assert_eq!(profile["legacyExtension"]["preserve"], true);
        assert_eq!(profile["autoBackupRetainDays"], 1.5);
        assert_eq!(profile["autoBackupRetainCount"], -2);
    }

    #[test]
    fn top_level_server_array_is_not_also_imported_as_templates() {
        let directory = TempDirectory::new();
        let server = serde_json::to_value(sample_server("s1", "Array server")).unwrap();
        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&vec![server]).unwrap(),
        )
        .unwrap();

        let registry = ServerRegistry::open(directory.path()).unwrap();

        assert_eq!(registry.get_servers().unwrap().len(), 1);
        assert!(registry.get_server_templates().unwrap().is_empty());
    }

    #[test]
    fn runtime_status_is_derived_from_running_ids_not_profile_payload() {
        let directory = TempDirectory::new();
        let registry = ServerRegistry::open(directory.path()).unwrap();
        let mut online_profile = sample_server("s1", "Online server");
        online_profile.status = "online".to_string();
        registry.add_server(&online_profile).unwrap();
        online_profile.name = "Updated online server".to_string();
        registry.update_server(&online_profile).unwrap();

        let mut loaded = registry.get_servers().unwrap();
        assert_eq!(loaded[0].status, "offline");
        assert_eq!(loaded[0].name, "Updated online server");

        let running_server_ids = HashSet::from(["s1".to_string()]);
        apply_runtime_statuses(&mut loaded, &running_server_ids);
        assert_eq!(loaded[0].status, "online");
        assert_eq!(
            serde_json::to_value(&loaded[0]).unwrap()["status"],
            "online"
        );
        let running_server_ids = HashSet::new();
        apply_runtime_statuses(&mut loaded, &running_server_ids);
        assert_eq!(loaded[0].status, "offline");

        let connection = Connection::open(directory.path().join(DATABASE_FILE)).unwrap();
        let payload: String = connection
            .query_row(
                "SELECT payload FROM server_registry_entries WHERE server_id = 's1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let profile: Value = serde_json::from_str(&payload).unwrap();
        assert!(profile.get("status").is_none());
    }

    #[test]
    fn add_server_rejects_unsafe_or_duplicate_ids() {
        let directory = TempDirectory::new();
        let registry = ServerRegistry::open(directory.path()).unwrap();
        let server = sample_server("s1", "Server");
        registry.add_server(&server).unwrap();

        assert!(registry
            .add_server(&server)
            .unwrap_err()
            .contains("already exists"));
        let mut unsafe_id = sample_server("../s2", "Unsafe server");
        assert!(registry
            .add_server(&unsafe_id)
            .unwrap_err()
            .contains("safe identifier"));
        unsafe_id.id = "".to_string();
        assert!(registry
            .add_server(&unsafe_id)
            .unwrap_err()
            .contains("empty"));
    }

    #[test]
    fn imports_separate_templates_file_alongside_store_templates() {
        let directory = TempDirectory::new();
        fs::write(
            directory.path().join("servers.json"),
            r#"{"servers":[],"serverTemplates":[]}"#,
        )
        .unwrap();
        fs::write(
            directory.path().join("templates.json"),
            serde_json::to_string(&vec![sample_template("t1", "Separate template")]).unwrap(),
        )
        .unwrap();

        let registry = ServerRegistry::open(directory.path()).unwrap();

        assert_eq!(
            registry.get_server_templates().unwrap()[0].name,
            "Separate template"
        );
    }

    #[test]
    fn migration_is_idempotent_and_keeps_legacy_files_as_recovery_sources() {
        let directory = TempDirectory::new();
        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&serde_json::json!({
                "servers": [sample_server("s1", "Imported")],
                "serverTemplates": []
            }))
            .unwrap(),
        )
        .unwrap();

        let registry = ServerRegistry::open(directory.path()).unwrap();
        registry
            .add_server(&sample_server("s2", "Added after import"))
            .unwrap();
        drop(registry);
        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&serde_json::json!({
                "servers": [sample_server("s1", "Stale source"), sample_server("s3", "Late")],
                "serverTemplates": []
            }))
            .unwrap(),
        )
        .unwrap();

        let registry = ServerRegistry::open(directory.path()).unwrap();
        let servers = registry.get_servers().unwrap();
        assert_eq!(
            servers
                .iter()
                .map(|server| server.name.as_str())
                .collect::<Vec<_>>(),
            ["Imported", "Added after import"]
        );
        assert_eq!(servers.len(), 2);
    }

    #[test]
    fn failed_import_is_atomic_and_can_be_retried() {
        let directory = TempDirectory::new();
        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&serde_json::json!({
                "servers": [sample_server("s1", "Atomic")]
            }))
            .unwrap(),
        )
        .unwrap();
        fs::write(directory.path().join("templates.json"), "{invalid").unwrap();

        assert!(ServerRegistry::open(directory.path()).is_err());
        fs::write(directory.path().join("templates.json"), "[]").unwrap();

        let registry = ServerRegistry::open(directory.path()).unwrap();
        assert_eq!(registry.get_servers().unwrap().len(), 1);
    }

    #[test]
    fn malformed_legacy_server_registry_is_preserved_and_reports_repair_guidance() {
        let directory = TempDirectory::new();
        let path = directory.path().join("servers.json");
        let original = br#"{"servers":[{"id":"s1", BROKEN"#;
        fs::write(&path, original).unwrap();

        let error = match ServerRegistry::open(directory.path()) {
            Ok(_) => panic!("corrupt legacy registry must stop initialization"),
            Err(error) => error,
        };

        assert!(error.contains("Could not parse legacy registry JSON"));
        assert!(error.contains("repair the JSON or restore a valid backup"));
        assert!(error.contains(path.to_string_lossy().as_ref()));
        assert_eq!(fs::read(&path).unwrap(), original);

        let connection = Connection::open(directory.path().join(DATABASE_FILE)).unwrap();
        let imported_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM server_registry_entries", [], |row| {
                row.get(0)
            })
            .unwrap();
        let migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM registry_migrations WHERE migration_id = ?1",
                [MIGRATION_ID],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(imported_count, 0);
        assert_eq!(migration_count, 0);
    }

    #[test]
    fn duplicate_legacy_server_ids_fail_migration_without_marking_it_complete() {
        let directory = TempDirectory::new();
        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&serde_json::json!({
                "servers": [
                    sample_server("duplicate", "First"),
                    sample_server("duplicate", "Second")
                ],
                "serverTemplates": []
            }))
            .unwrap(),
        )
        .unwrap();

        assert!(ServerRegistry::open(directory.path()).is_err());
        let connection = Connection::open(directory.path().join(DATABASE_FILE)).unwrap();
        let migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM registry_migrations WHERE migration_id = ?1",
                [MIGRATION_ID],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(migration_count, 0);

        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&serde_json::json!({
                "servers": [sample_server("duplicate", "Repaired")],
                "serverTemplates": []
            }))
            .unwrap(),
        )
        .unwrap();
        let registry = ServerRegistry::open(directory.path()).unwrap();
        assert_eq!(registry.get_servers().unwrap()[0].name, "Repaired");
    }

    #[test]
    fn duplicate_legacy_template_ids_fail_migration_transactionally() {
        let directory = TempDirectory::new();
        fs::write(
            directory.path().join("servers.json"),
            serde_json::to_string(&serde_json::json!({
                "servers": [],
                "serverTemplates": [
                    sample_template("duplicate", "First"),
                    sample_template("duplicate", "Second")
                ]
            }))
            .unwrap(),
        )
        .unwrap();

        assert!(ServerRegistry::open(directory.path()).is_err());
        let connection = Connection::open(directory.path().join(DATABASE_FILE)).unwrap();
        let registry_counts: (i64, i64) = connection
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM server_registry_entries),
                    (SELECT COUNT(*) FROM server_template_entries)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(registry_counts, (0, 0));
    }

    #[test]
    fn crud_preserves_order_and_updates_or_removes_records_by_id() {
        let directory = TempDirectory::new();
        let registry = ServerRegistry::open(directory.path()).unwrap();
        registry.add_server(&sample_server("s1", "First")).unwrap();
        registry.add_server(&sample_server("s2", "Second")).unwrap();

        let mut updated = sample_server("s1", "Updated");
        updated
            .extra
            .insert("futureField".to_string(), serde_json::json!(true));
        assert!(registry.update_server(&updated).unwrap());
        assert!(!registry
            .update_server(&sample_server("missing", "Missing"))
            .unwrap());
        assert_eq!(registry.get_servers().unwrap()[0].name, "Updated");
        assert_eq!(
            registry.get_servers().unwrap()[0].extra["futureField"],
            true
        );
        assert!(registry.delete_server("s1").unwrap());
        assert!(!registry.delete_server("s1").unwrap());
        assert_eq!(registry.get_servers().unwrap()[0].id, "s2");

        registry
            .save_server_template(&sample_template("t1", "Template"))
            .unwrap();
        registry
            .save_server_template(&sample_template("t1", "Updated template"))
            .unwrap();
        assert_eq!(
            registry.get_server_templates().unwrap()[0].name,
            "Updated template"
        );
        registry.delete_server_template("t1").unwrap();
        assert!(registry.get_server_templates().unwrap().is_empty());
    }
}
