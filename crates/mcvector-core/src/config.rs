//! The shared `config.json` (DATA-003).
//!
//! The Tauri edition reads and writes this file through tauri-plugin-store as a
//! plain JSON object of key → value. Writes here change one key at a time and
//! keep every other key, including ones this edition does not know (DATA-005).

use std::io::Write;
use std::path::Path;

use serde_json::Value;

/// File name of the shared config inside the data root.
pub const CONFIG_FILE: &str = "config.json";

/// Keys of the app settings both editions share.
pub const LOCALE_KEY: &str = "locale";
pub const UPDATE_CHANNEL_KEY: &str = "updateChannel";
pub const ALLOW_UNVERIFIED_PLUGIN_DOWNLOADS_KEY: &str = "allowUnverifiedPluginDownloads";

/// App settings shown in the Native settings window, with the Tauri defaults
/// for missing or invalid values (React `normalizeUpdateChannel`, download.rs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppSettings {
    pub locale: Option<String>,
    /// `"stable"` or `"beta"`.
    pub update_channel: String,
    pub allow_unverified_plugin_downloads: bool,
}

pub fn app_settings(data_dir: &Path) -> Result<AppSettings, String> {
    let config = read_config(data_dir)?;
    Ok(AppSettings {
        locale: locale(data_dir),
        update_channel: match config.get(UPDATE_CHANNEL_KEY).and_then(Value::as_str) {
            Some("beta") => "beta".to_string(),
            _ => "stable".to_string(),
        },
        allow_unverified_plugin_downloads: matches!(
            config.get(ALLOW_UNVERIFIED_PLUGIN_DOWNLOADS_KEY),
            Some(Value::Bool(true))
        ),
    })
}

/// Sets one key and keeps the rest of the file. The write is atomic (temp file
/// + rename), and a config that cannot be parsed is never overwritten.
pub fn set_value(data_dir: &Path, key: &str, value: Value) -> Result<(), String> {
    let mut config = read_config(data_dir)?;
    config.insert(key.to_string(), value);
    let bytes = serde_json::to_vec_pretty(&Value::Object(config))
        .map_err(|error| format!("config.json could not be encoded: {error}"))?;

    std::fs::create_dir_all(data_dir)
        .map_err(|error| format!("config.json could not be written: {}", error.kind()))?;
    let path = data_dir.join(CONFIG_FILE);
    let temp = data_dir.join(format!(".{CONFIG_FILE}.{}.tmp", std::process::id()));
    let write = || -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        std::fs::rename(&temp, &path)
    };
    write().map_err(|error| {
        let _ = std::fs::remove_file(&temp);
        format!("config.json could not be written: {}", error.kind())
    })
}

/// Validated setters for the shared settings.
pub fn set_locale(data_dir: &Path, locale: &str) -> Result<(), String> {
    match locale {
        "en" | "ja" => set_value(data_dir, LOCALE_KEY, Value::String(locale.to_string())),
        _ => Err(format!("Unsupported locale: {locale}")),
    }
}

pub fn set_update_channel(data_dir: &Path, channel: &str) -> Result<(), String> {
    match channel {
        "stable" | "beta" => set_value(
            data_dir,
            UPDATE_CHANNEL_KEY,
            Value::String(channel.to_string()),
        ),
        _ => Err(format!("Unsupported update channel: {channel}")),
    }
}

pub fn set_allow_unverified_plugin_downloads(data_dir: &Path, enabled: bool) -> Result<(), String> {
    set_value(
        data_dir,
        ALLOW_UNVERIFIED_PLUGIN_DOWNLOADS_KEY,
        Value::Bool(enabled),
    )
}

/// Reads the whole config object. A missing file is an empty object; a file
/// that is not a JSON object is an error, never silently replaced.
pub fn read_config(data_dir: &Path) -> Result<serde_json::Map<String, Value>, String> {
    let path = data_dir.join(CONFIG_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(serde_json::Map::new())
        }
        Err(error) => return Err(format!("config.json could not be read: {}", error.kind())),
    };
    match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err("config.json is not a JSON object".to_string()),
        Err(error) => Err(format!("config.json is not valid JSON: {error}")),
    }
}

/// The UI locale stored by either edition (`"en"` or `"ja"`). None when the
/// key is missing, unsupported, or the file cannot be read.
pub fn locale(data_dir: &Path) -> Option<String> {
    let config = read_config(data_dir).ok()?;
    match config.get("locale")?.as_str()? {
        locale @ ("en" | "ja") => Some(locale.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setters_change_one_key_and_keep_unknown_keys() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(CONFIG_FILE),
            br#"{"theme":"dark","console-history:server-1":["list"],"liquidGlassEnabled":true}"#,
        )
        .unwrap();

        set_locale(dir.path(), "ja").unwrap();
        set_update_channel(dir.path(), "beta").unwrap();
        set_allow_unverified_plugin_downloads(dir.path(), true).unwrap();

        let config = read_config(dir.path()).unwrap();
        assert_eq!(config["theme"], "dark");
        assert_eq!(config["console-history:server-1"][0], "list");
        assert_eq!(config["liquidGlassEnabled"], true);
        assert_eq!(
            app_settings(dir.path()).unwrap(),
            AppSettings {
                locale: Some("ja".into()),
                update_channel: "beta".into(),
                allow_unverified_plugin_downloads: true,
            }
        );
        // No temp file is left behind.
        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn defaults_and_invalid_values() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            app_settings(dir.path()).unwrap(),
            AppSettings {
                locale: None,
                update_channel: "stable".into(),
                allow_unverified_plugin_downloads: false,
            }
        );
        assert!(set_locale(dir.path(), "fr").is_err());
        assert!(set_update_channel(dir.path(), "nightly").is_err());
    }

    #[test]
    fn a_corrupt_config_is_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), b"{not json").unwrap();
        assert!(set_locale(dir.path(), "en").is_err());
        assert_eq!(
            std::fs::read(dir.path().join(CONFIG_FILE)).unwrap(),
            b"{not json"
        );
    }

    #[test]
    fn missing_config_is_empty_and_has_no_locale() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_config(dir.path()).unwrap().is_empty());
        assert_eq!(locale(dir.path()), None);
    }

    #[test]
    fn reads_supported_locale_only() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(CONFIG_FILE),
            br#"{"locale":"ja","theme":"dark"}"#,
        )
        .unwrap();
        assert_eq!(locale(dir.path()).as_deref(), Some("ja"));
        std::fs::write(dir.path().join(CONFIG_FILE), br#"{"locale":"fr"}"#).unwrap();
        assert_eq!(locale(dir.path()), None);
    }

    #[test]
    fn non_object_config_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), b"[1,2]").unwrap();
        assert!(read_config(dir.path()).is_err());
        assert_eq!(locale(dir.path()), None);
    }
}
