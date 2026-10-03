//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/RedstoneWireRenderer.java,
//! RedstoneWireStateRenderer.java, RailCraftTrackRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: State properties are explicit and rail/redstone topology is emitted as patches.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

#[derive(Debug, Clone, Copy, Default)]
pub struct RailRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for RailRenderer {
    fn name(&self) -> &str {
        "RailCraftTrackRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let shape = state
            .properties
            .get("shape")
            .map(String::as_str)
            .unwrap_or("north_south");
        let (origin, u_end, v_end) = match shape {
            "north_south" => (
                Vec3::new(0.0, 0.0625, 0.4375),
                Vec3::new(1.0, 0.0625, 0.4375),
                Vec3::new(0.0, 0.0625, 0.5625),
            ),
            "east_west" => (
                Vec3::new(0.4375, 0.0625, 0.0),
                Vec3::new(0.4375, 0.0625, 1.0),
                Vec3::new(0.5625, 0.0625, 0.0),
            ),
            "ascending_north" => (
                Vec3::new(0.0, 1.0625, 0.4375),
                Vec3::new(1.0, 1.0625, 0.4375),
                Vec3::new(0.0, 0.0625, 0.5625),
            ),
            "ascending_south" => (
                Vec3::new(0.0, 0.0625, 0.4375),
                Vec3::new(1.0, 0.0625, 0.4375),
                Vec3::new(0.0, 1.0625, 0.5625),
            ),
            "ascending_west" => (
                Vec3::new(0.4375, 1.0625, 0.0),
                Vec3::new(0.4375, 0.0625, 1.0),
                Vec3::new(0.5625, 1.0625, 0.0),
            ),
            "ascending_east" => (
                Vec3::new(0.4375, 0.0625, 0.0),
                Vec3::new(0.4375, 1.0625, 1.0),
                Vec3::new(0.5625, 0.0625, 0.0),
            ),
            _ => return Err(CustomRendererError::UnsupportedState),
        };
        Ok(vec![factory.patch(
            origin,
            u_end,
            v_end,
            self.texture_index,
            false,
        )?])
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RedstoneWireRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for RedstoneWireRenderer {
    fn name(&self) -> &str {
        "RedstoneWireStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let connections = ["north", "south", "east", "west"]
            .into_iter()
            .map(|direction| connection(state, direction))
            .collect::<Result<Vec<_>, _>>()?;
        let mut patches = vec![factory.patch(
            Vec3::new(0.3125, 0.01, 0.3125),
            Vec3::new(0.6875, 0.01, 0.3125),
            Vec3::new(0.3125, 0.01, 0.6875),
            self.texture_index,
            false,
        )?];
        for (index, kind) in connections.into_iter().enumerate() {
            if kind == Connection::None {
                continue;
            }
            let (origin, u_end, v_end) = match index {
                0 => (
                    Vec3::new(0.3125, 0.01, 0.0),
                    Vec3::new(0.6875, 0.01, 0.0),
                    Vec3::new(0.3125, 0.01, 0.3125),
                ),
                1 => (
                    Vec3::new(0.3125, 0.01, 0.6875),
                    Vec3::new(0.6875, 0.01, 0.6875),
                    Vec3::new(0.3125, 0.01, 1.0),
                ),
                2 => (
                    Vec3::new(0.0, 0.01, 0.3125),
                    Vec3::new(0.3125, 0.01, 0.3125),
                    Vec3::new(0.0, 0.01, 0.6875),
                ),
                3 => (
                    Vec3::new(0.6875, 0.01, 0.3125),
                    Vec3::new(1.0, 0.01, 0.3125),
                    Vec3::new(0.6875, 0.01, 0.6875),
                ),
                _ => unreachable!(),
            };
            patches.push(factory.patch(origin, u_end, v_end, self.texture_index, false)?);
            if kind == Connection::Up {
                patches.push(factory.patch(
                    origin,
                    v_end,
                    Vec3::new(origin.x, 0.5, origin.z),
                    self.texture_index,
                    true,
                )?);
            }
        }
        Ok(patches)
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
enum Connection {
    None,
    Side,
    Up,
}

fn connection(
    state: &DynmapBlockState,
    direction: &str,
) -> Result<Connection, CustomRendererError> {
    match state.properties.get(direction).map(String::as_str) {
        None | Some("none") => Ok(Connection::None),
        Some("side") => Ok(Connection::Side),
        Some("up") => Ok(Connection::Up),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{RailRenderer, RedstoneWireRenderer};
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

    #[test]
    fn rail_shapes_emit_a_surface_and_reject_unknown_shape() {
        let mut state = DynmapBlockState {
            id: 1,
            name: "minecraft:rail".to_string(),
            properties: BTreeMap::new(),
        };
        state
            .properties
            .insert("shape".into(), "ascending_east".into());
        let patch = RailRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .expect("rail");
        assert_eq!(patch.len(), 1);
        state.properties.insert("shape".into(), "diagonal".into());
        assert!(RailRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
    }

    #[test]
    fn redstone_connection_modes_emit_explicit_topology() {
        let mut state = DynmapBlockState {
            id: 1,
            name: "minecraft:redstone_wire".to_string(),
            properties: BTreeMap::new(),
        };
        state.properties.insert("north".into(), "up".into());
        state.properties.insert("south".into(), "side".into());
        let patches = RedstoneWireRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .expect("redstone");
        assert_eq!(patches.len(), 4);
        state.properties.insert("north".into(), "broken".into());
        assert!(RedstoneWireRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
    }
}
