mod blockstate;
mod custom_renderer;
mod manifest;
mod model;
mod resolver;
mod resource_pack;
mod texture;
mod tint;

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use self::blockstate::model_references;
use self::model::{default_uv, FaceDirection, Model, ResolvedFace};
use self::resolver::ResourcePackStack;
use self::texture::TextureImage;

pub(crate) use self::custom_renderer::MaterialKind;
pub(crate) use self::manifest::{AssetManifest, AssetQuality, ASSET_MANIFEST_VERSION};
pub(crate) use self::model::{FaceDirection as RenderFaceDirection, ResolvedFace as RenderFace};
pub(crate) use self::resolver::{manifest_quality, source_version};
pub(crate) use self::resource_pack::is_resource_pack_path;
pub(crate) use self::tint::{apply_tint, tint_for};

#[derive(Debug)]
pub(crate) struct AssetResolver {
    blockstates: HashMap<String, Value>,
    models: HashMap<String, Model>,
    textures: HashMap<String, TextureImage>,
}

impl AssetResolver {
    pub(crate) fn from_entries(entries: &HashMap<String, Vec<u8>>) -> Result<Self, String> {
        let stack = ResourcePackStack::from_entries(entries.clone());
        let mut blockstates = HashMap::new();
        let mut models = HashMap::new();
        let mut textures = HashMap::new();

        for (path, bytes) in stack.entries() {
            if let Some(key) = asset_key(path, "blockstates", ".json") {
                let value = serde_json::from_slice(bytes)
                    .map_err(|error| format!("Invalid blockstate {path}: {error}"))?;
                blockstates.insert(key, value);
            } else if let Some(key) = asset_key(path, "models", ".json") {
                let model = serde_json::from_slice(bytes)
                    .map_err(|error| format!("Invalid block model {path}: {error}"))?;
                models.insert(key, model);
            } else if let Some(key) = asset_key(path, "textures", ".png") {
                let animated = entries.contains_key(&format!("{path}.mcmeta"));
                textures.insert(key, TextureImage::from_png(bytes, animated)?);
            }
        }

        Ok(Self {
            blockstates,
            models,
            textures,
        })
    }

    pub(crate) fn blockstate_count(&self) -> usize {
        self.blockstates.len()
    }

    pub(crate) fn model_count(&self) -> usize {
        self.models.len()
    }

    pub(crate) fn texture_count(&self) -> usize {
        self.textures.len()
    }

    pub(crate) fn appearance(&self, encoded_state: &str) -> Option<Vec<ResolvedFace>> {
        let (block_id, properties) = encoded_state.split_once('|').unwrap_or((encoded_state, ""));
        let blockstate = self.blockstates.get(block_id)?;
        let references = model_references(blockstate, properties);
        if references.is_empty() {
            return None;
        }
        let mut faces = Vec::new();
        for reference in references {
            let model = self
                .flatten_model(&reference.model, &mut HashSet::new())
                .ok()?;
            for (direction, face, vertices, shade) in model.resolve_faces(reference.x, reference.y)
            {
                let texture = resolve_texture_reference(&face.texture, &model.textures).ok()?;
                if !self.textures.contains_key(&texture) {
                    continue;
                }
                faces.push(ResolvedFace {
                    direction,
                    vertices,
                    texture,
                    uv: default_uv(&face),
                    rotation: face.rotation,
                    tint_index: face.tintindex,
                    shade: shade || face.cullface.is_some(),
                });
            }
        }
        (!faces.is_empty()).then_some(faces)
    }

    pub(crate) fn sample_top(&self, encoded_state: &str) -> Option<[u8; 4]> {
        self.sample_top_at(encoded_state, 0.5, 0.5)
    }

    pub(crate) fn sample_top_at(&self, encoded_state: &str, u: f32, v: f32) -> Option<[u8; 4]> {
        self.sample_face_at(encoded_state, "up", u, v)
    }

    pub(crate) fn sample_face_at(
        &self,
        encoded_state: &str,
        direction: &str,
        u: f32,
        v: f32,
    ) -> Option<[u8; 4]> {
        let direction = FaceDirection::parse(direction)?;
        let faces = self.appearance(encoded_state)?;
        let face = faces
            .iter()
            .filter(|face| face.direction == direction)
            .max_by(|left, right| {
                let left_height = left.vertices.iter().map(|point| point[1]).sum::<f32>();
                let right_height = right.vertices.iter().map(|point| point[1]).sum::<f32>();
                left_height
                    .partial_cmp(&right_height)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })?;
        let texture = self.textures.get(&face.texture)?;
        Some(texture.sample_uv(face.uv, face.rotation, u, v))
    }

    pub(crate) fn sample_resolved_face(
        &self,
        face: &ResolvedFace,
        u: f32,
        v: f32,
    ) -> Option<[u8; 4]> {
        self.textures
            .get(&face.texture)
            .map(|texture| texture.sample_uv(face.uv, face.rotation, u, v))
    }

    pub(crate) fn has_blockstate(&self, state: &str) -> bool {
        let block_id = state.split_once('|').map_or(state, |(id, _)| id);
        self.blockstates.contains_key(block_id)
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
    let mut current = reference.to_string();
    let mut visited = HashSet::new();
    for _ in 0..32 {
        if !visited.insert(current.clone()) {
            return Err(format!("Cyclic Minecraft texture variable: {reference}"));
        }
        let Some(variable) = current.strip_prefix('#') else {
            return Ok(canonical_texture_key(&current));
        };
        current = variables
            .get(variable)
            .cloned()
            .ok_or_else(|| format!("Missing Minecraft texture variable: #{variable}"))?;
    }
    Err(format!(
        "Minecraft texture variable chain is too deep: {reference}"
    ))
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
        assert_eq!(resolver.appearance("minecraft:test|").unwrap().len(), 1);
    }

    #[test]
    fn resolves_partial_variant_keys_and_preserves_texture_dimensions() {
        let entries = HashMap::from([
            (
                "assets/minecraft/blockstates/test.json".to_string(),
                br#"{"variants":{"facing=north,half=top":{"model":"minecraft:block/test"},"":{"model":"minecraft:block/fallback"}}}"#.to_vec(),
            ),
            (
                "assets/minecraft/models/block/test.json".to_string(),
                br#"{"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"up":{"texture":"minecraft:block/wide"}}}]}"#.to_vec(),
            ),
            (
                "assets/minecraft/models/block/fallback.json".to_string(),
                br#"{"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"up":{"texture":"minecraft:block/wide"}}}]}"#.to_vec(),
            ),
            (
                "assets/minecraft/textures/block/wide.png".to_string(),
                {
                    let image = RgbaImage::from_pixel(32, 16, Rgba([9, 8, 7, 255]));
                    let mut bytes = Cursor::new(Vec::new());
                    image.write_to(&mut bytes, ImageFormat::Png).expect("PNG");
                    bytes.into_inner()
                },
            ),
        ]);
        let resolver = AssetResolver::from_entries(&entries).expect("fixture should load");
        assert_eq!(
            resolver.sample_top("minecraft:test|facing=north,half=top"),
            Some([9, 8, 7, 255])
        );
    }
}
