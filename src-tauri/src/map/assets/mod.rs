mod blockstate;
mod model;
mod texture;

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use self::blockstate::model_references;
use self::model::Model;
use self::texture::{sample, DEFAULT_UV};

#[derive(Debug)]
pub(crate) struct AssetResolver {
    blockstates: HashMap<String, Value>,
    models: HashMap<String, Model>,
    textures: HashMap<String, Vec<u8>>,
}

impl AssetResolver {
    pub(crate) fn from_entries(entries: &HashMap<String, Vec<u8>>) -> Result<Self, String> {
        let mut blockstates = HashMap::new();
        let mut models = HashMap::new();
        let mut textures = HashMap::new();

        for (path, bytes) in entries {
            if let Some(key) = asset_key(path, "blockstates", ".json") {
                let value = serde_json::from_slice(bytes)
                    .map_err(|error| format!("Invalid blockstate {path}: {error}"))?;
                blockstates.insert(key, value);
            } else if let Some(key) = asset_key(path, "models", ".json") {
                let model = serde_json::from_slice(bytes)
                    .map_err(|error| format!("Invalid block model {path}: {error}"))?;
                models.insert(key, model);
            } else if let Some(key) = asset_key(path, "textures", ".png") {
                let texture = image::load_from_memory(bytes)
                    .map_err(|error| format!("Invalid texture {path}: {error}"))?
                    .resize_exact(16, 16, image::imageops::FilterType::Nearest)
                    .to_rgba8()
                    .into_raw();
                textures.insert(key, texture);
            }
        }

        Ok(Self {
            blockstates,
            models,
            textures,
        })
    }

    pub(crate) fn sample_top(&self, encoded_state: &str) -> Option<[u8; 4]> {
        let (block_id, properties) = encoded_state.split_once('|').unwrap_or((encoded_state, ""));
        let blockstate = self.blockstates.get(block_id)?;
        let references = model_references(blockstate, properties);
        let reference = references.first()?;
        let model = self
            .flatten_model(&reference.model, &mut HashSet::new())
            .ok()?;
        let face = model.top_faces().next()?;
        let texture_key = resolve_texture_reference(&face.texture, &model.textures).ok()?;
        let texture = self.textures.get(&texture_key)?;
        sample(
            texture,
            face.uv.unwrap_or(DEFAULT_UV),
            face.rotation + reference.y,
        )
    }

    fn flatten_model(&self, name: &str, stack: &mut HashSet<String>) -> Result<Model, String> {
        let canonical = canonical_model_key(name);
        if !stack.insert(canonical.clone()) {
            return Err(format!("Cyclic Minecraft model parent: {canonical}"));
        }
        let model = self
            .models
            .get(&canonical)
            .or_else(|| self.models.get(name))
            .cloned()
            .ok_or_else(|| format!("Missing Minecraft model: {name}"))?;
        let flattened = if let Some(parent) = model.parent.clone() {
            let parent_model = self.flatten_model(&parent, stack)?;
            Model::merge_parent(model, parent_model)
        } else {
            model
        };
        stack.remove(&canonical);
        Ok(flattened)
    }
}

fn resolve_texture_reference(
    reference: &str,
    variables: &HashMap<String, String>,
) -> Result<String, String> {
    let resolved = if let Some(variable) = reference.strip_prefix('#') {
        variables
            .get(variable)
            .ok_or_else(|| format!("Missing Minecraft texture variable: {reference}"))?
    } else {
        reference
    };
    Ok(canonical_texture_key(resolved))
}

fn canonical_model_key(value: &str) -> String {
    if value.contains(':') {
        value.to_string()
    } else {
        format!("minecraft:{value}")
    }
}

fn canonical_texture_key(value: &str) -> String {
    if value.contains(':') {
        value.to_string()
    } else {
        format!("minecraft:{value}")
    }
}

fn asset_key(path: &str, category: &str, suffix: &str) -> Option<String> {
    let relative = path.strip_prefix("assets/")?;
    let (namespace, path) = relative.split_once('/')?;
    let category_prefix = format!("{category}/");
    let path = path.strip_prefix(&category_prefix)?.strip_suffix(suffix)?;
    if path.is_empty() || path.contains("..") || path.contains('\\') {
        return None;
    }
    Some(format!("{namespace}:{path}"))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image::{ImageFormat, Rgba, RgbaImage};

    use super::*;

    fn png(pixel: [u8; 4]) -> Vec<u8> {
        let image = RgbaImage::from_pixel(16, 16, Rgba(pixel));
        let mut bytes = Cursor::new(Vec::new());
        image
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("PNG fixture should encode");
        bytes.into_inner()
    }

    #[test]
    fn resolves_variant_parent_texture_variable_and_alpha() {
        let entries = HashMap::from([
            (
                "assets/minecraft/blockstates/test.json".to_string(),
                br#"{"variants":{"":{"model":"minecraft:block/test"}}}"#.to_vec(),
            ),
            (
                "assets/minecraft/models/block/test.json".to_string(),
                br#"{"parent":"minecraft:block/cube_all","textures":{"all":"minecraft:block/test_texture"}}"#.to_vec(),
            ),
            (
                "assets/minecraft/models/block/cube_all.json".to_string(),
                br##"{"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"up":{"texture":"#all"}}}]}"##.to_vec(),
            ),
            (
                "assets/minecraft/textures/block/test_texture.png".to_string(),
                png([11, 22, 33, 77]),
            ),
        ]);
        let resolver = AssetResolver::from_entries(&entries).expect("fixture should load");
        assert_eq!(
            resolver.sample_top("minecraft:test|"),
            Some([11, 22, 33, 77])
        );
    }
}
