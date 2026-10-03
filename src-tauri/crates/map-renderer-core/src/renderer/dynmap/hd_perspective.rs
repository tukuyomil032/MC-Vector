//! Dynmap-derived perspective rasterization for a single chunk.
//!
//! The implementation keeps the renderer independent from Anvil/Paper.  It
//! receives the same immutable domain view for every source and emits a
//! deterministic RGBA tile.  Model patches, UVs, resource-pack pixels, alpha,
//! and light are all explicit inputs.

use crate::renderer::RendererDomain;
use crate::world::chunk_view::{BlockCoord, ChunkDataError, CHUNK_SIDE};

use super::super::png::{encode_rgba, PngError};
use super::iso_hd_perspective::IsoProjection;
use super::lighting::Lighting;
use super::model::ModelError;
use super::patch::{PatchDefinition, Ray};
use super::texture::{TextureAtlas, TextureError};
use super::types::BlockStep;

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum RenderError {
    InvalidDimensions,
    MissingTerrain,
    MissingBlockData,
    MissingLightData,
    Model(ModelError),
    Texture(TextureError),
    Png(PngError),
}

#[derive(Debug, Clone)]
pub struct RenderedTile {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<[u8; 4]>,
    pub rendered_block_count: u32,
    pub coverage_ratio: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VoxelVisit {
    pub block: BlockCoord,
    pub entry_distance: f64,
    pub exit_distance: f64,
}

impl RenderedTile {
    pub fn png(&self) -> Result<Vec<u8>, RenderError> {
        encode_rgba(self.width, self.height, &self.pixels).map_err(RenderError::Png)
    }

    pub fn has_terrain(&self) -> bool {
        self.pixels.iter().any(|pixel| pixel[3] != 0)
    }
}

pub fn render_chunk(
    domain: &RendererDomain<'_>,
    projection: IsoProjection,
    atlas: &TextureAtlas,
    lighting: Lighting,
) -> Result<RenderedTile, RenderError> {
    if projection.width == 0 || projection.height == 0 || projection.scale <= 0.0 {
        return Err(RenderError::InvalidDimensions);
    }
    let pixel_count =
        crate::security::checked_render_pixel_count(projection.width, projection.height)
            .map_err(|_| RenderError::InvalidDimensions)?;
    let mut pixels = vec![[0, 0, 0, 0]; pixel_count];
    let boundary = domain.chunk.boundary().map_err(map_data_error)?;
    let (chunk_x, chunk_z) = domain.chunk.chunk.origin();
    let rendered_block_count = (0..CHUNK_SIDE)
        .flat_map(|local_z| (0..CHUNK_SIDE).map(move |local_x| (local_x, local_z)))
        .filter(|(local_x, local_z)| {
            domain
                .chunk
                .height_at(BlockCoord::new(
                    chunk_x + *local_x as i64,
                    0,
                    chunk_z + *local_z as i64,
                ))
                .map(|height| height > boundary.min.y)
                .unwrap_or(false)
        })
        .count() as u32;
    for y in 0..projection.height {
        for x in 0..projection.width {
            let index = (y * projection.width + x) as usize;
            pixels[index] = trace_pixel(
                domain,
                projection,
                f64::from(x) + 0.5,
                f64::from(y) + 0.5,
                boundary,
                atlas,
                lighting,
            )?;
        }
    }

    let covered = pixels.iter().filter(|pixel| pixel[3] != 0).count();
    if covered == 0 {
        return Err(RenderError::MissingTerrain);
    }
    Ok(RenderedTile {
        width: projection.width,
        height: projection.height,
        pixels,
        rendered_block_count,
        coverage_ratio: covered as f32 / pixel_count as f32,
    })
}

fn trace_pixel(
    domain: &RendererDomain<'_>,
    projection: IsoProjection,
    screen_x: f64,
    screen_y: f64,
    boundary: super::super::super::world::chunk_view::TileBoundary,
    atlas: &TextureAtlas,
    lighting: Lighting,
) -> Result<[u8; 4], RenderError> {
    let ray =
        projection.ray_for_boundary(screen_x, screen_y, boundary.min.y, boundary.max_exclusive.y);
    for visit in traverse_voxels(ray, boundary) {
        let position = visit.block;
        if boundary.contains(position) {
            let block = domain
                .chunk
                .block_state_at(position)
                .map_err(map_data_error)?;
            let model = match domain.models.resolve(block.id) {
                crate::assets::model_view::ModelResolution::Resolved(model) => model,
                crate::assets::model_view::ModelResolution::MissingAsset { .. } => {
                    return Err(RenderError::Model(ModelError::MissingAsset));
                }
                crate::assets::model_view::ModelResolution::UnknownModel { .. } => {
                    return Err(RenderError::Model(ModelError::UnknownModel));
                }
            };
            let light = domain.chunk.light_at(position).map_err(map_data_error)?;
            let mut nearest: Option<(f64, f64, f64, PatchDefinition)> = None;
            for patch in &model.patches {
                let translated = translate_patch(
                    *patch,
                    position.x as f64,
                    position.y as f64,
                    position.z as f64,
                );
                if let Some(hit) = translated.intersect(ray) {
                    if hit.distance + 1e-7 >= visit.entry_distance
                        && hit.distance <= visit.exit_distance + 1e-7
                        && nearest.map_or(true, |current| hit.distance < current.0)
                    {
                        nearest = Some((hit.distance, hit.u, hit.v, *patch));
                    }
                }
            }
            if let Some((_, u, v, patch)) = nearest {
                let (texture_u, texture_v) = patch.texture_uv.sample(u, v);
                let color = atlas
                    .sample(patch.texture_index, texture_u, texture_v)
                    .map_err(RenderError::Texture)?;
                let face_factor = match patch.step {
                    BlockStep::YPlus => 1.0,
                    BlockStep::YMinus => 0.55,
                    BlockStep::XMinus | BlockStep::XPlus => 0.82,
                    BlockStep::ZMinus | BlockStep::ZPlus => 0.72,
                };
                return Ok(lighting.apply_with_face(
                    color,
                    light.sky,
                    light.block,
                    patch.shade,
                    face_factor,
                ));
            }
        }
    }
    Ok([0, 0, 0, 0])
}

pub fn traverse_voxels(
    ray: Ray,
    boundary: super::super::super::world::chunk_view::TileBoundary,
) -> Vec<VoxelVisit> {
    let Some((entry, exit)) = ray_box_intersection(ray, boundary) else {
        return Vec::new();
    };
    let mut distance = entry.max(0.0) + 1e-7;
    if distance > exit {
        return Vec::new();
    }

    let point = ray.origin + ray.direction * distance;
    let mut block_x = point.x.floor() as i64;
    let mut block_y = point.y.floor() as i32;
    let mut block_z = point.z.floor() as i64;
    let step_x = axis_step(ray.direction.x);
    let step_y = axis_step(ray.direction.y);
    let step_z = axis_step(ray.direction.z);
    let delta_x = reciprocal_abs(ray.direction.x);
    let delta_y = reciprocal_abs(ray.direction.y);
    let delta_z = reciprocal_abs(ray.direction.z);
    let mut next_x = next_boundary_t(ray.origin.x, ray.direction.x, block_x, step_x);
    let mut next_y = next_boundary_t(ray.origin.y, ray.direction.y, block_y as i64, step_y);
    let mut next_z = next_boundary_t(ray.origin.z, ray.direction.z, block_z, step_z);
    let mut visits = Vec::new();

    for _ in 0..crate::security::MAX_VOXEL_STEPS {
        if distance > exit + 1e-7 {
            break;
        }
        let next = next_x.min(next_y).min(next_z).min(exit);
        if !next.is_finite() {
            break;
        }
        let visit = VoxelVisit {
            block: BlockCoord::new(block_x, block_y, block_z),
            entry_distance: distance,
            exit_distance: next,
        };
        if boundary.contains(visit.block) {
            visits.push(visit);
        }
        if next >= exit - 1e-7 {
            break;
        }
        if next_x <= next + 1e-7 {
            block_x += step_x;
            next_x += delta_x;
        }
        if next_y <= next + 1e-7 {
            block_y += step_y as i32;
            next_y += delta_y;
        }
        if next_z <= next + 1e-7 {
            block_z += step_z;
            next_z += delta_z;
        }
        distance = next + 1e-7;
    }
    visits
}

fn axis_step(direction: f64) -> i64 {
    if direction > 0.0 {
        1
    } else if direction < 0.0 {
        -1
    } else {
        0
    }
}

fn reciprocal_abs(direction: f64) -> f64 {
    if direction.abs() <= f64::EPSILON {
        f64::INFINITY
    } else {
        1.0 / direction.abs()
    }
}

fn next_boundary_t(origin: f64, direction: f64, block: i64, step: i64) -> f64 {
    if step == 0 {
        return f64::INFINITY;
    }
    let boundary = if step > 0 {
        block as f64 + 1.0
    } else {
        block as f64
    };
    (boundary - origin) / direction
}

fn ray_box_intersection(
    ray: Ray,
    boundary: super::super::super::world::chunk_view::TileBoundary,
) -> Option<(f64, f64)> {
    let mut entry = f64::NEG_INFINITY;
    let mut exit = f64::INFINITY;
    let axes = [
        (
            ray.origin.x,
            ray.direction.x,
            boundary.min.x as f64,
            boundary.max_exclusive.x as f64,
        ),
        (
            ray.origin.y,
            ray.direction.y,
            boundary.min.y as f64,
            boundary.max_exclusive.y as f64,
        ),
        (
            ray.origin.z,
            ray.direction.z,
            boundary.min.z as f64,
            boundary.max_exclusive.z as f64,
        ),
    ];
    for (origin, direction, min, max) in axes {
        if direction.abs() <= f64::EPSILON {
            if origin < min || origin > max {
                return None;
            }
            continue;
        }
        let first = (min - origin) / direction;
        let second = (max - origin) / direction;
        entry = entry.max(first.min(second));
        exit = exit.min(first.max(second));
        if entry > exit {
            return None;
        }
    }
    Some((entry, exit))
}

fn translate_patch(patch: PatchDefinition, x: f64, y: f64, z: f64) -> PatchDefinition {
    let offset = super::types::Vec3::new(x, y, z);
    PatchDefinition {
        origin: patch.origin + offset,
        u_end: patch.u_end + offset,
        v_end: patch.v_end + offset,
        ..patch
    }
}

fn map_data_error(error: ChunkDataError) -> RenderError {
    match error {
        ChunkDataError::MissingLightData { .. } => RenderError::MissingLightData,
        ChunkDataError::MissingBlockData { .. }
        | ChunkDataError::Unloaded { .. }
        | ChunkDataError::ChunkMismatch { .. }
        | ChunkDataError::SectionMissing { .. }
        | ChunkDataError::PaletteIndexOutOfBounds { .. } => RenderError::MissingBlockData,
        _ => RenderError::MissingTerrain,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{render_chunk, traverse_voxels};
    use crate::assets::model_view::{AssetResolutionState, ModelDefinition, ModelView};
    use crate::renderer::dynmap::iso_hd_perspective::IsoProjection;
    use crate::renderer::dynmap::lighting::Lighting;
    use crate::renderer::dynmap::patch::PatchDefinition;
    use crate::renderer::dynmap::patch::Ray;
    use crate::renderer::dynmap::texture::{TextureAtlas, TextureImage};
    use crate::renderer::dynmap::types::{SideVisible, Vec3};
    use crate::renderer::RendererDomain;
    use crate::world::chunk_view::{
        BiomeData, BlockCoord, BlockState, BlockStateData, BlockStateId, ChunkCoord,
        ChunkLoadState, ChunkSection, HeightData, LightData, MapChunkCache, SectionPalette,
        TileBoundary, TileBoundaryState, CHUNK_COLUMN_COUNT, SECTION_BLOCK_COUNT,
    };

    fn fixture_domain() -> (MapChunkCache, ModelView) {
        let section = ChunkSection {
            section_y: 0,
            block_states: BlockStateData::complete(
                SectionPalette::complete(vec![BlockState {
                    id: BlockStateId(0),
                    name: "minecraft:stone|".to_owned(),
                    properties: BTreeMap::new(),
                }])
                .unwrap(),
                vec![0; SECTION_BLOCK_COUNT],
            )
            .unwrap(),
            biome: BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).unwrap(),
            height: HeightData::complete(vec![16; CHUNK_COLUMN_COUNT]).unwrap(),
            sky_light: LightData::complete(vec![15; SECTION_BLOCK_COUNT]).unwrap(),
            block_light: LightData::complete(vec![0; SECTION_BLOCK_COUNT]).unwrap(),
        };
        let mut sections = BTreeMap::new();
        sections.insert(0, section);
        let chunk = MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            sections,
            BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).unwrap(),
            HeightData::complete(vec![16; CHUNK_COLUMN_COUNT]).unwrap(),
            TileBoundaryState::Present(
                TileBoundary::new(BlockCoord::new(0, 0, 0), BlockCoord::new(16, 16, 16)).unwrap(),
            ),
            AssetResolutionState::Available,
        );
        let patch = PatchDefinition::new(
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(1.0, 1.0, 0.0),
            Vec3::new(0.0, 1.0, 1.0),
            0.0,
            1.0,
            0.0,
            1.0,
            0.0,
            1.0,
            SideVisible::Both,
            1,
            true,
        )
        .unwrap();
        let models = ModelView::new(AssetResolutionState::Available).with_model(
            BlockStateId(0),
            ModelDefinition {
                model_id: crate::assets::model_view::AssetKey::new("minecraft:stone"),
                patches: vec![patch],
            },
        );
        (chunk, models)
    }

    #[test]
    fn saved_domain_fixture_produces_nontransparent_deterministic_png() {
        let (chunk, models) = fixture_domain();
        let domain = RendererDomain::new(&chunk, &models);
        let mut atlas = TextureAtlas::default();
        atlas.insert(
            1,
            TextureImage::new(1, 1, vec![[120, 80, 40, 255]]).unwrap(),
        );
        let lighting = Lighting::new(
            [
                0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255,
            ],
            0.1,
        );
        let projection = IsoProjection::new(128, 128, 4.0, 16.0);
        let first = render_chunk(&domain, projection, &atlas, lighting).unwrap();
        let second = render_chunk(&domain, projection, &atlas, lighting).unwrap();
        assert!(first.has_terrain());
        assert_eq!(first.pixels, second.pixels);
        assert_eq!(first.png().unwrap(), second.png().unwrap());
    }

    #[test]
    fn voxel_traversal_crosses_adjacent_blocks_in_ray_order() {
        let boundary =
            TileBoundary::new(BlockCoord::new(0, 0, 0), BlockCoord::new(2, 1, 3)).unwrap();
        let visits = traverse_voxels(
            Ray::new(Vec3::new(0.5, 0.5, -1.0), Vec3::new(0.0, 0.0, 1.0)),
            boundary,
        );
        assert_eq!(
            visits.iter().map(|visit| visit.block).collect::<Vec<_>>(),
            vec![
                BlockCoord::new(0, 0, 0),
                BlockCoord::new(0, 0, 1),
                BlockCoord::new(0, 0, 2),
            ]
        );
        assert!(visits
            .windows(2)
            .all(|window| window[0].exit_distance <= window[1].entry_distance));
    }
}
