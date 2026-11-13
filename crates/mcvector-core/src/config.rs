//! Read access to the shared `config.json` (DATA-003).
//!
//! The Tauri edition writes this file through tauri-plugin-store as a plain
//! JSON object of key → value. This module only reads it; writes come later
//! with the settings screen and must keep unknown keys (DATA-005).

use std::path::Path;

use serde_json::Value;

/// File name of the shared config inside the data root.
pub const CONFIG_FILE: &str = "config.json";

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
    fn missing_config_is_empty_and_has_no_locale() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_config(dir.path()).unwrap().is_empty());
        assert_eq!(locale(dir.path()), None);
    }

    #[test]
    fn reads_supported_locale_only() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(CONFIG_FILE), br#"{"locale":"ja","theme":"dark"}"#).unwrap();
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
