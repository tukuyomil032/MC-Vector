//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/DoorRenderer.java,
//! DoorStateRenderer.java, FenceGateBlockStateRenderer.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Uses explicit Minecraft state properties and source-independent patches.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

use super::advanced::{rotate_bounds_for_facing, Facing};
use super::simple::{box_patches, CuboidBounds};

#[derive(Debug, Clone, Copy, Default)]
pub struct DoorRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for DoorRenderer {
    fn name(&self) -> &str {
        "DoorStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let facing = Facing::parse(state, "facing")?;
        let open = bool_property(state, "open")?;
        let hinge_left = matches!(
            state.properties.get("hinge").map(String::as_str),
            Some("left")
        );
        let upper = matches!(
            state.properties.get("half").map(String::as_str),
            Some("upper")
        );
        let y_min = if upper { 0.5 } else { 0.0 };
        let y_max = if upper { 1.0 } else { 0.5 };
        let bounds = door_bounds(facing, open, hinge_left, y_min, y_max);
        box_patches(factory, bounds, self.texture_index, true)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TrapdoorRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for TrapdoorRenderer {
    fn name(&self) -> &str {
        "TrapdoorRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let facing = Facing::parse(state, "facing")?;
        let open = bool_property(state, "open")?;
        let top = matches!(
            state.properties.get("half").map(String::as_str),
            Some("top")
        );
        let bounds = if open {
            rotate_bounds_for_facing(
                CuboidBounds::new(Vec3::new(0.0, 0.0, 0.0), Vec3::new(0.1875, 1.0, 1.0)),
                facing,
            )
        } else {
            let y_min = if top { 0.8125 } else { 0.0 };
            CuboidBounds::new(
                Vec3::new(0.0, y_min, 0.0),
                Vec3::new(1.0, y_min + 0.1875, 1.0),
            )
        };
        box_patches(factory, bounds, self.texture_index, true)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct FenceGateRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for FenceGateRenderer {
    fn name(&self) -> &str {
        "FenceGateBlockStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let facing = Facing::parse(state, "facing")?;
        let open = bool_property(state, "open")?;
        let in_wall = bool_property(state, "in_wall")?;
        let (y_min, y_max) = if in_wall {
            (0.125, 0.8125)
        } else {
            (0.3125, 1.0)
        };
        let mut parts = vec![
            CuboidBounds::new(
                Vec3::new(0.0, y_min, 0.4375),
                Vec3::new(0.125, y_max, 0.5625),
            ),
            CuboidBounds::new(
                Vec3::new(0.875, y_min, 0.4375),
                Vec3::new(1.0, y_max, 0.5625),
            ),
        ];
        if open {
            parts.extend([
                CuboidBounds::new(
                    Vec3::new(0.0, y_min, 0.375),
                    Vec3::new(0.125, y_max - 0.0625, 0.9375),
                ),
                CuboidBounds::new(
                    Vec3::new(0.875, y_min, 0.375),
                    Vec3::new(1.0, y_max - 0.0625, 0.9375),
                ),
            ]);
        } else {
            parts.extend([
                CuboidBounds::new(
                    Vec3::new(0.125, y_min, 0.4375),
                    Vec3::new(0.5, y_max - 0.0625, 0.5625),
                ),
                CuboidBounds::new(
                    Vec3::new(0.5, y_min, 0.4375),
                    Vec3::new(0.875, y_max - 0.0625, 0.5625),
                ),
            ]);
        }
        parts
            .into_iter()
            .map(|bounds| {
                box_patches(
                    factory,
                    rotate_bounds_for_facing(bounds, facing),
                    self.texture_index,
                    true,
                )
            })
            .collect::<Result<Vec<_>, _>>()
            .map(|groups| groups.into_iter().flatten().collect())
    }
}

fn door_bounds(
    facing: Facing,
    open: bool,
    hinge_left: bool,
    y_min: f64,
    y_max: f64,
) -> CuboidBounds {
    let thin = 0.1875;
    let base = if open {
        let x_min = if hinge_left { 0.0 } else { 1.0 - thin };
        CuboidBounds::new(
            Vec3::new(x_min, y_min, 0.0),
            Vec3::new(x_min + thin, y_max, 1.0),
        )
    } else {
        CuboidBounds::new(Vec3::new(0.0, y_min, 0.0), Vec3::new(1.0, y_max, thin))
    };
    rotate_bounds_for_facing(base, facing)
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

    use super::{DoorRenderer, FenceGateRenderer, TrapdoorRenderer};
    use crate::assets::model_view::AssetResolutionState;
    use crate::renderer::dynmap::custom::{
        CustomRenderer, DynmapBlockState, MapDataContext, RenderPatchFactory,
    };
    use crate::world::chunk_view::{
        BiomeData, BlockCoord, ChunkCoord, ChunkLoadState, HeightData, MapChunkCache,
        TileBoundaryState,
    };

    fn context() -> (MapDataContext<'static>, DynmapBlockState) {
        let chunk = Box::leak(Box::new(MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            BTreeMap::new(),
            BiomeData::Missing,
            HeightData::Missing,
            TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )));
        let context = MapDataContext::new(chunk, BlockCoord::new(0, 0, 0));
        let state = DynmapBlockState {
            id: 1,
            name: "minecraft:oak_door".to_string(),
            properties: BTreeMap::new(),
        };
        (context, state)
    }

    #[test]
    fn door_open_and_hinge_change_the_thin_panel_bounds() {
        let (context, mut state) = context();
        state.properties.insert("facing".into(), "north".into());
        state.properties.insert("half".into(), "lower".into());
        let factory = RenderPatchFactory;
        let closed = DoorRenderer::default()
            .render(&state, &context, &factory)
            .expect("closed door");
        state.properties.insert("open".into(), "true".into());
        state.properties.insert("hinge".into(), "left".into());
        let open = DoorRenderer::default()
            .render(&state, &context, &factory)
            .expect("open door");
        assert_eq!(closed.len(), 6);
        assert_eq!(open.len(), 6);
        assert_ne!(closed[0].bounds(), open[0].bounds());
    }

    #[test]
    fn trapdoor_and_gate_switch_between_horizontal_and_open_geometry() {
        let (context, mut state) = context();
        state.name = "minecraft:oak_trapdoor".to_string();
        state.properties.insert("facing".into(), "east".into());
        state.properties.insert("half".into(), "top".into());
        let factory = RenderPatchFactory;
        let closed = TrapdoorRenderer::default()
            .render(&state, &context, &factory)
            .expect("closed trapdoor");
        state.properties.insert("open".into(), "true".into());
        let open = TrapdoorRenderer::default()
            .render(&state, &context, &factory)
            .expect("open trapdoor");
        assert_eq!(closed.len(), 6);
        assert_eq!(open.len(), 6);
        assert_ne!(closed[0].bounds(), open[0].bounds());

        state.name = "minecraft:oak_fence_gate".to_string();
        state.properties.insert("open".into(), "false".into());
        state.properties.insert("in_wall".into(), "false".into());
        let gate = FenceGateRenderer::default()
            .render(&state, &context, &factory)
            .expect("closed gate");
        assert_eq!(gate.len(), 24);
    }

    #[test]
    fn invalid_boolean_state_is_not_guessed() {
        let (context, mut state) = context();
        state.properties.insert("open".into(), "maybe".into());
        assert!(DoorRenderer::default()
            .render(&state, &context, &RenderPatchFactory)
            .is_err());
    }
}
