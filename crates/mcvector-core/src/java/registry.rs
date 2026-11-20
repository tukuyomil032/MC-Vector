//! The Java runtime registry: the `javaVersions` key of the shared
//! `config.json`. The Tauri edition reads and writes it through
//! tauri-plugin-store, the Native edition through [`ConfigJavaRegistry`]; both
//! keep the same JSON shape (`version`, `path`, `name`, optional `isCustom`).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Key of the runtime list in `config.json`.
pub const JAVA_REGISTRY_KEY: &str = "javaVersions";

/// One registered runtime. `path` is the Java home for app-managed downloads
/// and the executable (or home) the user picked for custom runtimes.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    pub version: u16,
    pub path: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_custom: Option<bool>,
}

/// Raw storage of the registry value. Implementations only move the JSON
/// value; decoding and validation stay in this module.
pub trait JavaRegistryStore: Send + Sync {
    /// The stored value, or `None` when the key is missing.
    fn load(&self) -> Result<Option<Value>, String>;
    /// Replaces the stored value. A failed save must leave the previous value.
    fn save(&self, value: Value) -> Result<(), String>;
}

/// The registry inside `<data_dir>/config.json`, written one key at a time.
#[derive(Clone, Debug)]
pub struct ConfigJavaRegistry {
    data_dir: PathBuf,
}

impl ConfigJavaRegistry {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
        }
    }
}

impl JavaRegistryStore for ConfigJavaRegistry {
    fn load(&self) -> Result<Option<Value>, String> {
        Ok(crate::config::read_config(&self.data_dir)?
            .get(JAVA_REGISTRY_KEY)
            .cloned())
    }

    fn save(&self, value: Value) -> Result<(), String> {
        crate::config::set_value(&self.data_dir, JAVA_REGISTRY_KEY, value)
    }
}

pub fn validate_java_versions(versions: &[JavaVersion]) -> Result<(), String> {
    let mut seen = HashSet::with_capacity(versions.len());
    for version in versions {
        if !(1..=99).contains(&version.version) {
            return Err(format!(
                "Java registry contains unsupported major version {}",
                version.version
            ));
        }
        if version.path.trim().is_empty() || version.path.len() > 32_768 {
            return Err("Java registry contains an invalid installation path".to_string());
        }
        if version.name.trim().is_empty() || version.name.len() > 256 {
            return Err("Java registry contains an invalid display name".to_string());
        }
        if !seen.insert(version.version) {
            return Err(format!(
                "Java registry contains duplicate major version {}",
                version.version
            ));
        }
    }
    Ok(())
}

/// Missing or `null` is an empty registry; anything malformed is an error and
/// the stored value is left untouched.
pub fn decode_java_versions(value: Option<Value>) -> Result<Vec<JavaVersion>, String> {
    let value = match value {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(value) => value,
    };
    let versions: Vec<JavaVersion> = serde_json::from_value(value).map_err(|error| {
        format!("Java registry data is invalid; it was left untouched: {error}")
    })?;
    validate_java_versions(&versions)?;
    Ok(versions)
}

pub fn read_java_versions(store: &dyn JavaRegistryStore) -> Result<Vec<JavaVersion>, String> {
    decode_java_versions(store.load()?)
}

pub fn write_java_versions(
    store: &dyn JavaRegistryStore,
    versions: &[JavaVersion],
) -> Result<(), String> {
    validate_java_versions(versions)?;
    let value = serde_json::to_value(versions)
        .map_err(|error| format!("Failed to serialize Java registry: {error}"))?;
    store.save(value)
}

/// Replaces the entry with the same major version, or appends it.
pub fn upsert_java_version(versions: &mut Vec<JavaVersion>, entry: JavaVersion) {
    if let Some(existing) = versions
        .iter_mut()
        .find(|version| version.version == entry.version)
    {
        *existing = entry;
    } else {
        versions.push(entry);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(version: u16, path: &str, is_custom: Option<bool>) -> JavaVersion {
        JavaVersion {
            version,
            path: path.to_string(),
            name: format!("Java {version}"),
            is_custom,
        }
    }

    #[test]
    fn missing_java_registry_defaults_to_empty_without_writing_a_value() {
        assert_eq!(
            decode_java_versions(None).unwrap(),
            Vec::<JavaVersion>::new()
        );
        assert_eq!(
            decode_java_versions(Some(Value::Null)).unwrap(),
            Vec::<JavaVersion>::new()
        );
    }

    #[test]
    fn legacy_java_registry_shape_and_custom_entries_are_preserved() {
        let value = serde_json::json!([
            { "version": 21, "path": "/managed/jdk-21", "name": "Java 21" },
            { "version": 17, "path": "/custom/java", "name": "Custom 17", "isCustom": true }
        ]);
        let versions = decode_java_versions(Some(value.clone())).unwrap();
        assert_eq!(versions[0], entry(21, "/managed/jdk-21", None));
        assert_eq!(versions[1].is_custom, Some(true));
        assert_eq!(serde_json::to_value(&versions).unwrap(), value);
    }

    #[test]
    fn malformed_or_ambiguous_java_registry_data_is_rejected_without_normalizing_it() {
        assert!(decode_java_versions(Some(serde_json::json!({ "version": 21 }))).is_err());
        assert!(decode_java_versions(Some(serde_json::json!([
            { "version": 21, "path": "/one", "name": "One" },
            { "version": 21, "path": "/two", "name": "Two" }
        ])))
        .is_err());
        assert!(decode_java_versions(Some(serde_json::json!([
            { "version": 0, "path": "/invalid", "name": "Invalid" }
        ])))
        .is_err());
    }

    #[test]
    fn download_upsert_replaces_same_major_without_dropping_other_entries() {
        let mut versions = vec![
            entry(8, "/java-8", None),
            entry(21, "/custom-java-21", Some(true)),
        ];
        upsert_java_version(&mut versions, entry(21, "/managed-java-21", None));
        upsert_java_version(&mut versions, entry(17, "/managed-java-17", None));
        assert_eq!(
            versions,
            vec![
                entry(8, "/java-8", None),
                entry(21, "/managed-java-21", None),
                entry(17, "/managed-java-17", None),
            ]
        );
    }

    #[test]
    fn config_registry_keeps_other_config_keys() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.json"),
            br#"{"theme":"dark","locale":"ja"}"#,
        )
        .unwrap();
        let store = ConfigJavaRegistry::new(dir.path());
        assert!(read_java_versions(&store).unwrap().is_empty());
        write_java_versions(&store, &[entry(21, "/managed/jdk-21", None)]).unwrap();
        let config = crate::config::read_config(dir.path()).unwrap();
        assert_eq!(config["theme"], "dark");
        assert_eq!(config["locale"], "ja");
        assert_eq!(
            config[JAVA_REGISTRY_KEY],
            serde_json::json!([{ "version": 21, "path": "/managed/jdk-21", "name": "Java 21" }])
        );
        assert_eq!(
            read_java_versions(&store).unwrap(),
            vec![entry(21, "/managed/jdk-21", None)]
        );
    }
}
