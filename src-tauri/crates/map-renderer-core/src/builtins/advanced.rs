//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/StairStateRenderer.java,
//! RotatedBoxRenderer.java, RotatedPatchRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: State properties replace Dynmap global state indices; geometry remains
//! explicit and unsupported property values are reported instead of guessed.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::{BlockStep, Vec3};

use super::simple::{box_patches, CuboidBounds};

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum StairHalf {
    Bottom,
    Top,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum StairFacing {
    North,
    South,
    West,
    East,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum StairShape {
    Straight,
    InnerLeft,
    InnerRight,
    OuterLeft,
    OuterRight,
}

#[derive(Debug, Clone, Copy)]
pub struct SlabRenderer {
    pub texture_index: i32,
    pub shade: bool,
}

impl Default for SlabRenderer {
    fn default() -> Self {
        Self {
            texture_index: 0,
            shade: true,
        }
    }
}

impl CustomRenderer for SlabRenderer {
    fn name(&self) -> &str {
        "SlabRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let bounds = match state.properties.get("type").map(String::as_str) {
            None | Some("bottom") => {
                CuboidBounds::new(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.5, 1.0))
            }
            Some("top") => CuboidBounds::new(Vec3::new(0.0, 0.5, 0.0), Vec3::new(1.0, 1.0, 1.0)),
            Some("double") => CuboidBounds::UNIT,
            Some(_) => return Err(CustomRendererError::UnsupportedState),
        };
        box_patches(factory, bounds, self.texture_index, self.shade)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct StairRenderer {
    pub texture_index: i32,
    pub shade: bool,
}

impl Default for StairRenderer {
    fn default() -> Self {
        Self {
            texture_index: 0,
            shade: true,
        }
    }
}

impl CustomRenderer for StairRenderer {
    fn name(&self) -> &str {
        "StairStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let half = parse_half(state)?;
        let facing = parse_facing(state)?;
        let shape = parse_shape(state)?;
        let base = match half {
            StairHalf::Bottom => {
                CuboidBounds::new(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.5, 1.0))
            }
            StairHalf::Top => CuboidBounds::new(Vec3::new(0.0, 0.5, 0.0), Vec3::new(1.0, 1.0, 1.0)),
        };
        let mut patches = box_patches(factory, base, self.texture_index, self.shade)?;
        let additions = stair_additions(facing, shape);
        for bounds in additions {
            patches.extend(box_patches(
                factory,
                bounds,
                self.texture_index,
                self.shade,
            )?);
        }
        Ok(patches)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RotatedBoxRenderer {
    pub bounds: CuboidBounds,
    pub quarter_turns: u8,
    pub texture_index: i32,
    pub shade: bool,
}

impl RotatedBoxRenderer {
    pub const fn new(
        bounds: CuboidBounds,
        quarter_turns: u8,
        texture_index: i32,
        shade: bool,
    ) -> Self {
        Self {
            bounds,
            quarter_turns,
            texture_index,
            shade,
        }
    }
}

impl CustomRenderer for RotatedBoxRenderer {
    fn name(&self) -> &str {
        "RotatedBoxRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let patches = box_patches(factory, self.bounds, self.texture_index, self.shade)?;
        let turns = self.quarter_turns % 4;
        Ok(patches
            .into_iter()
            .map(|patch| rotate_patch(patch, turns))
            .collect())
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RotatedPatchRenderer {
    pub quarter_turns: u8,
    pub texture_index: i32,
}

impl CustomRenderer for RotatedPatchRenderer {
    fn name(&self) -> &str {
        "RotatedPatchRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let patch = factory.patch(
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            self.texture_index,
            true,
        )?;
        Ok(vec![rotate_patch(patch, self.quarter_turns % 4)])
    }
}

fn parse_half(state: &DynmapBlockState) -> Result<StairHalf, CustomRendererError> {
    match state.properties.get("half").map(String::as_str) {
        None | Some("bottom") => Ok(StairHalf::Bottom),
        Some("top") => Ok(StairHalf::Top),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

fn parse_facing(state: &DynmapBlockState) -> Result<StairFacing, CustomRendererError> {
    match state.properties.get("facing").map(String::as_str) {
        None | Some("north") => Ok(StairFacing::North),
        Some("south") => Ok(StairFacing::South),
        Some("west") => Ok(StairFacing::West),
        Some("east") => Ok(StairFacing::East),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

fn parse_shape(state: &DynmapBlockState) -> Result<StairShape, CustomRendererError> {
    match state.properties.get("shape").map(String::as_str) {
        None | Some("straight") => Ok(StairShape::Straight),
        Some("inner_left") => Ok(StairShape::InnerLeft),
        Some("inner_right") => Ok(StairShape::InnerRight),
        Some("outer_left") => Ok(StairShape::OuterLeft),
        Some("outer_right") => Ok(StairShape::OuterRight),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

fn stair_additions(facing: StairFacing, shape: StairShape) -> Vec<CuboidBounds> {
    let y_min = 0.0;
    let y_max = 1.0;
    let base = match shape {
        StairShape::Straight => vec![CuboidBounds::new(
            Vec3::new(0.5, y_min, 0.0),
            Vec3::new(1.0, y_max, 1.0),
        )],
        StairShape::OuterRight => vec![CuboidBounds::new(
            Vec3::new(0.5, y_min, 0.5),
            Vec3::new(1.0, y_max, 1.0),
        )],
        StairShape::OuterLeft => vec![CuboidBounds::new(
            Vec3::new(0.0, y_min, 0.0),
            Vec3::new(0.5, y_max, 0.5),
        )],
        StairShape::InnerRight => vec![
            CuboidBounds::new(Vec3::new(0.5, y_min, 0.0), Vec3::new(1.0, y_max, 1.0)),
            CuboidBounds::new(Vec3::new(0.0, y_min, 0.5), Vec3::new(0.5, y_max, 1.0)),
        ],
        StairShape::InnerLeft => vec![
            CuboidBounds::new(Vec3::new(0.5, y_min, 0.0), Vec3::new(1.0, y_max, 1.0)),
            CuboidBounds::new(Vec3::new(0.0, y_min, 0.0), Vec3::new(0.5, y_max, 0.5)),
        ],
    };
    let turns = match facing {
        StairFacing::North => 0,
        StairFacing::East => 1,
        StairFacing::South => 2,
        StairFacing::West => 3,
    };
    base.into_iter()
        .map(|bounds| rotate_bounds(bounds, turns))
        .collect()
}

fn rotate_bounds(bounds: CuboidBounds, turns: u8) -> CuboidBounds {
    let points = [
        Vec3::new(bounds.min.x, bounds.min.y, bounds.min.z),
        Vec3::new(bounds.min.x, bounds.min.y, bounds.max.z),
        Vec3::new(bounds.max.x, bounds.min.y, bounds.min.z),
        Vec3::new(bounds.max.x, bounds.min.y, bounds.max.z),
    ];
    let rotated = points.map(|point| rotate_point(point, turns));
    let mut min = rotated[0];
    let mut max = rotated[0];
    for point in rotated.into_iter().skip(1) {
        min.x = min.x.min(point.x);
        min.z = min.z.min(point.z);
        max.x = max.x.max(point.x);
        max.z = max.z.max(point.z);
    }
    CuboidBounds::new(
        Vec3::new(min.x, bounds.min.y, min.z),
        Vec3::new(max.x, bounds.max.y, max.z),
    )
}

fn rotate_patch(mut patch: PatchDefinition, turns: u8) -> PatchDefinition {
    patch.origin = rotate_point(patch.origin, turns);
    patch.u_end = rotate_point(patch.u_end, turns);
    patch.v_end = rotate_point(patch.v_end, turns);
    patch.cullface = patch.cullface.map(|step| rotate_step(step, turns));
    patch.step = rotate_step(patch.step, turns);
    patch
}

fn rotate_point(point: Vec3, turns: u8) -> Vec3 {
    let mut x = point.x;
    let mut z = point.z;
    for _ in 0..turns {
        (x, z) = (1.0 - z, x);
    }
    Vec3::new(x, point.y, z)
}

fn rotate_step(step: BlockStep, turns: u8) -> BlockStep {
    let mut result = step;
    for _ in 0..turns {
        result = match result {
            BlockStep::XMinus => BlockStep::ZMinus,
            BlockStep::ZMinus => BlockStep::XPlus,
            BlockStep::XPlus => BlockStep::ZPlus,
            BlockStep::ZPlus => BlockStep::XMinus,
            vertical => vertical,
        };
    }
    result
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{RotatedBoxRenderer, RotatedPatchRenderer, SlabRenderer, StairRenderer};
    use crate::assets::model_view::AssetResolutionState;
    use crate::renderer::dynmap::custom::{
        CustomRenderer, DynmapBlockState, MapDataContext, RenderPatchFactory,
    };
    use crate::renderer::dynmap::types::Vec3;
    use crate::world::chunk_view::{
        BiomeData, ChunkCoord, ChunkLoadState, HeightData, MapChunkCache, TileBoundaryState,
    };

    fn context() -> (MapChunkCache, MapDataContext<'static>, DynmapBlockState) {
        let chunk = Box::leak(Box::new(MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            BTreeMap::new(),
            BiomeData::Missing,
            HeightData::Missing,
            TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )));
        let context =
            MapDataContext::new(chunk, crate::world::chunk_view::BlockCoord::new(0, 0, 0));
        let state = DynmapBlockState {
            id: 1,
            name: "minecraft:oak_stairs".to_string(),
            properties: BTreeMap::new(),
        };
        (chunk.clone(), context, state)
    }

    #[test]
    fn stair_properties_select_shape_and_half_without_fallback() {
        let (_chunk, context, mut state) = context();
        state.properties.insert("half".into(), "bottom".into());
        state.properties.insert("facing".into(), "east".into());
        state.properties.insert("shape".into(), "inner_left".into());
        let patches = StairRenderer::default()
            .render(&state, &context, &RenderPatchFactory)
            .expect("stair shape");
        assert_eq!(patches.len(), 18);
        state.properties.insert("shape".into(), "unknown".into());
        assert!(StairRenderer::default()
            .render(&state, &context, &RenderPatchFactory)
            .is_err());
    }

    #[test]
    fn slabs_select_bottom_top_and_double_geometry() {
        let (_chunk, context, state) = context();
        let mut state = state;
        for (kind, expected_max_y) in [("bottom", 0.5), ("top", 1.0), ("double", 1.0)] {
            state.properties.insert("type".into(), kind.into());
            let patches = SlabRenderer::default()
                .render(&state, &context, &RenderPatchFactory)
                .expect("slab shape");
            assert_eq!(patches.len(), 6);
            assert!(patches
                .iter()
                .any(|patch| patch.bounds().max.y == expected_max_y));
        }
    }

    #[test]
    fn rotated_geometry_preserves_patch_count_and_changes_coordinates() {
        let (_chunk, context, state) = context();
        let base = super::super::simple::CuboidRenderer::new(
            super::super::simple::CuboidBounds::new(
                Vec3::new(0.0, 0.0, 0.25),
                Vec3::new(0.5, 1.0, 0.75),
            ),
            0,
            true,
        )
        .render(&state, &context, &RenderPatchFactory)
        .expect("base box");
        let rotated = RotatedBoxRenderer::new(
            super::super::simple::CuboidBounds::new(
                Vec3::new(0.0, 0.0, 0.25),
                Vec3::new(0.5, 1.0, 0.75),
            ),
            1,
            0,
            true,
        )
        .render(&state, &context, &RenderPatchFactory)
        .expect("rotated box");
        assert_eq!(base.len(), rotated.len());
        assert_ne!(base[0].bounds(), rotated[0].bounds());
        assert_eq!(
            RotatedPatchRenderer::default()
                .render(&state, &context, &RenderPatchFactory)
                .unwrap()
                .len(),
            1
        );
    }
}
