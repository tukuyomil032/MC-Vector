//! Dynmap built-in renderer catalog and registration boundary.
//!
//! This module deliberately registers metadata before implementation.  Every
//! renderer in the pinned Dynmap source tree must have one descriptor, and a
//! descriptor stays `not_started` until its translated renderer, fixtures, and
//! reference evidence exist.  The registry therefore prevents an incomplete
//! catalog from being mistaken for a complete renderer implementation.

use std::collections::BTreeMap;

pub const DYNMAP_SOURCE_REVISION: &str = "93b454efb8802dc7406d6873434f2aeec5c636f4";

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum BuiltinImplementationStatus {
    NotStarted,
    Verified,
    Unsupported,
}

impl BuiltinImplementationStatus {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "not_started" => Some(Self::NotStarted),
            "verified" => Some(Self::Verified),
            "unsupported" => Some(Self::Unsupported),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct BuiltinRendererDescriptor {
    pub class: String,
    pub source_path: String,
    pub source_revision: String,
    pub rust_module: String,
    pub required_assets: Vec<String>,
    pub fixtures: Vec<String>,
    pub reference_trace: Option<String>,
    pub pixel_golden: Option<String>,
    pub implementation_status: BuiltinImplementationStatus,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum BuiltinRegistryError {
    InvalidJson,
    RootIsNotObject,
    MissingEntries,
    InvalidEntry,
    MissingField(&'static str),
    InvalidField(&'static str),
    SourceRevisionMismatch,
    DuplicateClass(String),
    EmptyClass,
}

#[derive(Debug, Clone, Default)]
pub struct BuiltinRendererRegistry {
    entries: BTreeMap<String, BuiltinRendererDescriptor>,
}

impl BuiltinRendererRegistry {
    pub fn from_catalog_json(
        json: &str,
        expected_revision: &str,
    ) -> Result<Self, BuiltinRegistryError> {
        let root: serde_json::Value =
            serde_json::from_str(json).map_err(|_| BuiltinRegistryError::InvalidJson)?;
        let root = root
            .as_object()
            .ok_or(BuiltinRegistryError::RootIsNotObject)?;
        let entries = root
            .get("entries")
            .and_then(serde_json::Value::as_array)
            .ok_or(BuiltinRegistryError::MissingEntries)?;

        let mut registry = Self::default();
        for entry in entries {
            let entry = entry
                .as_object()
                .ok_or(BuiltinRegistryError::InvalidEntry)?;
            let descriptor = BuiltinRendererDescriptor {
                class: required_string(entry, "class")?,
                source_path: required_string(entry, "sourcePath")?,
                source_revision: required_string(entry, "sourceRevision")?,
                rust_module: required_string(entry, "rustModule")?,
                required_assets: string_array(entry, "requiredAssets")?,
                fixtures: string_array(entry, "fixtures")?,
                reference_trace: optional_string(entry, "referenceTrace")?,
                pixel_golden: optional_string(entry, "pixelGolden")?,
                implementation_status: BuiltinImplementationStatus::parse(&required_string(
                    entry,
                    "implementationStatus",
                )?)
                .ok_or(BuiltinRegistryError::InvalidField("implementationStatus"))?,
            };
            if descriptor.class.is_empty() {
                return Err(BuiltinRegistryError::EmptyClass);
            }
            if descriptor.source_revision != expected_revision {
                return Err(BuiltinRegistryError::SourceRevisionMismatch);
            }
            if registry
                .entries
                .insert(descriptor.class.clone(), descriptor)
                .is_some()
            {
                return Err(BuiltinRegistryError::DuplicateClass(
                    entry
                        .get("class")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                ));
            }
        }
        if registry.entries.is_empty() {
            return Err(BuiltinRegistryError::MissingEntries);
        }
        Ok(registry)
    }

    pub fn get(&self, class: &str) -> Option<&BuiltinRendererDescriptor> {
        self.entries.get(class)
    }

    pub fn iter(&self) -> impl Iterator<Item = &BuiltinRendererDescriptor> {
        self.entries.values()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn is_complete(&self) -> bool {
        self.entries
            .values()
            .all(|entry| entry.implementation_status == BuiltinImplementationStatus::Verified)
    }
}

fn required_string(
    entry: &serde_json::Map<String, serde_json::Value>,
    field: &'static str,
) -> Result<String, BuiltinRegistryError> {
    entry
        .get(field)
        .ok_or(BuiltinRegistryError::MissingField(field))?
        .as_str()
        .map(ToOwned::to_owned)
        .ok_or(BuiltinRegistryError::InvalidField(field))
}

fn optional_string(
    entry: &serde_json::Map<String, serde_json::Value>,
    field: &'static str,
) -> Result<Option<String>, BuiltinRegistryError> {
    let value = entry
        .get(field)
        .ok_or(BuiltinRegistryError::MissingField(field))?;
    if value.is_null() {
        return Ok(None);
    }
    value
        .as_str()
        .map(|value| Some(value.to_owned()))
        .ok_or(BuiltinRegistryError::InvalidField(field))
}

fn string_array(
    entry: &serde_json::Map<String, serde_json::Value>,
    field: &'static str,
) -> Result<Vec<String>, BuiltinRegistryError> {
    entry
        .get(field)
        .ok_or(BuiltinRegistryError::MissingField(field))?
        .as_array()
        .ok_or(BuiltinRegistryError::InvalidField(field))?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(ToOwned::to_owned)
                .ok_or(BuiltinRegistryError::InvalidField(field))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{BuiltinImplementationStatus, BuiltinRegistryError, BuiltinRendererRegistry};

    const CATALOG: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../spec/map/coverage/builtin-renderers.json"
    ));

    #[test]
    fn pinned_catalog_registers_every_builtin_renderer() {
        let registry =
            BuiltinRendererRegistry::from_catalog_json(CATALOG, super::DYNMAP_SOURCE_REVISION)
                .expect("pinned builtin catalog must be valid");

        assert_eq!(registry.len(), 39);
        assert!(!registry.is_empty());
        assert!(!registry.is_complete());
        assert_eq!(
            registry
                .get("StairStateRenderer")
                .unwrap()
                .implementation_status,
            BuiltinImplementationStatus::NotStarted
        );
    }

    #[test]
    fn registry_rejects_revision_drift() {
        let error = BuiltinRendererRegistry::from_catalog_json(CATALOG, "other-revision")
            .expect_err("a catalog from another revision must not be accepted");

        assert_eq!(error, BuiltinRegistryError::SourceRevisionMismatch);
    }

    #[test]
    fn registry_rejects_duplicate_classes() {
        let json = r#"{
            "entries": [
                {"class":"A","sourcePath":"a","sourceRevision":"r","rustModule":"a","requiredAssets":[],"fixtures":[],"referenceTrace":null,"pixelGolden":null,"implementationStatus":"not_started"},
                {"class":"A","sourcePath":"b","sourceRevision":"r","rustModule":"b","requiredAssets":[],"fixtures":[],"referenceTrace":null,"pixelGolden":null,"implementationStatus":"not_started"}
            ]
        }"#;

        assert!(matches!(
            BuiltinRendererRegistry::from_catalog_json(json, "r"),
            Err(BuiltinRegistryError::DuplicateClass(class)) if class == "A"
        ));
    }

    #[test]
    fn registry_requires_explicit_implementation_status() {
        let json = r#"{
            "entries": [{"class":"A","sourcePath":"a","sourceRevision":"r","rustModule":"a","requiredAssets":[],"fixtures":[],"referenceTrace":null,"pixelGolden":null}]
        }"#;

        assert!(matches!(
            BuiltinRendererRegistry::from_catalog_json(json, "r"),
            Err(BuiltinRegistryError::MissingField("implementationStatus"))
        ));
    }
}
