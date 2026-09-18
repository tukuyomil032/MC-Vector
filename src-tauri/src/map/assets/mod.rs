mod blockstate;
mod custom_renderer;
mod discovery;
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

pub(crate) use self::custom_renderer::{is_air, material_kind, MaterialKind};
pub(crate) use self::discovery::{
    discover_asset_candidates, AssetCandidate, AssetDiscoveryOptions, AssetLauncher,
};
pub(crate) use self::manifest::{AssetManifest, ASSET_MANIFEST_VERSION};
pub(crate) use self::model::{FaceDirection as RenderFaceDirection, ResolvedFace as RenderFace};
pub(crate) use self::resolver::{manifest_quality, source_version};
pub(crate) use self::tint::apply_tint;

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
            for (direction, face, vertices, shade) in
                model.resolve_faces(reference.x, reference.y, reference.uvlock)
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

    pub(crate) fn biome_tint(&self, state: &str, biome: &str) -> Option<[u8; 3]> {
        let state = state.to_ascii_lowercase();
        let colormap = if state.contains("leaves") || state.contains("azalea") {
            "minecraft:colormap/foliage"
        } else if state.contains("grass")
            || state.contains("fern")
            || state.contains("vine")
            || state.contains("moss")
        {
            "minecraft:colormap/grass"
        } else {
            return self::tint::tint_for(&state, biome);
        };

        let (temperature, downfall) = self::tint::colormap_coordinates(biome);
        let x = (1.0 - temperature.clamp(0.0, 1.0)).clamp(0.0, 1.0);
        let y = (1.0 - (downfall * temperature).clamp(0.0, 1.0)).clamp(0.0, 1.0);
        self.textures
            .get(colormap)
            .map(|texture| texture.sample_uv(default_uv_for_colormap(), 0, x, y))
            .filter(|color| color[3] > 0)
            .map(|color| [color[0], color[1], color[2]])
            .or_else(|| self::tint::tint_for(&state, biome))
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

fn default_uv_for_colormap() -> [f32; 4] {
    [0.0, 0.0, 16.0, 16.0]
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

    fn png_with_dimensions(width: u32, height: u32, pixel: [u8; 4]) -> Vec<u8> {
        let image = RgbaImage::from_pixel(width, height, Rgba(pixel));
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
            resolver.sample_face_at("minecraft:test|", "up", 0.5, 0.5),
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
            resolver.sample_face_at("minecraft:test|facing=north,half=top", "up", 0.5, 0.5,),
            Some([9, 8, 7, 255])
        );
    }

    #[test]
    fn blockstate_uvlock_changes_resolved_face_rotation_only_when_enabled() {
        let entries = HashMap::from([
            (
                "assets/minecraft/blockstates/locked.json".to_string(),
                br#"{"variants":{"":{"model":"minecraft:block/test","y":90,"uvlock":true}}}"#.to_vec(),
            ),
            (
                "assets/minecraft/blockstates/unlocked.json".to_string(),
                br#"{"variants":{"":{"model":"minecraft:block/test","y":90,"uvlock":false}}}"#.to_vec(),
            ),
            (
                "assets/minecraft/models/block/test.json".to_string(),
                br##"{"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"up":{"texture":"#all","rotation":90}}}],"textures":{"all":"minecraft:block/test_texture"}}"##.to_vec(),
            ),
            (
                "assets/minecraft/textures/block/test_texture.png".to_string(),
                png([11, 22, 33, 255]),
            ),
        ]);

        let resolver = AssetResolver::from_entries(&entries).expect("fixture should load");
        let locked = resolver
            .appearance("minecraft:locked|")
            .expect("locked face");
        let unlocked = resolver
            .appearance("minecraft:unlocked|")
            .expect("unlocked face");

        assert_eq!(locked[0].rotation, 0);
        assert_eq!(unlocked[0].rotation, 90);
        assert_eq!(locked[0].vertices, unlocked[0].vertices);
    }

    #[test]
    fn prefers_vanilla_grass_colormap_when_the_asset_is_available() {
        let entries = HashMap::from([(
            "assets/minecraft/textures/colormap/grass.png".to_string(),
            png_with_dimensions(256, 256, [17, 29, 43, 255]),
        )]);
        let resolver = AssetResolver::from_entries(&entries).expect("colormap should load");

        assert_eq!(
            resolver.biome_tint("minecraft:grass_block", "minecraft:plains"),
            Some([17, 29, 43])
        );
    }
}
