//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/ChestRenderer.java,
//! HeadRenderer.java, SkullRenderer.java, WallHeadRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: State-driven bounds and arbitrary head yaw use source-independent patches.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

use super::advanced::{rotate_bounds_for_facing, Facing};
use super::simple::{box_patches, CuboidBounds};

#[derive(Debug, Clone, Copy, Default)]
pub struct ChestRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for ChestRenderer {
    fn name(&self) -> &str {
        "ChestRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let facing = Facing::parse(state, "facing")?;
        let chest_type = state
            .properties
            .get("type")
            .map(String::as_str)
            .unwrap_or("single");
        let bounds = match chest_type {
            "single" => CuboidBounds::new(
                Vec3::new(0.0625, 0.0, 0.0625),
                Vec3::new(0.9375, 0.875, 0.9375),
            ),
            "left" => CuboidBounds::new(
                Vec3::new(0.0625, 0.0, 0.0625),
                Vec3::new(1.0, 0.875, 0.9375),
            ),
            "right" => CuboidBounds::new(
                Vec3::new(0.0, 0.0, 0.0625),
                Vec3::new(0.9375, 0.875, 0.9375),
            ),
            _ => return Err(CustomRendererError::UnsupportedState),
        };
        let bounds = rotate_bounds_for_facing(bounds, facing);
        box_patches(factory, bounds, self.texture_index, true)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct HeadRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for HeadRenderer {
    fn name(&self) -> &str {
        "HeadRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let rotation = state
            .properties
            .get("rotation")
            .map(String::as_str)
            .unwrap_or("0")
            .parse::<u8>()
            .map_err(|_| CustomRendererError::UnsupportedState)?;
        if rotation > 15 {
            return Err(CustomRendererError::UnsupportedState);
        }
        let bounds = CuboidBounds::new(Vec3::new(0.25, 0.0, 0.25), Vec3::new(0.75, 0.5, 0.75));
        let angle = f64::from(rotation) * 22.5;
        box_patches(factory, bounds, self.texture_index, true).map(|patches| {
            patches
                .into_iter()
                .map(|patch| rotate_patch_y(patch, angle))
                .collect()
        })
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SkullRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for SkullRenderer {
    fn name(&self) -> &str {
        "SkullRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        HeadRenderer {
            texture_index: self.texture_index,
        }
        .render(state, context, factory)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct WallHeadRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for WallHeadRenderer {
    fn name(&self) -> &str {
        "WallHeadRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        HeadRenderer {
            texture_index: self.texture_index,
        }
        .render(state, context, factory)
    }
}

fn rotate_patch_y(mut patch: PatchDefinition, degrees: f64) -> PatchDefinition {
    patch.origin = rotate_point_y(patch.origin, degrees);
    patch.u_end = rotate_point_y(patch.u_end, degrees);
    patch.v_end = rotate_point_y(patch.v_end, degrees);
    patch
}

fn rotate_point_y(point: Vec3, degrees: f64) -> Vec3 {
    let radians = degrees.to_radians();
    let (sin, cos) = radians.sin_cos();
    let x = point.x - 0.5;
    let z = point.z - 0.5;
    Vec3::new(0.5 + x * cos - z * sin, point.y, 0.5 + x * sin + z * cos)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{ChestRenderer, HeadRenderer, SkullRenderer, WallHeadRenderer};
    use crate::assets::model_view::AssetResolutionState;
    use crate::renderer::dynmap::custom::{
        CustomRenderer, DynmapBlockState, MapDataContext, RenderPatchFactory,
    };
    use crate::world::chunk_view::{
        BiomeData, BlockCoord, ChunkCoord, ChunkLoadState, HeightData, MapChunkCache,
        TileBoundaryState,
    };

    fn context() -> MapDataContext<'static> {
        let chunk = Box::leak(Box::new(MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            BTreeMap::new(),
            BiomeData::Missing,
            HeightData::Missing,
            TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )));
        MapDataContext::new(chunk, BlockCoord::new(0, 0, 0))
    }

    fn state(name: &str) -> DynmapBlockState {
        DynmapBlockState {
            id: 1,
            name: name.to_string(),
            properties: BTreeMap::new(),
        }
    }

    #[test]
    fn chest_state_selects_single_and_double_bounds() {
        let mut state = state("minecraft:chest");
        state.properties.insert("facing".into(), "east".into());
        let single = ChestRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .expect("single chest");
        state.properties.insert("type".into(), "left".into());
        let left = ChestRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .expect("left chest");
        assert_eq!(single.len(), 6);
        assert_eq!(left.len(), 6);
        assert_ne!(single[0].bounds(), left[0].bounds());
    }

    #[test]
    fn head_rotation_changes_geometry_and_is_bounded() {
        let mut head_state = state("minecraft:player_head");
        head_state.properties.insert("rotation".into(), "7".into());
        let patches = HeadRenderer::default()
            .render(&head_state, &context(), &RenderPatchFactory)
            .expect("head");
        assert_eq!(patches.len(), 6);
        head_state.properties.insert("rotation".into(), "16".into());
        assert!(HeadRenderer::default()
            .render(&head_state, &context(), &RenderPatchFactory)
            .is_err());
        assert_eq!(
            SkullRenderer::default()
                .render(&state("minecraft:skull"), &context(), &RenderPatchFactory)
                .expect("skull")
                .len(),
            6
        );
        assert_eq!(
            WallHeadRenderer::default()
                .render(
                    &state("minecraft:wall_skull"),
                    &context(),
                    &RenderPatchFactory
                )
                .unwrap()
                .len(),
            6
        );
    }
}
