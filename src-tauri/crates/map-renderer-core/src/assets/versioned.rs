//! Minecraft-version-bound asset validation.
//!
//! The common archive and JSON resolver deliberately do not infer a Minecraft
//! release from a path. This module binds the asset contract to an explicit
//! version profile before model or texture resolution begins.

use super::archive::AssetArchive;

pub const MINECRAFT_1_21_4: &str = "1.21.4";

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct AssetVersionProfile {
    pub minecraft_version: &'static str,
    pub version_family: &'static str,
    pub asset_index_id: &'static str,
    pub asset_index_sha1: &'static str,
    pub data_version: i64,
    pub required_entries: &'static [&'static str],
}

impl AssetVersionProfile {
    pub const MINECRAFT_1_21_4: Self = Self {
        minecraft_version: MINECRAFT_1_21_4,
        version_family: "1.21",
        asset_index_id: "19",
        asset_index_sha1: "f08a9f07a863fe31e36f76f19b261cd0648b3c5a",
        data_version: 4189,
        required_entries: &[
            "assets/minecraft/blockstates/stone.json",
            "assets/minecraft/models/block/stone.json",
            "assets/minecraft/textures/block/stone.png",
        ],
    };

    pub fn for_version(version: &str) -> Option<Self> {
        match version {
            MINECRAFT_1_21_4 => Some(Self::MINECRAFT_1_21_4),
            _ => None,
        }
    }

    pub fn validate_archive(self, archive: &AssetArchive) -> Result<(), AssetAdapterError> {
        for path in self.required_entries {
            let contents = archive
                .entry(path)
                .ok_or_else(|| AssetAdapterError::MissingRequiredEntry((*path).to_owned()))?;
            if path.ends_with(".json") {
                serde_json::from_slice::<serde_json::Value>(contents)
                    .map_err(|_| AssetAdapterError::MalformedJson((*path).to_owned()))?;
            } else if path.ends_with(".png")
                && !contents.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10])
            {
                return Err(AssetAdapterError::MalformedPng((*path).to_owned()));
            }
        }
        Ok(())
    }

    pub fn blockstate_path(self, block: &str) -> Result<String, AssetAdapterError> {
        asset_path(block, "blockstates")
    }

    pub fn model_path(self, model: &str) -> Result<String, AssetAdapterError> {
        asset_path(model, "models")
    }

    pub fn texture_path(self, texture: &str) -> Result<String, AssetAdapterError> {
        asset_path(texture, "textures")
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AssetAdapterError {
    UnsupportedVersion(String),
    InvalidResourceKey,
    MissingRequiredEntry(String),
    MalformedJson(String),
    MalformedPng(String),
}

pub fn profile_for_version(version: &str) -> Result<AssetVersionProfile, AssetAdapterError> {
    AssetVersionProfile::for_version(version)
        .ok_or_else(|| AssetAdapterError::UnsupportedVersion(version.to_owned()))
}

fn asset_path(value: &str, category: &str) -> Result<String, AssetAdapterError> {
    let (namespace, path) = value.split_once(':').unwrap_or(("minecraft", value));
    if namespace.is_empty()
        || path.is_empty()
        || namespace.contains('/')
        || path.starts_with('/')
        || path.contains("..")
        || path.contains('\\')
        || path.split('/').any(|part| part.is_empty() || part == ".")
    {
        return Err(AssetAdapterError::InvalidResourceKey);
    }
    let extension = if category == "textures" {
        "png"
    } else {
        "json"
    };
    Ok(format!("assets/{namespace}/{category}/{path}.{extension}"))
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use sha2::{Digest, Sha256};
    use zip::write::SimpleFileOptions;

    use super::{profile_for_version, AssetAdapterError, AssetVersionProfile};
    use crate::assets::archive::AssetArchive;

    fn archive(entries: &[(&str, &[u8])]) -> AssetArchive {
        let mut bytes = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut bytes);
        for (path, contents) in entries {
            writer
                .start_file(*path, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(contents).unwrap();
        }
        writer.finish().unwrap();
        let bytes = bytes.into_inner();
        let digest = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        AssetArchive::from_bytes(&bytes, &digest).unwrap()
    }

    fn valid_archive() -> AssetArchive {
        archive(&[
            (
                "assets/minecraft/blockstates/stone.json",
                br#"{"variants":{"":{"model":"minecraft:block/stone"}}}"#,
            ),
            (
                "assets/minecraft/models/block/stone.json",
                br#"{"parent":"minecraft:block/cube_all"}"#,
            ),
            (
                "assets/minecraft/textures/block/stone.png",
                &[137, 80, 78, 71, 13, 10, 26, 10],
            ),
        ])
    }

    #[test]
    fn profile_is_bound_to_the_matrix_entry_and_validates_required_assets() {
        let profile = profile_for_version("1.21.4").unwrap();
        assert_eq!(profile, AssetVersionProfile::MINECRAFT_1_21_4);
        assert_eq!(profile.asset_index_id, "19");
        assert_eq!(profile.data_version, 4189);
        profile.validate_archive(&valid_archive()).unwrap();
    }

    #[test]
    fn unsupported_versions_and_missing_assets_are_explicit() {
        assert_eq!(
            profile_for_version("1.21.5"),
            Err(AssetAdapterError::UnsupportedVersion("1.21.5".to_owned()))
        );
        let archive = archive(&[("assets/minecraft/other.txt", b"fixture")]);
        assert_eq!(
            AssetVersionProfile::MINECRAFT_1_21_4.validate_archive(&archive),
            Err(AssetAdapterError::MissingRequiredEntry(
                "assets/minecraft/blockstates/stone.json".to_owned()
            ))
        );
    }

    #[test]
    fn resource_paths_are_normalized_without_accepting_traversal() {
        let profile = AssetVersionProfile::MINECRAFT_1_21_4;
        assert_eq!(
            profile.blockstate_path("minecraft:stone").unwrap(),
            "assets/minecraft/blockstates/stone.json"
        );
        assert_eq!(
            profile.model_path("block/stone").unwrap(),
            "assets/minecraft/models/block/stone.json"
        );
        assert_eq!(
            profile.texture_path("minecraft:block/stone").unwrap(),
            "assets/minecraft/textures/block/stone.png"
        );
        assert_eq!(
            profile.model_path("minecraft:../escape"),
            Err(AssetAdapterError::InvalidResourceKey)
        );
    }
}
