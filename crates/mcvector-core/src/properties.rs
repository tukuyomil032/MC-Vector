//! Managed `server.properties` parsing and editing.
//!
//! Property values stay strings in the shared core. The Tauri adapter may
//! coerce lossless booleans and numbers for its existing UI contract.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::managed_files;
use crate::managed_path::{
    resolve_managed_request, validate_server_id, ManagedPathRequest, ManagedRoot,
};
use crate::operations::{OperationKind, ServerOperationManager};
use crate::registry::{MinecraftServer, ServerRegistry};

pub const MAX_PROPERTIES_BYTES: usize = 1024 * 1024;
const MAX_PROPERTIES_VALUE_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PropertyEntry {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertyLineEnding {
    Lf,
    CrLf,
    Mixed,
    None,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ServerPropertiesSnapshot {
    pub entries: Vec<PropertyEntry>,
    pub line_ending: PropertyLineEnding,
    pub has_bom: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropertiesErrorKind {
    Missing,
    Malformed,
    Invalid,
    NotRegistered,
    Io,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PropertiesError {
    pub kind: PropertiesErrorKind,
    pub message: String,
}

impl PropertiesError {
    fn new(kind: PropertiesErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    fn io(message: impl Into<String>) -> Self {
        Self::new(PropertiesErrorKind::Io, message)
    }
}

impl fmt::Display for PropertiesError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PropertiesError {}

impl From<managed_files::FilesError> for PropertiesError {
    fn from(error: managed_files::FilesError) -> Self {
        Self::io(error.to_string())
    }
}

/// Parses active assignments into a sorted map while retaining values as text.
/// A leading UTF-8 BOM is ignored for key parsing but remains in the source
/// passed to `patch_properties`.
pub fn parse_properties(content: &str) -> Result<BTreeMap<String, String>, PropertiesError> {
    if content.len() > MAX_PROPERTIES_BYTES {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "server.properties exceeds the read size limit",
        ));
    }

    let mut properties = BTreeMap::new();
    for (index, raw_line) in content.split_inclusive('\n').enumerate() {
        let (line, _) = split_line_ending(raw_line);
        let line = if index == 0 {
            line.strip_prefix('\u{feff}').unwrap_or(line)
        } else {
            line
        };
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
            continue;
        }

        let (raw_key, raw_value) = line.split_once('=').ok_or_else(|| {
            PropertiesError::new(
                PropertiesErrorKind::Malformed,
                format!("Malformed server.properties entry on line {}", index + 1),
            )
        })?;
        let key = raw_key.trim();
        if key.is_empty() {
            return Err(PropertiesError::new(
                PropertiesErrorKind::Malformed,
                format!("Empty server.properties key on line {}", index + 1),
            ));
        }
        validate_property_key(key)?;
        let value = raw_value.trim();
        if value.len() > MAX_PROPERTIES_VALUE_BYTES {
            return Err(PropertiesError::new(
                PropertiesErrorKind::Invalid,
                format!(
                    "server.properties value exceeds the limit on line {}",
                    index + 1
                ),
            ));
        }
        properties.insert(key.to_string(), value.to_string());
    }
    Ok(properties)
}

/// Applies a partial update without rewriting untouched lines or their endings.
pub fn patch_properties(
    content: &str,
    updates: &HashMap<String, String>,
) -> Result<String, PropertiesError> {
    if content.len() > MAX_PROPERTIES_BYTES {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "server.properties exceeds the read size limit",
        ));
    }
    for (key, value) in updates {
        validate_property_key(key)?;
        validate_property_value(value)?;
    }

    let current_values = parse_properties(content)?;
    let changed_updates = updates
        .iter()
        .filter(|(key, value)| current_values.get(*key) != Some(*value))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<HashMap<_, _>>();
    if changed_updates.is_empty() {
        return Ok(content.to_string());
    }
    let updates = &changed_updates;

    let newline = preferred_newline(content);
    let mut output = String::with_capacity(content.len() + updates.len() * 32);
    let mut found = std::collections::HashSet::new();

    for (index, line) in content.split_inclusive('\n').enumerate() {
        let (body, ending) = split_line_ending(line);
        let has_bom = index == 0 && body.starts_with('\u{feff}');
        let parse_body = if has_bom {
            &body['\u{feff}'.len_utf8()..]
        } else {
            body
        };
        let trimmed = parse_body.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
            output.push_str(line);
            continue;
        }

        let delimiter = parse_body.find('=').ok_or_else(|| {
            PropertiesError::new(
                PropertiesErrorKind::Malformed,
                format!("Malformed server.properties entry on line {}", index + 1),
            )
        })?;
        let key = parse_body[..delimiter].trim();
        if key.is_empty() {
            return Err(PropertiesError::new(
                PropertiesErrorKind::Malformed,
                format!("Empty server.properties key on line {}", index + 1),
            ));
        }
        validate_property_key(key)?;

        if let Some(value) = updates.get(key) {
            found.insert(key.to_string());
            let original_value = &parse_body[delimiter + 1..];
            if original_value.trim() == value {
                output.push_str(line);
                continue;
            }
            let leading = original_value.len() - original_value.trim_start().len();
            let trailing = original_value.len() - original_value.trim_end().len();
            let trailing_start = original_value.len().saturating_sub(trailing);
            let value_start = body.len() - parse_body.len() + delimiter + 1;
            output.push_str(&body[..value_start]);
            output.push_str(&original_value[..leading.min(trailing_start)]);
            output.push_str(value);
            output.push_str(&original_value[trailing_start..]);
            output.push_str(ending);
        } else {
            output.push_str(line);
        }
    }

    let mut missing = updates
        .iter()
        .filter(|(key, _)| !found.contains(*key))
        .collect::<Vec<_>>();
    missing.sort_by(|(left, _), (right, _)| left.cmp(right));
    for (key, value) in missing {
        if !output.is_empty() && !output.ends_with('\n') {
            output.push_str(newline);
        }
        output.push_str(key);
        output.push('=');
        output.push_str(value);
        output.push_str(newline);
    }

    if output.len() > MAX_PROPERTIES_BYTES {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "Updated server.properties exceeds the write size limit",
        ));
    }
    Ok(output)
}

pub async fn get_server_properties(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
) -> Result<ServerPropertiesSnapshot, PropertiesError> {
    get_server_properties_with_missing_policy(operations, app_data_dir, registry, server_id, false)
        .await
}

/// Tauri's pre-extraction behavior represented a missing file as an empty map.
/// Native callers should use `get_server_properties` and observe `Missing`.
pub async fn get_server_properties_compat(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
) -> Result<ServerPropertiesSnapshot, PropertiesError> {
    get_server_properties_with_missing_policy(operations, app_data_dir, registry, server_id, true)
        .await
}

async fn get_server_properties_with_missing_policy(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
    missing_as_empty: bool,
) -> Result<ServerPropertiesSnapshot, PropertiesError> {
    let operations = operations.clone();
    let server_id = validate_server_id(&server_id)
        .map_err(|message| PropertiesError::new(PropertiesErrorKind::Invalid, message))?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(PropertiesError::io)?;
    tokio::task::spawn_blocking(move || {
        get_server_properties_sync(&app_data_dir, &registry, &server_id, missing_as_empty)
    })
    .await
    .map_err(|error| PropertiesError::io(format!("Properties read task failed: {error}")))?
}

fn get_server_properties_sync(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
    missing_as_empty: bool,
) -> Result<ServerPropertiesSnapshot, PropertiesError> {
    let server_id = validate_server_id(server_id)
        .map_err(|message| PropertiesError::new(PropertiesErrorKind::Invalid, message))?;
    let server = registered_server(registry, &server_id)?;
    validate_managed_server_profile(app_data_dir, &server)?;
    let path = server_properties_path(app_data_dir, &server_id)?;
    let bytes = match read_properties_bytes(&path) {
        Ok(bytes) => bytes,
        Err(error) if missing_as_empty && error.kind == PropertiesErrorKind::Missing => Vec::new(),
        Err(error) => return Err(error),
    };
    let content = String::from_utf8(bytes).map_err(|error| {
        PropertiesError::new(
            PropertiesErrorKind::Malformed,
            format!("server.properties is not valid UTF-8: {error}"),
        )
    })?;
    let entries = parse_properties(&content)?
        .into_iter()
        .map(|(key, value)| PropertyEntry { key, value })
        .collect();
    Ok(ServerPropertiesSnapshot {
        entries,
        line_ending: line_ending(&content),
        has_bom: content.starts_with('\u{feff}'),
    })
}

/// Saves updates atomically and synchronizes the registered server port when
/// `server-port` is included. The function acquires the server operation lock.
pub async fn save_server_properties(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
    updates: HashMap<String, String>,
) -> Result<Option<u16>, PropertiesError> {
    save_server_properties_with_missing_policy(
        operations,
        app_data_dir,
        registry,
        server_id,
        updates,
        false,
        false,
    )
    .await
}

/// Compatibility adapter for Tauri's historical ability to create a missing
/// properties file on save. Native callers should use strict `save_server_properties`.
pub async fn save_server_properties_compat(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
    updates: HashMap<String, String>,
) -> Result<Option<u16>, PropertiesError> {
    save_server_properties_with_missing_policy(
        operations,
        app_data_dir,
        registry,
        server_id,
        updates,
        true,
        true,
    )
    .await
}

async fn save_server_properties_with_missing_policy(
    operations: &ServerOperationManager,
    app_data_dir: PathBuf,
    registry: ServerRegistry,
    server_id: String,
    updates: HashMap<String, String>,
    allow_missing: bool,
    report_submitted_port: bool,
) -> Result<Option<u16>, PropertiesError> {
    let operations = operations.clone();
    let server_id = validate_server_id(&server_id)
        .map_err(|message| PropertiesError::new(PropertiesErrorKind::Invalid, message))?;
    let _guard = operations
        .acquire(&server_id, OperationKind::FileMutation)
        .await
        .map_err(PropertiesError::io)?;
    tokio::task::spawn_blocking(move || {
        save_server_properties_sync(
            &app_data_dir,
            &registry,
            &server_id,
            &updates,
            allow_missing,
            report_submitted_port,
        )
    })
    .await
    .map_err(|error| PropertiesError::io(format!("Properties save task failed: {error}")))?
}

fn save_server_properties_sync(
    app_data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
    updates: &HashMap<String, String>,
    allow_missing: bool,
    report_submitted_port: bool,
) -> Result<Option<u16>, PropertiesError> {
    let server_id = validate_server_id(server_id)
        .map_err(|message| PropertiesError::new(PropertiesErrorKind::Invalid, message))?;
    let mut server = registered_server(registry, &server_id)?;
    validate_managed_server_profile(app_data_dir, &server)?;
    let path = server_properties_path(app_data_dir, &server_id)?;
    let original_bytes = match read_properties_bytes(&path) {
        Ok(bytes) => Some(bytes),
        Err(error) if allow_missing && error.kind == PropertiesErrorKind::Missing => None,
        Err(error) => return Err(error),
    };
    let original_exists = original_bytes.is_some();
    let original_bytes = original_bytes.unwrap_or_default();
    let original = String::from_utf8(original_bytes.clone()).map_err(|error| {
        PropertiesError::new(
            PropertiesErrorKind::Malformed,
            format!("server.properties is not valid UTF-8: {error}"),
        )
    })?;
    // Reject malformed input even when the update map is empty.
    let current_values = parse_properties(&original)?;
    let previous_file_port = current_values
        .get("server-port")
        .and_then(|value| parse_server_port(value).ok());
    let previous_registry_port = server
        .port
        .as_u64()
        .and_then(|value| u16::try_from(value).ok())
        .filter(|port| *port > 0);
    let patched = patch_properties(&original, updates)?;
    let port = updates
        .get("server-port")
        .map(|value| parse_server_port(value))
        .transpose()?;
    if let Some(port) = port {
        server.port = serde_json::Number::from(port);
    }
    let file_port_changed = port.is_some_and(|port| previous_file_port != Some(port));
    let registry_port_changed = port.is_some_and(|port| previous_registry_port != Some(port));

    if patched.as_bytes() != original.as_bytes() || !original_exists {
        managed_files::atomic_write(&path, patched.as_bytes())?;
    }
    if registry_port_changed {
        if let Err(error) = registry.update_servers(&[server]) {
            if patched.as_bytes() != original.as_bytes() || !original_exists {
                if original_exists {
                    if let Err(rollback_error) = managed_files::atomic_write(&path, &original_bytes)
                    {
                        return Err(PropertiesError::io(format!(
                            "Failed to update server registry ({error}) and restore server.properties ({rollback_error})"
                        )));
                    }
                } else if let Err(rollback_error) = fs::remove_file(&path) {
                    return Err(PropertiesError::io(format!(
                        "Failed to update server registry ({error}) and remove newly created server.properties ({rollback_error})"
                    )));
                }
            }
            return Err(PropertiesError::io(format!(
                "Failed to update server registry; server.properties was restored: {error}"
            )));
        }
    }
    Ok(if report_submitted_port {
        port
    } else if file_port_changed || registry_port_changed {
        port
    } else {
        None
    })
}

fn registered_server(
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<MinecraftServer, PropertiesError> {
    registry
        .get_servers()
        .map_err(PropertiesError::io)?
        .into_iter()
        .find(|server| server.id == server_id)
        .ok_or_else(|| {
            PropertiesError::new(
                PropertiesErrorKind::NotRegistered,
                "Server is not registered",
            )
        })
}

fn validate_managed_server_profile(
    app_data_dir: &Path,
    server: &MinecraftServer,
) -> Result<(), PropertiesError> {
    let managed_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server.id.clone()),
        relative_path: String::new(),
    };
    let managed_root = resolve_managed_request(app_data_dir, &managed_request, false)
        .map_err(PropertiesError::io)?;
    let canonical_managed = fs::canonicalize(&managed_root).map_err(|error| {
        PropertiesError::io(format!("Failed to resolve managed server root: {error}"))
    })?;
    let canonical_registered = fs::canonicalize(Path::new(&server.path)).map_err(|error| {
        PropertiesError::new(
            PropertiesErrorKind::Invalid,
            format!("Registered server path cannot be resolved: {error}"),
        )
    })?;
    if canonical_managed != canonical_registered {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "Registered server path does not match its managed server root",
        ));
    }
    Ok(())
}

fn server_properties_path(
    app_data_dir: &Path,
    server_id: &str,
) -> Result<PathBuf, PropertiesError> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: "server.properties".to_string(),
    };
    resolve_managed_request(app_data_dir, &request, false).map_err(PropertiesError::io)
}

fn read_properties_bytes(path: &Path) -> Result<Vec<u8>, PropertiesError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(PropertiesError::new(
                PropertiesErrorKind::Missing,
                "server.properties does not exist",
            ));
        }
        Err(error) => {
            return Err(PropertiesError::io(format!(
                "Failed to inspect server.properties: {error}"
            )));
        }
    };
    if crate::managed_path::is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "server.properties is not a regular file",
        ));
    }
    if metadata.len() > MAX_PROPERTIES_BYTES as u64 {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "server.properties exceeds the read size limit",
        ));
    }
    let file = fs::File::open(path).map_err(|error| {
        PropertiesError::io(format!("Failed to read server.properties: {error}"))
    })?;
    let mut bytes = Vec::with_capacity(metadata.len().min(MAX_PROPERTIES_BYTES as u64) as usize);
    file.take(MAX_PROPERTIES_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            PropertiesError::io(format!("Failed to read server.properties: {error}"))
        })?;
    if bytes.len() > MAX_PROPERTIES_BYTES {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "server.properties exceeds the read size limit",
        ));
    }
    Ok(bytes)
}

fn validate_property_key(key: &str) -> Result<(), PropertiesError> {
    if key.trim().is_empty()
        || key.len() > 256
        || key
            .chars()
            .any(|character| character.is_control() || matches!(character, '=' | '\n' | '\r'))
    {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "Invalid server.properties key",
        ));
    }
    Ok(())
}

fn validate_property_value(value: &str) -> Result<(), PropertiesError> {
    if value.len() > MAX_PROPERTIES_VALUE_BYTES
        || value
            .chars()
            .any(|character| matches!(character, '\n' | '\r'))
    {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "Invalid server.properties value",
        ));
    }
    Ok(())
}

fn parse_server_port(value: &str) -> Result<u16, PropertiesError> {
    let port = value.parse::<u16>().map_err(|_| {
        PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "Server port must be an integer between 1 and 65535",
        )
    })?;
    if port == 0 {
        return Err(PropertiesError::new(
            PropertiesErrorKind::Invalid,
            "Server port must be between 1 and 65535",
        ));
    }
    Ok(port)
}

fn split_line_ending(line: &str) -> (&str, &str) {
    if let Some(body) = line.strip_suffix("\r\n") {
        (body, "\r\n")
    } else if let Some(body) = line.strip_suffix('\n') {
        (body, "\n")
    } else {
        (line, "")
    }
}

fn line_ending(content: &str) -> PropertyLineEnding {
    let mut has_lf = false;
    let mut has_crlf = false;
    let bytes = content.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' {
            if index > 0 && bytes[index - 1] == b'\r' {
                has_crlf = true;
            } else {
                has_lf = true;
            }
        }
    }
    match (has_lf, has_crlf) {
        (true, true) => PropertyLineEnding::Mixed,
        (true, false) => PropertyLineEnding::Lf,
        (false, true) => PropertyLineEnding::CrLf,
        (false, false) => PropertyLineEnding::None,
    }
}

fn preferred_newline(content: &str) -> &'static str {
    if content
        .as_bytes()
        .windows(2)
        .any(|window| window == b"\r\n")
    {
        "\r\n"
    } else {
        "\n"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_server(id: &str, path: &Path) -> MinecraftServer {
        serde_json::from_value(json!({
            "id": id,
            "name": id,
            "version": "1.21",
            "software": "Paper",
            "port": 25565,
            "memory": 2048,
            "path": path,
            "status": "offline"
        }))
        .expect("sample server should deserialize")
    }

    fn registered_server_fixture() -> (tempfile::TempDir, ServerRegistry, PathBuf) {
        let directory = tempfile::tempdir().expect("test directory should be created");
        let app_data_dir = directory.path().join("app");
        let server_dir = app_data_dir.join("servers/server-1");
        fs::create_dir_all(&server_dir).expect("managed server directory should be created");
        let registry = ServerRegistry::open(&app_data_dir).expect("registry should open");
        registry
            .add_server(&sample_server("server-1", &server_dir))
            .expect("server should be registered");
        (directory, registry, server_dir)
    }

    #[tokio::test]
    async fn values_remain_strings_and_snapshot_reports_bom_and_crlf() {
        let (directory, registry, server_dir) = registered_server_fixture();
        let bytes = b"\xef\xbb\xbfserver-port=0042\r\nlevel-seed=1.50\r\npvp=true\r\nempty=\r\n# comment\r\n";
        fs::write(server_dir.join("server.properties"), bytes).expect("fixture should write");

        let operations = ServerOperationManager::default();
        let snapshot = get_server_properties(
            &operations,
            directory.path().join("app"),
            registry,
            "server-1".to_string(),
        )
        .await
        .expect("properties should parse");
        let values = snapshot
            .entries
            .iter()
            .map(|entry| (entry.key.as_str(), entry.value.as_str()))
            .collect::<BTreeMap<_, _>>();
        assert_eq!(values["server-port"], "0042");
        assert_eq!(values["level-seed"], "1.50");
        assert_eq!(values["pvp"], "true");
        assert_eq!(values["empty"], "");
        assert!(snapshot.has_bom);
        assert_eq!(snapshot.line_ending, PropertyLineEnding::CrLf);
    }

    #[test]
    fn no_op_patch_is_byte_identical_and_partial_updates_preserve_formatting() {
        let original = "\u{feff}# header\r\n\r\nserver-port = 25565\r\npvp=true\r\nunknown=value=with=equals\r\n";
        assert_eq!(
            patch_properties(original, &HashMap::new()).unwrap(),
            original
        );

        let updated = patch_properties(
            original,
            &HashMap::from([
                ("server-port".to_string(), "25566".to_string()),
                ("new-key".to_string(), "new value".to_string()),
            ]),
        )
        .expect("partial update should patch properties");
        assert_eq!(
            updated,
            "\u{feff}# header\r\n\r\nserver-port = 25566\r\npvp=true\r\nunknown=value=with=equals\r\nnew-key=new value\r\n"
        );

        let duplicate_effective_value = "motd=old\n# untouched\nmotd=1.50\n";
        assert_eq!(
            patch_properties(
                duplicate_effective_value,
                &HashMap::from([("motd".to_string(), "1.50".to_string())]),
            )
            .unwrap(),
            duplicate_effective_value
        );
    }

    #[tokio::test]
    async fn missing_and_malformed_files_have_distinct_errors() {
        let (directory, registry, server_dir) = registered_server_fixture();
        let app_data_dir = directory.path().join("app");
        let operations = ServerOperationManager::default();
        assert_eq!(
            get_server_properties(
                &operations,
                app_data_dir.clone(),
                registry.clone(),
                "server-1".to_string(),
            )
            .await
            .unwrap_err()
            .kind,
            PropertiesErrorKind::Missing
        );

        fs::write(
            server_dir.join("server.properties"),
            b"valid=true\ninvalid-line\n",
        )
        .expect("malformed fixture should write");
        assert_eq!(
            get_server_properties(&operations, app_data_dir, registry, "server-1".to_string(),)
                .await
                .unwrap_err()
                .kind,
            PropertiesErrorKind::Malformed
        );
    }

    #[tokio::test]
    async fn saves_partial_updates_and_syncs_registry_port() {
        let (directory, registry, server_dir) = registered_server_fixture();
        let app_data_dir = directory.path().join("app");
        let path = server_dir.join("server.properties");
        let original = b"\xef\xbb\xbf# config\r\nserver-port=25565\r\npvp=true\r\nunknown=keep\r\n";
        fs::write(&path, original).expect("fixture should write");

        let operations = ServerOperationManager::default();
        let result = save_server_properties(
            &operations,
            app_data_dir,
            registry.clone(),
            "server-1".to_string(),
            HashMap::from([
                ("server-port".to_string(), "25566".to_string()),
                ("pvp".to_string(), "false".to_string()),
            ]),
        )
        .await
        .expect("properties should save");
        assert_eq!(result, Some(25566));
        assert_eq!(
            fs::read(&path).expect("saved properties should read"),
            b"\xef\xbb\xbf# config\r\nserver-port=25566\r\npvp=false\r\nunknown=keep\r\n"
        );
        assert_eq!(registry.get_servers().unwrap()[0].port, 25566.into());
        assert_eq!(
            save_server_properties(
                &operations,
                directory.path().join("app"),
                registry.clone(),
                "server-1".to_string(),
                HashMap::from([("server-port".to_string(), "25566".to_string())]),
            )
            .await
            .expect("same port should save"),
            None
        );
    }

    #[tokio::test]
    async fn full_map_save_keeps_crlf_bom_comments_empty_and_string_values_byte_identical() {
        let (directory, registry, server_dir) = registered_server_fixture();
        let app_data_dir = directory.path().join("app");
        let path = server_dir.join("server.properties");
        let original = b"\xef\xbb\xbf# server config\r\n\r\nserver-port=25565\r\ncustom.id=0042\r\ncustom.decimal=1.50\r\npvp=true\r\nmotd=\r\nrcon.password=test=secret\r\n";
        fs::write(&path, original).expect("fixture should write");

        let operations = ServerOperationManager::default();
        let snapshot = get_server_properties(
            &operations,
            app_data_dir.clone(),
            registry.clone(),
            "server-1".to_string(),
        )
        .await
        .expect("properties should parse");
        let updates = snapshot
            .entries
            .into_iter()
            .map(|entry| (entry.key, entry.value))
            .collect();
        let result = save_server_properties(
            &operations,
            app_data_dir,
            registry.clone(),
            "server-1".to_string(),
            updates,
        )
        .await
        .expect("full map should save");

        assert_eq!(result, None);
        assert_eq!(fs::read(&path).expect("saved file should read"), original);
        assert_eq!(registry.get_servers().unwrap()[0].port, 25565.into());
    }

    #[tokio::test]
    async fn tauri_compatibility_keeps_missing_file_get_and_save_behavior() {
        let (directory, registry, server_dir) = registered_server_fixture();
        let app_data_dir = directory.path().join("app");
        let operations = ServerOperationManager::default();

        let snapshot = get_server_properties_compat(
            &operations,
            app_data_dir.clone(),
            registry.clone(),
            "server-1".to_string(),
        )
        .await
        .expect("compatibility read should return an empty snapshot");
        assert!(snapshot.entries.is_empty());
        assert!(!snapshot.has_bom);
        assert_eq!(snapshot.line_ending, PropertyLineEnding::None);

        let saved = save_server_properties_compat(
            &operations,
            app_data_dir,
            registry,
            "server-1".to_string(),
            HashMap::from([
                ("motd".to_string(), "created".to_string()),
                ("server-port".to_string(), "25565".to_string()),
            ]),
        )
        .await
        .expect("compatibility save should create the file");
        assert_eq!(saved, Some(25565));
        assert_eq!(
            fs::read(server_dir.join("server.properties")).unwrap(),
            b"motd=created\nserver-port=25565\n"
        );
    }

    #[test]
    fn registry_update_failure_restores_previous_properties_bytes() {
        let (directory, registry, server_dir) = registered_server_fixture();
        let app_data_dir = directory.path().join("app");
        let path = server_dir.join("server.properties");
        let original = b"# preserve\r\nserver-port=25565\r\n";
        fs::write(&path, original).expect("fixture should write");
        let connection = rusqlite::Connection::open(app_data_dir.join("server-registry.sqlite3"))
            .expect("registry database should open");
        connection
            .execute_batch(
                "CREATE TRIGGER reject_server_profile_update BEFORE UPDATE ON server_registry_entries BEGIN SELECT RAISE(FAIL, 'test failure'); END;",
            )
            .expect("failure trigger should be created");

        let result = save_server_properties_sync(
            &app_data_dir,
            &registry,
            "server-1",
            &HashMap::from([("server-port".to_string(), "25566".to_string())]),
            false,
            false,
        );
        assert!(result.is_err());
        assert_eq!(fs::read(path).expect("restored file should read"), original);
        assert_eq!(registry.get_servers().unwrap()[0].port, 25565.into());
    }
}
