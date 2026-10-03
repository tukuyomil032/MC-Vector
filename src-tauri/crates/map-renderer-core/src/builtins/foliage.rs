//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/PlantRenderer.java,
//! VineStateRenderer.java, GlowLichenStateRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Attachment faces are represented as explicit double-sided patches
//! and state properties are validated before rendering.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

#[derive(Debug, Clone, Copy, Default)]
pub struct LeavesRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for LeavesRenderer {
    fn name(&self) -> &str {
        "LeavesRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let first = factory.patch(
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 1.0, 1.0),
            Vec3::new(1.0, 0.0, 1.0),
            self.texture_index,
            true,
        )?;
        let second = factory.patch(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 1.0),
            Vec3::new(0.0, 0.0, 1.0),
            self.texture_index,
            true,
        )?;
        Ok(vec![first, second])
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct VineRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for VineRenderer {
    fn name(&self) -> &str {
        "VineStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        attached_patches(state, factory, self.texture_index)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct GlowLichenRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for GlowLichenRenderer {
    fn name(&self) -> &str {
        "GlowLichenStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        attached_patches(state, factory, self.texture_index)
    }
}

fn attached_patches(
    state: &DynmapBlockState,
    factory: &RenderPatchFactory,
    texture_index: i32,
) -> Result<Vec<PatchDefinition>, CustomRendererError> {
    let north = bool_property(state, "north")?;
    let east = bool_property(state, "east")?;
    let south = bool_property(state, "south")?;
    let west = bool_property(state, "west")?;
    let up = bool_property(state, "up")?;
    let down = bool_property(state, "down")?;
    let mut patches = Vec::new();
    if north {
        patches.push(factory.patch(
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            texture_index,
            true,
        )?);
    }
    if south {
        patches.push(factory.patch(
            Vec3::new(1.0, 0.0, 1.0),
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(1.0, 1.0, 1.0),
            texture_index,
            true,
        )?);
    }
    if west {
        patches.push(factory.patch(
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 1.0),
            texture_index,
            true,
        )?);
    }
    if east {
        patches.push(factory.patch(
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 1.0),
            Vec3::new(1.0, 1.0, 0.0),
            texture_index,
            true,
        )?);
    }
    if up {
        patches.push(factory.patch(
            Vec3::new(0.0, 1.0, 0.0),
            Vec3::new(1.0, 1.0, 0.0),
            Vec3::new(0.0, 1.0, 1.0),
            texture_index,
            true,
        )?);
    }
    if down {
        patches.push(factory.patch(
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(1.0, 0.0, 1.0),
            Vec3::new(0.0, 0.0, 0.0),
            texture_index,
            true,
        )?);
    }
    if patches.is_empty() {
        return Err(CustomRendererError::UnsupportedState);
    }
    Ok(patches)
}

fn bool_property(state: &DynmapBlockState, property: &str) -> Result<bool, CustomRendererError> {
    match state.properties.get(property).map(String::as_str) {
        None | Some("false") => Ok(false),
        Some("true") => Ok(true),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{GlowLichenRenderer, LeavesRenderer, VineRenderer};
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
    fn leaves_are_two_double_sided_crossed_quads() {
        let patches = LeavesRenderer::default()
            .render(
                &state("minecraft:oak_leaves"),
                &context(),
                &RenderPatchFactory,
            )
            .expect("leaves");
        assert_eq!(patches.len(), 2);
        assert!(patches
            .iter()
            .all(|patch| patch.side_visible == crate::renderer::dynmap::types::SideVisible::Both));
    }

    #[test]
    fn attachment_faces_are_selected_from_validated_state() {
        let mut vine_state = state("minecraft:vine");
        vine_state.properties.insert("north".into(), "true".into());
        vine_state.properties.insert("up".into(), "true".into());
        let patches = VineRenderer::default()
            .render(&vine_state, &context(), &RenderPatchFactory)
            .expect("vine");
        assert_eq!(patches.len(), 2);
        assert!(GlowLichenRenderer::default()
            .render(
                &state("minecraft:glow_lichen"),
                &context(),
                &RenderPatchFactory
            )
            .is_err());
        vine_state.properties.insert("north".into(), "maybe".into());
        assert!(VineRenderer::default()
            .render(&vine_state, &context(), &RenderPatchFactory)
            .is_err());
    }
}
