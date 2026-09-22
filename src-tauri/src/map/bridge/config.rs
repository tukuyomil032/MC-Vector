//! Managed Paper bridge configuration and protocol validation.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) const MAP_PROTOCOL_VERSION: u32 = 2;

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return metadata.file_attributes() & 0x0400 != 0;
    }

    #[cfg(not(windows))]
    false
}

#[derive(Clone, Debug)]
pub(crate) struct BridgeConfigIssue {
    pub(crate) state: String,
    pub(crate) reason: String,
    pub(crate) message: String,
    pub(crate) managed_by: Option<String>,
    pub(crate) server_id: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) enum BridgeConfigInspection {
    Missing,
    Valid(BridgeConfig),
    Invalid(BridgeConfigIssue),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BridgeConfig {
    pub(crate) managed_by: String,
    pub(crate) schema_version: u32,
    pub(crate) server_id: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) token: String,
    pub(crate) protocol_version: u32,
    pub(crate) plugin_version: String,
    pub(crate) minecraft_version: String,
}
fn config_issue(
    state: &str,
    reason: &str,
    message: impl Into<String>,
    values: &HashMap<String, String>,
) -> BridgeConfigInspection {
    BridgeConfigInspection::Invalid(BridgeConfigIssue {
        state: state.to_string(),
        reason: reason.to_string(),
        message: message.into(),
        managed_by: values.get("managed-by").cloned(),
        server_id: values.get("server-id").cloned(),
    })
}

pub(crate) fn config_read_error(message: impl Into<String>) -> BridgeConfigInspection {
    BridgeConfigInspection::Invalid(BridgeConfigIssue {
        state: "invalid".to_string(),
        reason: "parse_error".to_string(),
        message: message.into(),
        managed_by: None,
        server_id: None,
    })
}

pub(crate) fn inspect_bridge_config(
    path: &Path,
    expected_server_id: Option<&str>,
) -> Result<BridgeConfigInspection, String> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if is_link_or_reparse_point(&metadata) {
            return Err(format!(
                "Refusing to read a symbolic link or reparse point: {}",
                path.display()
            ));
        }
    }
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(BridgeConfigInspection::Missing)
        }
        Err(error) => return Err(format!("Failed to read map bridge configuration: {error}")),
    };

    let mut values = HashMap::<String, String>::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            return Ok(config_issue(
                "invalid",
                "parse_error",
                "Map bridge configuration could not be parsed",
                &values,
            ));
        };
        let value = value.trim().trim_matches(['\'', '"']);
        values.insert(key.trim().to_string(), value.to_string());
    }

    let managed_by = values.get("managed-by").cloned();
    let configured_server_id = values.get("server-id").cloned();
    if managed_by.as_deref() != Some("MC-Vector") {
        return Ok(config_issue(
            "conflict",
            "managed_by_mismatch",
            "The map bridge configuration is not managed by MC-Vector",
            &values,
        ));
    }
    if expected_server_id
        .is_some_and(|server_id| configured_server_id.as_deref() != Some(server_id))
    {
        return Ok(config_issue(
            "conflict",
            "server_mismatch",
            "The map bridge configuration belongs to another server",
            &values,
        ));
    }

    if values
        .get("schema-version")
        .and_then(|value| value.parse::<u32>().ok())
        != Some(1)
    {
        return Ok(config_issue(
            "stale",
            "schema_mismatch",
            "The map bridge configuration uses an unsupported schema version",
            &values,
        ));
    }

    let required = |key: &str| {
        values
            .get(key)
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| format!("Map bridge configuration is missing {key}"))
    };
    let port = match required("port").and_then(|value| {
        value
            .parse::<u16>()
            .map_err(|_| "Map bridge port is invalid".to_string())
    }) {
        Ok(port) => port,
        Err(message) => {
            return Ok(config_issue("stale", "parse_error", message, &values));
        }
    };
    let protocol_version = match required("protocol-version").and_then(|value| {
        value
            .parse::<u32>()
            .map_err(|_| "Map bridge protocol version is invalid".to_string())
    }) {
        Ok(protocol_version) => protocol_version,
        Err(message) => {
            return Ok(config_issue("stale", "parse_error", message, &values));
        }
    };
    let schema_version = match required("schema-version").and_then(|value| {
        value
            .parse::<u32>()
            .map_err(|_| "Map bridge schema version is invalid".to_string())
    }) {
        Ok(schema_version) => schema_version,
        Err(message) => {
            return Ok(config_issue("stale", "schema_mismatch", message, &values));
        }
    };
    let config = match (|| {
        Ok::<_, String>(BridgeConfig {
            managed_by: required("managed-by")?,
            schema_version,
            server_id: required("server-id")?,
            host: required("host")?,
            port,
            token: required("token")?,
            protocol_version,
            plugin_version: required("plugin-version")?,
            minecraft_version: required("minecraft-version")?,
        })
    })() {
        Ok(config) => config,
        Err(message) => {
            return Ok(config_issue("stale", "missing_required", message, &values));
        }
    };

    if config.host != "127.0.0.1" || config.port == 0 {
        return Ok(config_issue(
            "stale",
            "host_or_port_invalid",
            "The map bridge must bind to a valid loopback address",
            &values,
        ));
    }
    if config.protocol_version != MAP_PROTOCOL_VERSION {
        return Ok(config_issue(
            "stale",
            "protocol_mismatch",
            "The map bridge configuration uses an older protocol version",
            &values,
        ));
    }
    if config.token.len() < 16 {
        return Ok(config_issue(
            "stale",
            "token_invalid",
            "The map bridge authentication token is missing or too short",
            &values,
        ));
    }

    Ok(BridgeConfigInspection::Valid(config))
}

pub(crate) fn read_bridge_config(path: &Path) -> Result<Option<BridgeConfig>, String> {
    match inspect_bridge_config(path, None) {
        Err(error) => {
            log::debug!("Map bridge configuration is unavailable: {error}");
            Ok(None)
        }
        Ok(BridgeConfigInspection::Missing) => Ok(None),
        Ok(BridgeConfigInspection::Valid(config)) => Ok(Some(config)),
        Ok(BridgeConfigInspection::Invalid(_)) => Ok(None),
    }
}

pub(crate) fn validate_bridge_config(config: &BridgeConfig, server_id: &str) -> Result<(), String> {
    if config.managed_by != "MC-Vector" || config.schema_version != 1 {
        return Err("Map bridge configuration is not managed by MC-Vector".to_string());
    }
    if config.server_id != server_id {
        return Err("Map bridge configuration belongs to another server".to_string());
    }
    if config.host != "127.0.0.1" || config.port == 0 {
        return Err("Map bridge must bind to a valid loopback address".to_string());
    }
    if config.protocol_version != MAP_PROTOCOL_VERSION || config.token.len() < 16 {
        return Err("Map bridge configuration has an unsupported protocol or token".to_string());
    }
    Ok(())
}

pub(crate) fn allocate_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Failed to allocate a map bridge port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Failed to inspect allocated map bridge port: {error}"))
}

pub(crate) fn write_bridge_config(
    path: &Path,
    server_id: &str,
    plugin_version: &str,
) -> Result<BridgeConfig, String> {
    match inspect_bridge_config(path, Some(server_id))? {
        BridgeConfigInspection::Valid(existing) if existing.plugin_version == plugin_version => {
            return Ok(existing)
        }
        BridgeConfigInspection::Valid(_) => {}
        BridgeConfigInspection::Invalid(issue)
            if issue.managed_by.as_deref() == Some("MC-Vector")
                && issue.server_id.as_deref() == Some(server_id) => {}
        BridgeConfigInspection::Invalid(issue) => return Err(issue.message),
        BridgeConfigInspection::Missing => {}
    }

    let config = BridgeConfig {
        managed_by: "MC-Vector".to_string(),
        schema_version: 1,
        server_id: server_id.to_string(),
        host: "127.0.0.1".to_string(),
        port: allocate_port()?,
        token: Uuid::new_v4().to_string(),
        protocol_version: MAP_PROTOCOL_VERSION,
        plugin_version: plugin_version.to_string(),
        minecraft_version: "1.21.x".to_string(),
    };

    let content = format!(
        "managed-by: MC-Vector\nschema-version: 1\nserver-id: {}\nhost: 127.0.0.1\nport: {}\ntoken: {}\nprotocol-version: {}\nplugin-version: {}\nminecraft-version: 1.21.x\n",
        config.server_id,
        config.port,
        config.token,
        config.protocol_version,
        config.plugin_version,
    );
    let temporary = path.with_extension(format!("yml.tmp-{}", Uuid::new_v4()));
    fs::write(&temporary, content)
        .map_err(|error| format!("Failed to stage map bridge configuration: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Failed to replace map bridge configuration: {error}"
        ));
    }
    Ok(config)
}
