//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/BoxRenderer.java,
//! CuboidRenderer.java, PlantRenderer.java, PaneRenderer.java, FrameRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Uses the source-independent CustomRenderer boundary and explicit
//! patch geometry; Bukkit registration and Dynmap storage are not included.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::{BlockStep, Vec3};

const BLOCK_MIN: Vec3 = Vec3::new(0.0, 0.0, 0.0);
const BLOCK_MAX: Vec3 = Vec3::new(1.0, 1.0, 1.0);

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CuboidBounds {
    pub min: Vec3,
    pub max: Vec3,
}

impl CuboidBounds {
    pub const UNIT: Self = Self {
        min: BLOCK_MIN,
        max: BLOCK_MAX,
    };

    pub fn validate(self) -> Result<Self, CustomRendererError> {
        if [
            self.min.x, self.min.y, self.min.z, self.max.x, self.max.y, self.max.z,
        ]
        .into_iter()
        .any(|value| !value.is_finite())
            || self.max.x <= self.min.x
            || self.max.y <= self.min.y
            || self.max.z <= self.min.z
        {
            return Err(CustomRendererError::UnsupportedState);
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BoxRenderer {
    pub texture_index: i32,
    pub shade: bool,
}

impl Default for BoxRenderer {
    fn default() -> Self {
        Self {
            texture_index: 0,
            shade: true,
        }
    }
}

impl CustomRenderer for BoxRenderer {
    fn name(&self) -> &str {
        "BoxRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        box_patches_with_textures(factory, CuboidBounds::UNIT, [1, 4, 2, 5, 0, 3], self.shade)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CuboidRenderer {
    pub bounds: CuboidBounds,
    pub texture_index: i32,
    pub shade: bool,
}

impl CuboidRenderer {
    pub const fn new(bounds: CuboidBounds, texture_index: i32, shade: bool) -> Self {
        Self {
            bounds,
            texture_index,
            shade,
        }
    }

    pub const fn empty() -> Self {
        Self {
            bounds: CuboidBounds::new(Vec3::ZERO, Vec3::ZERO),
            texture_index: 0,
            shade: true,
        }
    }
}

impl CustomRenderer for CuboidRenderer {
    fn name(&self) -> &str {
        "CuboidRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        if self.bounds.min == self.bounds.max {
            return Ok(Vec::new());
        }
        box_patches(factory, self.bounds, self.texture_index, self.shade)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PlantRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for PlantRenderer {
    fn name(&self) -> &str {
        "PlantRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let diagonal_a = factory.patch_with_side(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(1.0, 1.0, 0.0),
            crate::renderer::dynmap::types::SideVisible::Flip,
            self.texture_index,
            false,
        )?;
        let diagonal_b = factory.rotated_patch(diagonal_a, 0.0, 90.0, 0.0, self.texture_index);
        Ok(vec![diagonal_a, diagonal_b])
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PaneRenderer {
    pub thickness: f64,
    pub texture_index: i32,
}

impl Default for PaneRenderer {
    fn default() -> Self {
        Self {
            thickness: 0.125,
            texture_index: 0,
        }
    }
}

impl CustomRenderer for PaneRenderer {
    fn name(&self) -> &str {
        "PaneRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        if !(0.0..=0.5).contains(&self.thickness) || !self.thickness.is_finite() {
            return Err(CustomRendererError::UnsupportedState);
        }
        let face = factory.patch_with_side(
            Vec3::new(0.5, 0.0, 1.0),
            Vec3::new(0.5, 0.0, 0.0),
            Vec3::new(0.5, 1.0, 1.0),
            crate::renderer::dynmap::types::SideVisible::Both,
            self.texture_index,
            true,
        )?;
        let edge = factory.patch_with_uv_bounds(
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(1.0, 1.0, 0.0),
            Vec3::new(0.0, 1.0, 1.0),
            (0.4375, 0.5625, 0.0, 1.0),
            (
                crate::renderer::dynmap::types::SideVisible::Both,
                self.texture_index + 1,
                true,
            ),
        )?;
        Ok(vec![
            face,
            factory.rotated_patch(face, 0.0, 90.0, 0.0, self.texture_index),
            edge,
            factory.rotated_patch(edge, 0.0, 90.0, 0.0, self.texture_index + 1),
        ])
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FrameRenderer {
    pub border: f64,
    pub texture_index: i32,
}

impl Default for FrameRenderer {
    fn default() -> Self {
        Self {
            border: 0.125,
            texture_index: 0,
        }
    }
}

impl CustomRenderer for FrameRenderer {
    fn name(&self) -> &str {
        "FrameRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        if !(0.0..=0.5).contains(&self.border) || !self.border.is_finite() {
            return Err(CustomRendererError::UnsupportedState);
        }
        let inner = self.border;
        let outer = 1.0 - self.border;
        let bounds = [
            CuboidBounds::new(Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 1.0, inner)),
            CuboidBounds::new(Vec3::new(0.0, 0.0, outer), Vec3::new(1.0, 1.0, 1.0)),
            CuboidBounds::new(Vec3::new(0.0, 0.0, inner), Vec3::new(inner, 1.0, outer)),
            CuboidBounds::new(Vec3::new(outer, 0.0, inner), Vec3::new(1.0, 1.0, outer)),
        ];
        let mut patches = Vec::with_capacity(bounds.len() * 6);
        for cuboid in bounds {
            patches.extend(box_patches(factory, cuboid, self.texture_index, true)?);
        }
        Ok(patches)
    }
}

impl CuboidBounds {
    pub(crate) const fn new(min: Vec3, max: Vec3) -> Self {
        Self { min, max }
    }
}

pub(crate) fn box_patches(
    factory: &RenderPatchFactory,
    bounds: CuboidBounds,
    texture_index: i32,
    shade: bool,
) -> Result<Vec<PatchDefinition>, CustomRendererError> {
    box_patches_with_textures(factory, bounds, [texture_index; 6], shade)
}

pub(crate) fn box_patches_with_textures(
    factory: &RenderPatchFactory,
    bounds: CuboidBounds,
    texture_indices: [i32; 6],
    shade: bool,
) -> Result<Vec<PatchDefinition>, CustomRendererError> {
    let bounds = bounds.validate()?;
    let min = bounds.min;
    let max = bounds.max;
    // Keep the exact Dynmap CustomRenderer.addBox order and point winding:
    // bottom, top, x-, x+, z-, z+.
    let faces = [
        (
            Vec3::new(min.x, min.y, min.z),
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(min.x, min.y, max.z),
            BlockStep::YMinus,
        ),
        (
            Vec3::new(min.x, max.y, max.z),
            Vec3::new(max.x, max.y, max.z),
            Vec3::new(min.x, max.y, min.z),
            BlockStep::YPlus,
        ),
        (
            Vec3::new(min.x, min.y, min.z),
            Vec3::new(min.x, min.y, max.z),
            Vec3::new(min.x, max.y, min.z),
            BlockStep::XMinus,
        ),
        (
            Vec3::new(max.x, min.y, max.z),
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(max.x, max.y, max.z),
            BlockStep::XPlus,
        ),
        (
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(min.x, min.y, min.z),
            Vec3::new(max.x, max.y, min.z),
            BlockStep::ZMinus,
        ),
        (
            Vec3::new(min.x, min.y, max.z),
            Vec3::new(max.x, min.y, max.z),
            Vec3::new(min.x, max.y, max.z),
            BlockStep::ZPlus,
        ),
    ];
    faces
        .into_iter()
        .zip(texture_indices)
        .map(|((origin, u_end, v_end, cullface), texture_index)| {
            Ok(factory
                .patch_with_side(
                    origin,
                    u_end,
                    v_end,
                    crate::renderer::dynmap::types::SideVisible::Top,
                    texture_index,
                    shade,
                )?
                .with_cullface(Some(cullface)))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{
        BoxRenderer, CuboidBounds, CuboidRenderer, FrameRenderer, PaneRenderer, PlantRenderer,
    };
    use crate::renderer::dynmap::custom::CustomRenderer;
    use crate::renderer::dynmap::types::Vec3;
    use crate::world::chunk_view::{
        BiomeData, BlockStateId, ChunkCoord, ChunkLoadState, HeightData, MapChunkCache,
        TileBoundaryState,
    };
    use crate::{
        assets::model_view::AssetResolutionState, renderer::dynmap::custom::DynmapBlockState,
    };

    fn fixture_chunk() -> MapChunkCache {
        MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            BTreeMap::new(),
            BiomeData::Missing,
            HeightData::Missing,
            TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )
    }

    fn fixture_state() -> DynmapBlockState {
        DynmapBlockState {
            id: BlockStateId(1).0,
            name: "minecraft:stone".to_string(),
            properties: BTreeMap::new(),
        }
    }

    #[test]
    fn unit_box_has_six_face_patches_with_cullfaces() {
        let chunk = fixture_chunk();
        let context = crate::renderer::dynmap::custom::MapDataContext::new(
            &chunk,
            crate::world::chunk_view::BlockCoord::new(0, 0, 0),
        );
        let state = fixture_state();
        let patches = BoxRenderer::default()
            .render(
                &state,
                &context,
                &crate::renderer::dynmap::custom::RenderPatchFactory,
            )
            .expect("box renderer");
        assert_eq!(patches.len(), 6);
        assert!(patches.iter().all(|patch| patch.cullface.is_some()));
    }

    #[test]
    fn cuboid_and_crossed_plant_have_explicit_geometry() {
        let chunk = fixture_chunk();
        let context = crate::renderer::dynmap::custom::MapDataContext::new(
            &chunk,
            crate::world::chunk_view::BlockCoord::new(0, 0, 0),
        );
        let state = fixture_state();
        let factory = crate::renderer::dynmap::custom::RenderPatchFactory;
        let cuboid = CuboidRenderer::new(
            CuboidBounds {
                min: Vec3::new(0.125, 0.0, 0.125),
                max: Vec3::new(0.875, 1.0, 0.875),
            },
            2,
            true,
        )
        .render(&state, &context, &factory)
        .expect("cuboid renderer");
        let plant = PlantRenderer::default()
            .render(&state, &context, &factory)
            .expect("plant renderer");
        assert_eq!(cuboid.len(), 6);
        assert_eq!(plant.len(), 2);
        assert!(plant.iter().all(|patch| patch.cullface.is_none()));
    }

    #[test]
    fn pane_and_frame_reject_invalid_dimensions_and_emit_geometry() {
        let chunk = fixture_chunk();
        let context = crate::renderer::dynmap::custom::MapDataContext::new(
            &chunk,
            crate::world::chunk_view::BlockCoord::new(0, 0, 0),
        );
        let state = fixture_state();
        let factory = crate::renderer::dynmap::custom::RenderPatchFactory;
        assert!(PaneRenderer {
            thickness: 0.6,
            texture_index: 0
        }
        .render(&state, &context, &factory)
        .is_err());
        assert_eq!(
            PaneRenderer::default()
                .render(&state, &context, &factory)
                .expect("pane renderer")
                .len(),
            4
        );
        assert_eq!(
            FrameRenderer::default()
                .render(&state, &context, &factory)
                .expect("frame renderer")
                .len(),
            24
        );
    }
}
