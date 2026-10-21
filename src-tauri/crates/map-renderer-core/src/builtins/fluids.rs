//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FluidStateRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Fluid state and neighbor culling use source-independent block views.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

#[derive(Debug, Clone, Copy, Default)]
pub struct FluidRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for FluidRenderer {
    fn name(&self) -> &str {
        "FluidStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let fluid = fluid_kind(&state.name).ok_or(CustomRendererError::UnsupportedState)?;
        let level = state
            .properties
            .get("level")
            .map(String::as_str)
            .unwrap_or("0")
            .parse::<u8>()
            .map_err(|_| CustomRendererError::UnsupportedState)?;
        if level > 8 {
            return Err(CustomRendererError::UnsupportedState);
        }
        if let Some(falling) = state.properties.get("falling") {
            if !matches!(falling.as_str(), "true" | "false") {
                return Err(CustomRendererError::UnsupportedState);
            }
        }
        let height = if level == 0 {
            1.0
        } else {
            (1.0 - f64::from(level) / 8.0).max(0.125)
        };
        let mut patches = vec![factory.patch(
            Vec3::new(0.0, height, 0.0),
            Vec3::new(1.0, height, 0.0),
            Vec3::new(0.0, height, 1.0),
            self.texture_index,
            false,
        )?];
        let neighbor_offsets = [
            (
                (0, 0, -1),
                (Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0)),
            ),
            (
                (0, 0, 1),
                (Vec3::new(1.0, 0.0, 1.0), Vec3::new(0.0, 0.0, 1.0)),
            ),
            (
                (-1, 0, 0),
                (Vec3::new(0.0, 0.0, 1.0), Vec3::new(0.0, 0.0, 0.0)),
            ),
            (
                (1, 0, 0),
                (Vec3::new(1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 1.0)),
            ),
        ];
        for (offset, (origin, u_end)) in neighbor_offsets {
            let neighbor = context.neighbor_state(offset)?;
            if fluid_kind(&neighbor.name) == Some(fluid) {
                continue;
            }
            let v_end = Vec3::new(origin.x, height, origin.z);
            let raised_origin = Vec3::new(origin.x, 0.0, origin.z);
            let raised_u_end = Vec3::new(u_end.x, 0.0, u_end.z);
            patches.push(factory.patch(
                raised_origin,
                raised_u_end,
                v_end,
                self.texture_index,
                true,
            )?);
        }
        patches.push(factory.patch(
            Vec3::new(0.0, 0.0, 1.0),
            Vec3::new(1.0, 0.0, 1.0),
            Vec3::new(0.0, 0.0, 0.0),
            self.texture_index,
            true,
        )?);
        Ok(patches)
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum FluidKind {
    Water,
    Lava,
}

fn fluid_kind(name: &str) -> Option<FluidKind> {
    if name.contains("water") {
        Some(FluidKind::Water)
    } else if name.contains("lava") {
        Some(FluidKind::Lava)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::FluidRenderer;
    use crate::assets::model_view::AssetResolutionState;
    use crate::renderer::dynmap::custom::{
        CustomRenderer, DynmapBlockState, MapDataContext, RenderPatchFactory,
    };
    use crate::world::chunk_view::{
        BiomeData, BlockCoord, BlockState, BlockStateData, BlockStateId, ChunkCoord,
        ChunkLoadState, ChunkSection, HeightData, LightData, MapChunkCache, SectionPalette,
        TileBoundaryState, CHUNK_COLUMN_COUNT, SECTION_BLOCK_COUNT,
    };

    fn context() -> MapDataContext<'static> {
        let section = ChunkSection {
            section_y: 0,
            block_states: BlockStateData::complete(
                SectionPalette::complete(vec![BlockState {
                    id: BlockStateId(1),
                    name: "minecraft:water".to_string(),
                    properties: BTreeMap::new(),
                }])
                .expect("palette"),
                vec![0; SECTION_BLOCK_COUNT],
            )
            .expect("block data"),
            biome: BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).expect("biome"),
            height: HeightData::complete(vec![0; CHUNK_COLUMN_COUNT]).expect("height"),
            sky_light: LightData::complete(vec![15; SECTION_BLOCK_COUNT]).expect("sky"),
            block_light: LightData::complete(vec![0; SECTION_BLOCK_COUNT]).expect("block"),
        };
        let mut sections = BTreeMap::new();
        sections.insert(0, section);
        let chunk = Box::leak(Box::new(MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            sections,
            BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).expect("biome"),
            HeightData::complete(vec![0; CHUNK_COLUMN_COUNT]).expect("height"),
            TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )));
        MapDataContext::new(chunk, BlockCoord::new(1, 0, 1))
    }

    fn state(level: &str) -> DynmapBlockState {
        let mut properties = BTreeMap::new();
        properties.insert("level".to_string(), level.to_string());
        DynmapBlockState {
            id: 1,
            name: "minecraft:water".to_string(),
            properties,
        }
    }

    #[test]
    fn same_fluid_neighbors_cull_sides_and_level_controls_top_height() {
        let patches = FluidRenderer::default()
            .render(&state("4"), &context(), &RenderPatchFactory)
            .expect("water");
        assert_eq!(patches.len(), 2);
        assert!(patches.iter().any(|patch| patch.bounds().max.y == 0.5));
    }

    #[test]
    fn unsupported_fluid_state_is_not_guessed() {
        let mut state = state("9");
        assert!(FluidRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
        state.properties.insert("level".into(), "0".into());
        state.properties.insert("falling".into(), "maybe".into());
        assert!(FluidRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
    }
}
