//! Conversion from resolved Minecraft model elements to renderer patches.

use std::collections::BTreeMap;

use serde_json::Value;

use super::model_view::{AssetKey, ModelDefinition};
use super::resolver::{BlockStateResolver, ResolvedModel, ResolverError};
use crate::renderer::dynmap::patch::{PatchDefinition, TextureUv};
use crate::renderer::dynmap::types::{BlockStep, SideVisible, Vec3};

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ModelBuildError {
    Resolver(ResolverError),
    EmptyModel(AssetKey),
    InvalidElement,
    InvalidVector,
    InvalidBounds,
    InvalidFace,
    MissingTexture(AssetKey),
    InvalidTextureUv,
    InvalidRotation,
}

impl From<ResolverError> for ModelBuildError {
    fn from(error: ResolverError) -> Self {
        Self::Resolver(error)
    }
}

pub fn build_model(
    resolver: &BlockStateResolver<'_>,
    model_name: &str,
    texture_indices: &BTreeMap<String, i32>,
) -> Result<ModelDefinition, ModelBuildError> {
    let model = resolver.resolve_model(model_name)?;
    build_resolved_model(resolver, &model, texture_indices)
}

pub fn build_resolved_model(
    resolver: &BlockStateResolver<'_>,
    model: &ResolvedModel,
    texture_indices: &BTreeMap<String, i32>,
) -> Result<ModelDefinition, ModelBuildError> {
    if model.elements.is_empty() {
        return Err(ModelBuildError::EmptyModel(model.model.clone()));
    }
    let mut patches = Vec::new();
    for element in &model.elements {
        let object = element.as_object().ok_or(ModelBuildError::InvalidElement)?;
        let from = vector(object.get("from")).ok_or(ModelBuildError::InvalidVector)?;
        let to = vector(object.get("to")).ok_or(ModelBuildError::InvalidVector)?;
        if from.iter().zip(to.iter()).any(|(min, max)| {
            !min.is_finite() || !max.is_finite() || *min < 0.0 || *max > 16.0 || min > max
        }) {
            return Err(ModelBuildError::InvalidBounds);
        }
        let faces = object
            .get("faces")
            .and_then(Value::as_object)
            .ok_or(ModelBuildError::InvalidFace)?;
        for (face_name, face_value) in faces {
            let (step, origin, u_end, v_end) = face_geometry(face_name, from, to)?;
            let face = face_value.as_object().ok_or(ModelBuildError::InvalidFace)?;
            let texture = face
                .get("texture")
                .and_then(Value::as_str)
                .ok_or(ModelBuildError::InvalidFace)?;
            let texture_name = if let Some(reference) = texture.strip_prefix('#') {
                resolver.resolve_texture(&model.textures, reference)?
            } else {
                texture.to_owned()
            };
            let texture_index = texture_indices
                .get(&texture_name)
                .copied()
                .ok_or_else(|| ModelBuildError::MissingTexture(AssetKey::new(texture_name)))?;
            let texture_uv = parse_texture_uv(face.get("uv"), face.get("rotation"))?;
            let cullface = face
                .get("cullface")
                .map(|value| {
                    value
                        .as_str()
                        .and_then(block_step)
                        .ok_or(ModelBuildError::InvalidFace)
                })
                .transpose()?;
            let shade = face.get("shade").and_then(Value::as_bool).unwrap_or(true);
            let patch = PatchDefinition::new(
                origin,
                u_end,
                v_end,
                0.0,
                1.0,
                0.0,
                1.0,
                0.0,
                1.0,
                SideVisible::Both,
                texture_index,
                shade,
            )?
            .with_texture_uv(texture_uv)
            .with_cullface(cullface.or(Some(step)));
            patches.push(patch);
        }
    }
    Ok(ModelDefinition {
        model_id: model.model.clone(),
        patches,
    })
}

impl From<crate::renderer::dynmap::patch::PatchError> for ModelBuildError {
    fn from(_: crate::renderer::dynmap::patch::PatchError) -> Self {
        Self::InvalidFace
    }
}

fn vector(value: Option<&Value>) -> Option<[f64; 3]> {
    let values = value?.as_array()?;
    Some([
        values.first()?.as_f64()?,
        values.get(1)?.as_f64()?,
        values.get(2)?.as_f64()?,
    ])
}

fn face_geometry(
    face: &str,
    from: [f64; 3],
    to: [f64; 3],
) -> Result<(BlockStep, Vec3, Vec3, Vec3), ModelBuildError> {
    let (step, origin, u_end, v_end) = match face {
        "down" => (
            BlockStep::YMinus,
            Vec3::new(from[0], from[1], from[2]),
            Vec3::new(to[0], from[1], from[2]),
            Vec3::new(from[0], from[1], to[2]),
        ),
        "up" => (
            BlockStep::YPlus,
            Vec3::new(from[0], to[1], from[2]),
            Vec3::new(to[0], to[1], from[2]),
            Vec3::new(from[0], to[1], to[2]),
        ),
        "north" => (
            BlockStep::ZMinus,
            Vec3::new(from[0], from[1], from[2]),
            Vec3::new(to[0], from[1], from[2]),
            Vec3::new(from[0], to[1], from[2]),
        ),
        "south" => (
            BlockStep::ZPlus,
            Vec3::new(from[0], from[1], to[2]),
            Vec3::new(to[0], from[1], to[2]),
            Vec3::new(from[0], to[1], to[2]),
        ),
        "west" => (
            BlockStep::XMinus,
            Vec3::new(from[0], from[1], to[2]),
            Vec3::new(from[0], from[1], from[2]),
            Vec3::new(from[0], to[1], to[2]),
        ),
        "east" => (
            BlockStep::XPlus,
            Vec3::new(to[0], from[1], from[2]),
            Vec3::new(to[0], from[1], to[2]),
            Vec3::new(to[0], to[1], from[2]),
        ),
        _ => return Err(ModelBuildError::InvalidFace),
    };
    Ok((step, origin, u_end, v_end))
}

fn block_step(value: &str) -> Option<BlockStep> {
    match value {
        "down" => Some(BlockStep::YMinus),
        "up" => Some(BlockStep::YPlus),
        "north" => Some(BlockStep::ZMinus),
        "south" => Some(BlockStep::ZPlus),
        "west" => Some(BlockStep::XMinus),
        "east" => Some(BlockStep::XPlus),
        _ => None,
    }
}

fn parse_texture_uv(
    value: Option<&Value>,
    rotation: Option<&Value>,
) -> Result<TextureUv, ModelBuildError> {
    let values = match value {
        Some(value) => vector4(value).ok_or(ModelBuildError::InvalidTextureUv)?,
        None => [0.0, 0.0, 16.0, 16.0],
    };
    let rotation = rotation.and_then(Value::as_u64).unwrap_or(0);
    if !matches!(rotation, 0 | 90 | 180 | 270) {
        return Err(ModelBuildError::InvalidRotation);
    }
    Ok(TextureUv {
        min_u: values[0] / 16.0,
        max_u: values[2] / 16.0,
        min_v: values[1] / 16.0,
        max_v: values[3] / 16.0,
        rotation: rotation as u16,
    })
}

fn vector4(value: &Value) -> Option<[f64; 4]> {
    let values = value.as_array()?;
    Some([
        values.first()?.as_f64()?,
        values.get(1)?.as_f64()?,
        values.get(2)?.as_f64()?,
        values.get(3)?.as_f64()?,
    ])
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::io::{Cursor, Write};

    use sha2::{Digest, Sha256};
    use zip::write::SimpleFileOptions;

    use super::{build_model, ModelBuildError};
    use crate::assets::archive::AssetArchive;
    use crate::assets::resolver::BlockStateResolver;

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
    fn cube_element_becomes_six_texture_bound_patches() {
        let assets = archive(&[(
            "assets/minecraft/models/block/cube.json",
            r##"{"textures":{"all":"minecraft:block/stone"},"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"down":{"texture":"#all"},"up":{"texture":"#all"},"north":{"texture":"#all"},"south":{"texture":"#all"},"west":{"texture":"#all"},"east":{"texture":"#all"}}}]}"##,
        )]);
        let resolver = BlockStateResolver::new(&assets);
        let mut textures = BTreeMap::new();
        textures.insert("minecraft:block/stone".to_owned(), 3);
        let model = build_model(&resolver, "minecraft:block/cube", &textures).unwrap();
        assert_eq!(model.patches.len(), 6);
        assert!(model.patches.iter().all(|patch| patch.texture_index == 3));
    }

    #[test]
    fn missing_texture_is_not_replaced_with_a_colour() {
        let assets = archive(&[(
            "assets/minecraft/models/block/cube.json",
            r##"{"elements":[{"from":[0,0,0],"to":[16,16,16],"faces":{"up":{"texture":"#missing"}}}]}"##,
        )]);
        let resolver = BlockStateResolver::new(&assets);
        assert!(matches!(
            build_model(&resolver, "minecraft:block/cube", &BTreeMap::new()),
            Err(ModelBuildError::Resolver(_))
        ));
    }
}
