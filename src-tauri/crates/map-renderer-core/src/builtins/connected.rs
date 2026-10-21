//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/FenceWallBlockRenderer.java,
//! FenceWallBlockStateRenderer.java, PaneRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Neighbor lookup is performed through MapDataContext and missing
//! neighboring chunk data remains an explicit renderer error.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

use super::simple::{box_patches, CuboidBounds};

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum ConnectionFamily {
    Fence,
    Wall,
    Pane,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct FenceRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for FenceRenderer {
    fn name(&self) -> &str {
        "FenceWallBlockStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        connected_geometry(
            state,
            context,
            factory,
            ConnectedGeometrySpec {
                family: ConnectionFamily::Fence,
                texture_index: self.texture_index,
                arm_half_width: 0.25,
                y_min: 0.0,
                y_max: 1.0,
            },
        )
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct WallRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for WallRenderer {
    fn name(&self) -> &str {
        "FenceWallBlockRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        connected_geometry(
            state,
            context,
            factory,
            ConnectedGeometrySpec {
                family: ConnectionFamily::Wall,
                texture_index: self.texture_index,
                arm_half_width: 0.25,
                y_min: 0.0,
                y_max: 0.8125,
            },
        )
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ConnectedPaneRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for ConnectedPaneRenderer {
    fn name(&self) -> &str {
        "PaneStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        connected_geometry(
            state,
            context,
            factory,
            ConnectedGeometrySpec {
                family: ConnectionFamily::Pane,
                texture_index: self.texture_index,
                arm_half_width: 0.125,
                y_min: 0.0,
                y_max: 1.0,
            },
        )
    }
}

#[derive(Debug, Clone, Copy)]
struct ConnectedGeometrySpec {
    family: ConnectionFamily,
    texture_index: i32,
    arm_half_width: f64,
    y_min: f64,
    y_max: f64,
}

fn connected_geometry(
    state: &DynmapBlockState,
    context: &MapDataContext<'_>,
    factory: &RenderPatchFactory,
    spec: ConnectedGeometrySpec,
) -> Result<Vec<PatchDefinition>, CustomRendererError> {
    let north = connects(context, (0, 0, -1), spec.family)?;
    let east = connects(context, (1, 0, 0), spec.family)?;
    let south = connects(context, (0, 0, 1), spec.family)?;
    let west = connects(context, (-1, 0, 0), spec.family)?;
    let center = CuboidBounds::new(
        Vec3::new(
            0.5 - spec.arm_half_width,
            spec.y_min,
            0.5 - spec.arm_half_width,
        ),
        Vec3::new(
            0.5 + spec.arm_half_width,
            spec.y_max,
            0.5 + spec.arm_half_width,
        ),
    );
    let mut parts = vec![center];
    if north {
        parts.push(CuboidBounds::new(
            Vec3::new(0.5 - spec.arm_half_width, spec.y_min, 0.0),
            Vec3::new(0.5 + spec.arm_half_width, spec.y_max, 0.5),
        ));
    }
    if east {
        parts.push(CuboidBounds::new(
            Vec3::new(0.5, spec.y_min, 0.5 - spec.arm_half_width),
            Vec3::new(1.0, spec.y_max, 0.5 + spec.arm_half_width),
        ));
    }
    if south {
        parts.push(CuboidBounds::new(
            Vec3::new(0.5 - spec.arm_half_width, spec.y_min, 0.5),
            Vec3::new(0.5 + spec.arm_half_width, spec.y_max, 1.0),
        ));
    }
    if west {
        parts.push(CuboidBounds::new(
            Vec3::new(0.0, spec.y_min, 0.5 - spec.arm_half_width),
            Vec3::new(0.5, spec.y_max, 0.5 + spec.arm_half_width),
        ));
    }
    if parts.len() == 1 && !is_expected_family(state, spec.family) {
        return Err(CustomRendererError::UnsupportedState);
    }
    parts
        .into_iter()
        .map(|bounds| box_patches(factory, bounds, spec.texture_index, true))
        .collect::<Result<Vec<_>, _>>()
        .map(|groups| groups.into_iter().flatten().collect())
}

fn connects(
    context: &MapDataContext<'_>,
    offset: (i64, i32, i64),
    family: ConnectionFamily,
) -> Result<bool, CustomRendererError> {
    let neighbor = context.neighbor_state(offset)?;
    Ok(is_expected_family(&neighbor, family))
}

fn is_expected_family(state: &DynmapBlockState, family: ConnectionFamily) -> bool {
    match family {
        ConnectionFamily::Fence => state.name.contains("_fence"),
        ConnectionFamily::Wall => state.name.contains("_wall"),
        ConnectionFamily::Pane => state.name.contains("pane") || state.name.contains("glass"),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{ConnectedPaneRenderer, FenceRenderer, WallRenderer};
    use crate::assets::model_view::AssetResolutionState;
    use crate::renderer::dynmap::custom::{
        CustomRenderer, DynmapBlockState, MapDataContext, RenderPatchFactory,
    };
    use crate::world::chunk_view::{
        BiomeData, BlockCoord, BlockState, BlockStateData, BlockStateId, ChunkCoord,
        ChunkLoadState, ChunkSection, HeightData, LightData, MapChunkCache, SectionPalette,
        TileBoundaryState, CHUNK_COLUMN_COUNT, SECTION_BLOCK_COUNT,
    };

    fn context(neighbor_name: &str) -> (MapDataContext<'static>, DynmapBlockState) {
        let mut indices = vec![0_u16; SECTION_BLOCK_COUNT];
        for (x, z) in [(1_usize, 0_usize), (2, 1), (1, 2), (0, 1)] {
            indices[z * 16 + x] = 1;
        }
        let section = ChunkSection {
            section_y: 0,
            block_states: BlockStateData::complete(
                SectionPalette::complete(vec![
                    BlockState {
                        id: BlockStateId(0),
                        name: "minecraft:air".to_string(),
                        properties: BTreeMap::new(),
                    },
                    BlockState {
                        id: BlockStateId(1),
                        name: neighbor_name.to_string(),
                        properties: BTreeMap::new(),
                    },
                ])
                .expect("palette"),
                indices,
            )
            .expect("block data"),
            biome: BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).expect("section biome"),
            height: HeightData::complete(vec![0; CHUNK_COLUMN_COUNT]).expect("section height"),
            sky_light: LightData::complete(vec![15; SECTION_BLOCK_COUNT]).expect("sky light"),
            block_light: LightData::complete(vec![0; SECTION_BLOCK_COUNT]).expect("block light"),
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
        let context = MapDataContext::new(chunk, BlockCoord::new(1, 0, 1));
        let state = DynmapBlockState {
            id: 1,
            name: "minecraft:oak_fence".to_string(),
            properties: BTreeMap::new(),
        };
        (context, state)
    }

    fn missing_context() -> (MapDataContext<'static>, DynmapBlockState) {
        let chunk = Box::leak(Box::new(MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            BTreeMap::new(),
            BiomeData::Missing,
            HeightData::Missing,
            TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )));
        let context = MapDataContext::new(chunk, BlockCoord::new(1, 0, 1));
        let state = DynmapBlockState {
            id: 1,
            name: "minecraft:oak_fence".to_string(),
            properties: BTreeMap::new(),
        };
        (context, state)
    }

    #[test]
    fn neighbors_create_four_connected_arms() {
        let (context, state) = context("minecraft:oak_fence");
        let patches = FenceRenderer::default()
            .render(&state, &context, &RenderPatchFactory)
            .expect("connected fence");
        assert_eq!(patches.len(), 30);
    }

    #[test]
    fn family_specific_renderers_use_the_same_neighbor_contract() {
        let (pane_context, mut state) = context("minecraft:glass_pane");
        state.name = "minecraft:glass_pane".to_string();
        let pane = ConnectedPaneRenderer::default()
            .render(&state, &pane_context, &RenderPatchFactory)
            .expect("connected pane");
        assert_eq!(pane.len(), 30);

        let (wall_context, wall_state) = context("minecraft:stone_wall");
        let wall = WallRenderer::default()
            .render(&wall_state, &wall_context, &RenderPatchFactory)
            .expect("connected wall");
        assert_eq!(wall.len(), 30);
    }

    #[test]
    fn missing_neighbor_section_is_not_treated_as_disconnected() {
        let (context, state) = missing_context();
        assert!(FenceRenderer::default()
            .render(&state, &context, &RenderPatchFactory)
            .is_err());
    }
}
