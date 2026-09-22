//! Minecraft blockstate/model JSON resolution.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use super::archive::AssetArchive;
use super::model_view::AssetKey;

const MAX_MODEL_DEPTH: usize = 32;

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ResolverError {
    MissingBlockState(AssetKey),
    MissingModel(AssetKey),
    InvalidJson,
    InvalidRoot,
    InvalidVariantKey,
    InvalidVariant,
    InvalidRotation,
    InvalidParent,
    ParentCycle(AssetKey),
    ParentDepthExceeded,
    TextureCycle(AssetKey),
    MissingTexture(AssetKey),
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ResolvedVariant {
    pub model: AssetKey,
    pub x_rotation: u16,
    pub y_rotation: u16,
    pub uvlock: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedModel {
    pub model: AssetKey,
    pub ambient_occlusion: Option<bool>,
    pub textures: BTreeMap<String, String>,
    pub elements: Vec<Value>,
}

pub struct BlockStateResolver<'a> {
    archive: &'a AssetArchive,
}

impl<'a> BlockStateResolver<'a> {
    pub const fn new(archive: &'a AssetArchive) -> Self {
        Self { archive }
    }

    pub fn resolve_block_state(
        &self,
        block: &str,
        properties: &BTreeMap<String, String>,
    ) -> Result<Vec<ResolvedVariant>, ResolverError> {
        let path = asset_path(block, "blockstates")?;
        let bytes = self
            .archive
            .entry(&path)
            .ok_or_else(|| ResolverError::MissingBlockState(AssetKey::new(block)))?;
        let root: Value = serde_json::from_slice(bytes).map_err(|_| ResolverError::InvalidJson)?;
        let object = root.as_object().ok_or(ResolverError::InvalidRoot)?;
        let mut variants = Vec::new();
        if let Some(value) = object.get("variants") {
            let variants_object = value.as_object().ok_or(ResolverError::InvalidVariant)?;
            let mut matched = false;
            for (key, value) in variants_object {
                if matches_variant_key(key, properties)? {
                    matched = true;
                    variants.extend(parse_variant_value(value)?);
                }
            }
            if !matched {
                return Err(ResolverError::InvalidVariant);
            }
        }
        if let Some(value) = object.get("multipart") {
            let parts = value.as_array().ok_or(ResolverError::InvalidVariant)?;
            for part in parts {
                let part_object = part.as_object().ok_or(ResolverError::InvalidVariant)?;
                let matches = part_object
                    .get("when")
                    .map(|when| matches_when(when, properties))
                    .transpose()?
                    .unwrap_or(true);
                if matches {
                    variants.extend(parse_variant_value(
                        part_object
                            .get("apply")
                            .ok_or(ResolverError::InvalidVariant)?,
                    )?);
                }
            }
        }
        if variants.is_empty() {
            return Err(ResolverError::InvalidVariant);
        }
        Ok(variants)
    }

    pub fn resolve_model(&self, model: &str) -> Result<ResolvedModel, ResolverError> {
        let key = canonical_model_key(model)?;
        self.resolve_model_inner(&key, &mut Vec::new(), 0)
    }

    pub fn resolve_texture(
        &self,
        textures: &BTreeMap<String, String>,
        name: &str,
    ) -> Result<String, ResolverError> {
        let mut stack = BTreeSet::new();
        resolve_texture_reference(textures, name, &mut stack)
    }

    fn resolve_model_inner(
        &self,
        key: &AssetKey,
        stack: &mut Vec<AssetKey>,
        depth: usize,
    ) -> Result<ResolvedModel, ResolverError> {
        if depth > MAX_MODEL_DEPTH {
            return Err(ResolverError::ParentDepthExceeded);
        }
        if stack.contains(key) {
            return Err(ResolverError::ParentCycle(key.clone()));
        }
        let path = asset_path(key.as_str(), "models")?;
        let bytes = self
            .archive
            .entry(&path)
            .ok_or_else(|| ResolverError::MissingModel(key.clone()))?;
        let root: Value = serde_json::from_slice(bytes).map_err(|_| ResolverError::InvalidJson)?;
        let object = root.as_object().ok_or(ResolverError::InvalidRoot)?;
        stack.push(key.clone());
        let parent = object
            .get("parent")
            .map(|value| {
                value
                    .as_str()
                    .ok_or(ResolverError::InvalidParent)
                    .and_then(canonical_model_key)
            })
            .transpose()?;
        let inherited = parent
            .as_ref()
            .map(|parent| self.resolve_model_inner(parent, stack, depth + 1))
            .transpose()?;
        let mut textures = inherited
            .as_ref()
            .map(|model| model.textures.clone())
            .unwrap_or_default();
        merge_textures(&mut textures, object.get("textures"))?;
        let elements = object
            .get("elements")
            .and_then(Value::as_array)
            .cloned()
            .or_else(|| inherited.as_ref().map(|model| model.elements.clone()))
            .unwrap_or_default();
        let ambient_occlusion = object
            .get("ambientocclusion")
            .and_then(Value::as_bool)
            .or_else(|| inherited.as_ref().and_then(|model| model.ambient_occlusion));
        stack.pop();
        Ok(ResolvedModel {
            model: key.clone(),
            ambient_occlusion,
            textures,
            elements,
        })
    }
}

fn asset_path(name: &str, category: &str) -> Result<String, ResolverError> {
    let key = if category == "models" {
        canonical_model_key(name)?
    } else {
        canonical_block_key(name)?
    };
    let raw = key.as_str();
    Ok(format!(
        "assets/{}/{}/{}.json",
        namespace(raw),
        category,
        path(raw)
    ))
}

fn canonical_block_key(value: &str) -> Result<AssetKey, ResolverError> {
    canonical_key(value)
}

fn canonical_model_key(value: &str) -> Result<AssetKey, ResolverError> {
    canonical_key(value)
}

fn canonical_key(value: &str) -> Result<AssetKey, ResolverError> {
    let key = if value.contains(':') {
        value.to_owned()
    } else {
        format!("minecraft:{value}")
    };
    let (namespace, path) = key.split_once(':').ok_or(ResolverError::InvalidRoot)?;
    if namespace.is_empty() || path.is_empty() || path.contains("..") || path.starts_with('/') {
        return Err(ResolverError::InvalidRoot);
    }
    Ok(AssetKey::new(key))
}

fn namespace(value: &str) -> &str {
    value
        .split_once(':')
        .map(|(namespace, _)| namespace)
        .unwrap_or("")
}

fn path(value: &str) -> &str {
    value.split_once(':').map(|(_, path)| path).unwrap_or("")
}

fn matches_variant_key(
    key: &str,
    properties: &BTreeMap<String, String>,
) -> Result<bool, ResolverError> {
    if key.is_empty() {
        return Ok(true);
    }
    key.split(',').try_fold(true, |matches, pair| {
        let (name, value) = pair
            .split_once('=')
            .ok_or(ResolverError::InvalidVariantKey)?;
        Ok(matches && properties.get(name) == Some(&value.to_owned()))
    })
}

fn matches_when(
    value: &Value,
    properties: &BTreeMap<String, String>,
) -> Result<bool, ResolverError> {
    let object = value.as_object().ok_or(ResolverError::InvalidVariant)?;
    for (name, value) in object {
        let Some(actual) = properties.get(name) else {
            return Ok(false);
        };
        let Some(expected) = value.as_str() else {
            return Err(ResolverError::InvalidVariant);
        };
        if !expected.split('|').any(|candidate| candidate == actual) {
            return Ok(false);
        }
    }
    Ok(true)
}

fn parse_variant_value(value: &Value) -> Result<Vec<ResolvedVariant>, ResolverError> {
    let values: Vec<&Value> = value
        .as_array()
        .map_or_else(|| vec![value], |array| array.iter().collect());
    values
        .iter()
        .map(|value| {
            let object = value.as_object().ok_or(ResolverError::InvalidVariant)?;
            let model = object
                .get("model")
                .and_then(Value::as_str)
                .ok_or(ResolverError::InvalidVariant)
                .and_then(canonical_model_key)?;
            let x_rotation = parse_rotation(object.get("x"))?;
            let y_rotation = parse_rotation(object.get("y"))?;
            let uvlock = object
                .get("uvlock")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            Ok(ResolvedVariant {
                model,
                x_rotation,
                y_rotation,
                uvlock,
            })
        })
        .collect()
}

fn parse_rotation(value: Option<&Value>) -> Result<u16, ResolverError> {
    let rotation = value.and_then(Value::as_u64).unwrap_or(0);
    if !matches!(rotation, 0 | 90 | 180 | 270) {
        return Err(ResolverError::InvalidRotation);
    }
    Ok(rotation as u16)
}

fn merge_textures(
    target: &mut BTreeMap<String, String>,
    value: Option<&Value>,
) -> Result<(), ResolverError> {
    let Some(value) = value else {
        return Ok(());
    };
    let object = value.as_object().ok_or(ResolverError::InvalidRoot)?;
    for (name, value) in object {
        let texture = value.as_str().ok_or(ResolverError::InvalidRoot)?;
        target.insert(name.clone(), texture.to_owned());
    }
    Ok(())
}

fn resolve_texture_reference(
    textures: &BTreeMap<String, String>,
    name: &str,
    stack: &mut BTreeSet<String>,
) -> Result<String, ResolverError> {
    let value = textures
        .get(name)
        .ok_or_else(|| ResolverError::MissingTexture(AssetKey::new(name)))?;
    if !value.starts_with('#') {
        return Ok(value.clone());
    }
    let key = value.trim_start_matches('#').to_owned();
    if !stack.insert(key.clone()) {
        return Err(ResolverError::TextureCycle(AssetKey::new(key)));
    }
    let result = resolve_texture_reference(textures, &key, stack);
    stack.remove(&key);
    result
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::io::{Cursor, Write};

    use sha2::{Digest, Sha256};
    use zip::write::SimpleFileOptions;

    use super::{BlockStateResolver, ResolverError};
    use crate::assets::archive::AssetArchive;

    fn archive(entries: &[(&str, &str)]) -> AssetArchive {
        let mut bytes = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut bytes);
        for (name, contents) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(contents.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
        let bytes = bytes.into_inner();
        let digest = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        AssetArchive::from_bytes(&bytes, &digest).unwrap()
    }

    #[test]
    fn variants_and_parent_models_resolve_without_guessing() {
        let assets = archive(&[
            (
                "assets/minecraft/blockstates/test.json",
                r#"{"variants":{"facing=north":{"model":"minecraft:block/child","y":90,"uvlock":true}}}"#,
            ),
            (
                "assets/minecraft/models/block/child.json",
                r#"{"parent":"minecraft:block/parent","elements":[]}"#,
            ),
            (
                "assets/minecraft/models/block/parent.json",
                r#"{"textures":{"particle":"minecraft:block/stone"}}"#,
            ),
        ]);
        let resolver = BlockStateResolver::new(&assets);
        let mut properties = BTreeMap::new();
        properties.insert("facing".to_owned(), "north".to_owned());
        let variants = resolver
            .resolve_block_state("minecraft:test", &properties)
            .unwrap();
        assert_eq!(variants[0].y_rotation, 90);
        let model = resolver.resolve_model("minecraft:block/child").unwrap();
        assert_eq!(model.textures["particle"], "minecraft:block/stone");
    }

    #[test]
    fn multipart_and_invalid_model_inputs_are_explicit() {
        let assets = archive(&[
            (
                "assets/minecraft/blockstates/test.json",
                r#"{"multipart":[{"when":{"facing":"north|south"},"apply":{"model":"minecraft:block/a"}}]}"#,
            ),
            (
                "assets/minecraft/models/block/a.json",
                r#"{"parent":"minecraft:block/a"}"#,
            ),
        ]);
        let resolver = BlockStateResolver::new(&assets);
        let mut properties = BTreeMap::new();
        properties.insert("facing".to_owned(), "north".to_owned());
        assert_eq!(
            resolver
                .resolve_block_state("minecraft:test", &properties)
                .unwrap()
                .len(),
            1
        );
        assert!(matches!(
            resolver.resolve_model("minecraft:block/a"),
            Err(ResolverError::ParentCycle(_))
        ));
    }
}
