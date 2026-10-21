//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/renderer/*.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: State-indexed Dynmap registrations are represented by explicit
//! state properties; optional mod tile-entity data is never guessed.

use crate::renderer::dynmap::custom::{
    CustomRenderer, CustomRendererError, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use crate::renderer::dynmap::patch::PatchDefinition;
use crate::renderer::dynmap::types::Vec3;

use super::advanced::{RotatedBoxRenderer, SlabRenderer, StairRenderer};
use super::connected::{ConnectedPaneRenderer, FenceRenderer, WallRenderer};
use super::containers::ChestRenderer;
use super::doors::{DoorRenderer, FenceGateRenderer};
use super::fluids::FluidRenderer;
use super::foliage::{GlowLichenRenderer, VineRenderer};
use super::rails::{RailRenderer, RedstoneWireRenderer};
use super::simple::{box_patches, box_patches_with_textures, CuboidBounds, FrameRenderer};

macro_rules! delegate_renderer {
    ($name:ident, $display_name:literal, $inner:ty) => {
        #[derive(Debug, Clone, Copy, Default)]
        pub struct $name;

        impl CustomRenderer for $name {
            fn name(&self) -> &str {
                $display_name
            }

            fn render(
                &self,
                state: &DynmapBlockState,
                context: &MapDataContext<'_>,
                factory: &RenderPatchFactory,
            ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
                <$inner>::default().render(state, context, factory)
            }
        }
    };
}

/// Dynmap's state-indexed box renderer selects a separate texture for each
/// face based on six boolean state properties.
#[derive(Debug, Clone, Copy)]
pub struct BoxStateRenderer {
    pub bounds: CuboidBounds,
    pub shade: bool,
}

impl Default for BoxStateRenderer {
    fn default() -> Self {
        Self {
            bounds: CuboidBounds::UNIT,
            shade: true,
        }
    }
}

impl CustomRenderer for BoxStateRenderer {
    fn name(&self) -> &str {
        "BoxStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let textures = [
            bool_texture(state, "down", 0)?,
            bool_texture(state, "up", 2)?,
            bool_texture(state, "west", 4)?,
            bool_texture(state, "east", 6)?,
            bool_texture(state, "north", 8)?,
            bool_texture(state, "south", 10)?,
        ];
        box_patches_with_textures(factory, self.bounds, textures, self.shade)
    }
}

fn bool_texture(
    state: &DynmapBlockState,
    property: &str,
    false_texture: i32,
) -> Result<i32, CustomRendererError> {
    match state.properties.get(property).map(String::as_str) {
        None | Some("false") => Ok(false_texture),
        Some("true") => Ok(false_texture + 1),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

/// Vertical connected-texture renderer.  The four side texture indices match
/// Dynmap's no/above/below/both-neighbor selection.
#[derive(Debug, Clone, Copy, Default)]
pub struct CtmVertTextureRenderer;

impl CustomRenderer for CtmVertTextureRenderer {
    fn name(&self) -> &str {
        "CTMVertTextureRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let above = same_state(context.neighbor_state((0, 1, 0))?, state);
        let below = same_state(context.neighbor_state((0, -1, 0))?, state);
        let side_texture = match (above, below) {
            (false, false) => 2,
            (true, false) => 3,
            (false, true) => 4,
            (true, true) => 5,
        };
        box_patches_with_textures(
            factory,
            CuboidBounds::UNIT,
            [0, 1, side_texture, side_texture, side_texture, side_texture],
            true,
        )
    }
}

fn same_state(left: DynmapBlockState, right: &DynmapBlockState) -> bool {
    left.name == right.name && left.properties == right.properties
}

delegate_renderer!(ChestStateRenderer, "ChestStateRenderer", ChestRenderer);
delegate_renderer!(
    CopyStairBlockRenderer,
    "CopyStairBlockRenderer",
    StairRenderer
);
delegate_renderer!(DoorStateRenderer, "DoorStateRenderer", DoorRenderer);
delegate_renderer!(
    FenceGateBlockRenderer,
    "FenceGateBlockRenderer",
    FenceGateRenderer
);
delegate_renderer!(
    FenceGateBlockStateRenderer,
    "FenceGateBlockStateRenderer",
    FenceGateRenderer
);
delegate_renderer!(FluidStateRenderer, "FluidStateRenderer", FluidRenderer);
delegate_renderer!(
    GlowLichenStateRenderer,
    "GlowLichenStateRenderer",
    GlowLichenRenderer
);
delegate_renderer!(
    PaneStateRenderer,
    "PaneStateRenderer",
    ConnectedPaneRenderer
);
delegate_renderer!(
    RailCraftSlabBlockRenderer,
    "RailCraftSlabBlockRenderer",
    SlabRenderer
);
delegate_renderer!(
    RailCraftTrackRenderer,
    "RailCraftTrackRenderer",
    RailRenderer
);
delegate_renderer!(
    RedstoneWireStateRenderer,
    "RedstoneWireStateRenderer",
    RedstoneWireRenderer
);
delegate_renderer!(StairBlockRenderer, "StairBlockRenderer", StairRenderer);
delegate_renderer!(StairStateRenderer, "StairStateRenderer", StairRenderer);
delegate_renderer!(VineStateRenderer, "VineStateRenderer", VineRenderer);

/// The legacy fence/wall state renderer chooses its geometry from the
/// registered block family, while retaining one explicit state contract.
#[derive(Debug, Clone, Copy, Default)]
pub struct FenceWallBlockStateRenderer;

impl CustomRenderer for FenceWallBlockStateRenderer {
    fn name(&self) -> &str {
        "FenceWallBlockStateRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        if state.name.contains("wall") {
            WallRenderer::default().render(state, context, factory)
        } else {
            FenceRenderer::default().render(state, context, factory)
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct FenceWallBlockRenderer;

impl CustomRenderer for FenceWallBlockRenderer {
    fn name(&self) -> &str {
        "FenceWallBlockRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        WallRenderer::default().render(state, context, factory)
    }
}

/// Rotation-aware resource-pack box.  The optional state property is the
/// serialized quarter-turn used by the Java renderer's tile-entity path.
#[derive(Debug, Clone, Copy, Default)]
pub struct RpRotatedBoxRenderer;

impl CustomRenderer for RpRotatedBoxRenderer {
    fn name(&self) -> &str {
        "RPRotatedBoxRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let turns = state
            .properties
            .get("rotation")
            .map(String::as_str)
            .unwrap_or("0")
            .parse::<u8>()
            .map_err(|_| CustomRendererError::UnsupportedState)?;
        if turns > 3 {
            return Err(CustomRendererError::UnsupportedState);
        }
        RotatedBoxRenderer::new(CuboidBounds::UNIT, turns, 0, true).render(state, context, factory)
    }
}

delegate_renderer!(
    RpSupportFrameRenderer,
    "RPSupportFrameRenderer",
    FrameRenderer
);

/// Micro renderers require the tile-entity bounds emitted by their source mod.
/// Missing bounds are a hard error so a mod block is never rendered as a
/// guessed full cube.
#[derive(Debug, Clone, Copy, Default)]
pub struct MicroRenderer {
    pub texture_index: i32,
}

impl CustomRenderer for MicroRenderer {
    fn name(&self) -> &str {
        "MicroRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        _context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let bounds = read_bounds(state)?;
        box_patches(factory, bounds, self.texture_index, true)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ImmibisMicroRenderer;

impl CustomRenderer for ImmibisMicroRenderer {
    fn name(&self) -> &str {
        "ImmibisMicroRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        MicroRenderer::default().render(state, context, factory)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RpMicroRenderer;

impl CustomRenderer for RpMicroRenderer {
    fn name(&self) -> &str {
        "RPMicroRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        MicroRenderer::default().render(state, context, factory)
    }
}

fn read_bounds(state: &DynmapBlockState) -> Result<CuboidBounds, CustomRendererError> {
    let value = |snake: &str, camel: &str| {
        state
            .properties
            .get(snake)
            .or_else(|| state.properties.get(camel))
            .ok_or(CustomRendererError::UnsupportedState)
            .and_then(|value| {
                value
                    .parse::<f64>()
                    .map_err(|_| CustomRendererError::UnsupportedState)
            })
    };
    CuboidBounds::new(
        Vec3::new(
            value("min_x", "minX")?,
            value("min_y", "minY")?,
            value("min_z", "minZ")?,
        ),
        Vec3::new(
            value("max_x", "maxX")?,
            value("max_y", "maxY")?,
            value("max_z", "maxZ")?,
        ),
    )
    .validate()
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TfcLooseRockRenderer;

impl CustomRenderer for TfcLooseRockRenderer {
    fn name(&self) -> &str {
        "TFCLooseRockRenderer"
    }

    fn render(
        &self,
        _state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let origin = context.origin();
        let mut random = JavaRandom::new(
            origin
                .x
                .wrapping_mul(origin.z)
                .wrapping_add(origin.y as i64),
        );
        let offset = |random: &mut JavaRandom| (random.next_int(5) as f64 - 2.0) * 0.05;
        let bounds = CuboidBounds::new(
            Vec3::new(0.35 + offset(&mut random), 0.0, 0.35 + offset(&mut random)),
            Vec3::new(
                0.65 + offset(&mut random),
                0.15 + offset(&mut random),
                0.65 + offset(&mut random),
            ),
        );
        box_patches(factory, bounds, 0, true)
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TfcSupportRenderer;

impl CustomRenderer for TfcSupportRenderer {
    fn name(&self) -> &str {
        "TFCSupportRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let vertical = bool_property(state, "vert")?;
        let connected = connected_directions(context, |neighbor| {
            neighbor.name.contains("support") || neighbor.name == state.name
        })?;
        let mut parts = support_parts(connected, vertical);
        if parts.is_empty() {
            parts.push(CuboidBounds::new(
                Vec3::new(0.25, if vertical { 0.0 } else { 0.5 }, 0.25),
                Vec3::new(0.75, 1.0, 0.75),
            ));
        }
        parts
            .into_iter()
            .map(|bounds| box_patches(factory, bounds, 0, true))
            .collect::<Result<Vec<_>, _>>()
            .map(|groups| groups.into_iter().flatten().collect())
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TfcWoodRenderer;

impl CustomRenderer for TfcWoodRenderer {
    fn name(&self) -> &str {
        "TFCWoodRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let below = !context.neighbor_state((0, -1, 0))?.name.ends_with("air");
        let connected = connected_directions(context, |neighbor| neighbor.name == state.name)?;
        let mut parts = Vec::new();
        if below {
            parts.push(CuboidBounds::new(
                Vec3::new(0.3125, 0.0, 0.3125),
                Vec3::new(0.6875, 1.0, 0.6875),
            ));
        }
        parts.extend(wood_parts(connected));
        parts
            .into_iter()
            .map(|bounds| box_patches(factory, bounds, 0, true))
            .collect::<Result<Vec<_>, _>>()
            .map(|groups| groups.into_iter().flatten().collect())
    }
}

fn bool_property(state: &DynmapBlockState, property: &str) -> Result<bool, CustomRendererError> {
    match state.properties.get(property).map(String::as_str) {
        None | Some("false") => Ok(false),
        Some("true") => Ok(true),
        Some(_) => Err(CustomRendererError::UnsupportedState),
    }
}

fn connected_directions(
    context: &MapDataContext<'_>,
    predicate: impl Fn(&DynmapBlockState) -> bool,
) -> Result<u8, CustomRendererError> {
    let mut mask = 0;
    for (bit, offset) in [
        (1, (1, 0, 0)),
        (2, (-1, 0, 0)),
        (4, (0, 0, 1)),
        (8, (0, 0, -1)),
    ] {
        if predicate(&context.neighbor_state(offset)?) {
            mask |= bit;
        }
    }
    Ok(mask)
}

fn support_parts(mask: u8, vertical: bool) -> Vec<CuboidBounds> {
    let mut parts = Vec::new();
    let y_min = if vertical { 0.0 } else { 0.5 };
    parts.push(CuboidBounds::new(
        Vec3::new(0.25, y_min, 0.25),
        Vec3::new(0.75, 1.0, 0.75),
    ));
    if mask & 1 != 0 {
        parts.push(CuboidBounds::new(
            Vec3::new(0.75, 0.5, 0.25),
            Vec3::new(1.0, 1.0, 0.75),
        ));
    }
    if mask & 2 != 0 {
        parts.push(CuboidBounds::new(
            Vec3::new(0.0, 0.5, 0.25),
            Vec3::new(0.25, 1.0, 0.75),
        ));
    }
    if mask & 4 != 0 {
        parts.push(CuboidBounds::new(
            Vec3::new(0.25, 0.5, 0.75),
            Vec3::new(0.75, 1.0, 1.0),
        ));
    }
    if mask & 8 != 0 {
        parts.push(CuboidBounds::new(
            Vec3::new(0.25, 0.5, 0.0),
            Vec3::new(0.75, 1.0, 0.25),
        ));
    }
    parts
}

fn wood_parts(mask: u8) -> Vec<CuboidBounds> {
    let mut parts = Vec::new();
    let x = match mask & 3 {
        1 => CuboidBounds::new(
            Vec3::new(0.6875, 0.375, 0.375),
            Vec3::new(1.0, 0.625, 0.625),
        ),
        2 => CuboidBounds::new(
            Vec3::new(0.0, 0.375, 0.375),
            Vec3::new(0.3125, 0.625, 0.625),
        ),
        3 => CuboidBounds::new(Vec3::new(0.0, 0.375, 0.375), Vec3::new(1.0, 0.625, 0.625)),
        _ => CuboidBounds::new(
            Vec3::new(0.3125, 0.375, 0.3125),
            Vec3::new(0.6875, 0.625, 0.6875),
        ),
    };
    parts.push(x);
    let z = match mask & 12 {
        4 => CuboidBounds::new(
            Vec3::new(0.375, 0.375, 0.6875),
            Vec3::new(0.625, 0.625, 1.0),
        ),
        8 => CuboidBounds::new(
            Vec3::new(0.375, 0.375, 0.0),
            Vec3::new(0.625, 0.625, 0.3125),
        ),
        12 => CuboidBounds::new(Vec3::new(0.375, 0.375, 0.0), Vec3::new(0.625, 0.625, 1.0)),
        _ => CuboidBounds::new(
            Vec3::new(0.3125, 0.375, 0.3125),
            Vec3::new(0.6875, 0.625, 0.6875),
        ),
    };
    parts.push(z);
    parts
}

#[derive(Debug, Clone, Copy)]
struct JavaRandom {
    seed: u64,
}

impl JavaRandom {
    fn new(seed: i64) -> Self {
        Self {
            seed: (seed as u64 ^ 0x5DEECE66D) & ((1_u64 << 48) - 1),
        }
    }

    fn next(&mut self, bits: u32) -> u32 {
        self.seed = (self.seed.wrapping_mul(0x5DEECE66D).wrapping_add(0xB)) & ((1_u64 << 48) - 1);
        (self.seed >> (48 - bits)) as u32
    }

    fn next_int(&mut self, bound: u32) -> u32 {
        let mut value = self.next(31);
        let remainder = value % bound;
        while value.wrapping_sub(remainder).wrapping_add(bound - 1) >= (1_u32 << 31) {
            value = self.next(31);
        }
        remainder
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ThaumFurnaceRenderer;

impl CustomRenderer for ThaumFurnaceRenderer {
    fn name(&self) -> &str {
        "ThaumFurnaceRenderer"
    }

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError> {
        let meta = state
            .properties
            .get("meta")
            .ok_or(CustomRendererError::UnsupportedState)?
            .parse::<i32>()
            .map_err(|_| CustomRendererError::UnsupportedState)?;
        if !(0..=9).contains(&meta) {
            return Err(CustomRendererError::UnsupportedState);
        }
        let connected = context.neighbor_state((0, 1, 0)).is_ok();
        let side = if connected { 9 } else { 0 };
        box_patches_with_textures(
            factory,
            CuboidBounds::UNIT,
            [24, (meta + side).rem_euclid(24), side, side, side, side],
            true,
        )
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::assets::model_view::AssetResolutionState;
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
        MapDataContext::new(chunk, BlockCoord::new(3, 4, 5))
    }

    fn state(name: &str) -> DynmapBlockState {
        DynmapBlockState {
            id: 1,
            name: name.to_string(),
            properties: BTreeMap::new(),
        }
    }

    #[test]
    fn state_box_selects_face_specific_textures() {
        let mut state = state("minecraft:state_box");
        for property in ["down", "up", "west", "east", "north", "south"] {
            state.properties.insert(property.into(), "true".into());
        }
        let patches = BoxStateRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .expect("state box");
        assert_eq!(patches.len(), 6);
        assert_eq!(
            patches
                .iter()
                .map(|patch| patch.texture_index)
                .collect::<Vec<_>>(),
            vec![1, 3, 5, 7, 9, 11]
        );
    }

    #[test]
    fn ctm_requires_neighbor_data_instead_of_treating_missing_as_air() {
        let state = state("minecraft:ctm");
        assert!(CtmVertTextureRenderer
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
    }

    #[test]
    fn micro_renderers_require_explicit_tile_entity_bounds() {
        let state = state("mod:micro");
        assert!(MicroRenderer::default()
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
        assert!(ImmibisMicroRenderer
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
        assert!(RpMicroRenderer
            .render(&state, &context(), &RenderPatchFactory)
            .is_err());
    }

    #[test]
    fn coordinate_seeded_loose_rock_is_bounded_and_deterministic() {
        let state = state("tfc:loose_rock");
        let first = TfcLooseRockRenderer
            .render(&state, &context(), &RenderPatchFactory)
            .expect("rock");
        let second = TfcLooseRockRenderer
            .render(&state, &context(), &RenderPatchFactory)
            .expect("rock");
        assert_eq!(first, second);
        assert_eq!(first.len(), 6);
        assert!(first.iter().all(|patch| {
            let bounds = patch.bounds();
            bounds.min.x >= 0.0
                && bounds.max.x <= 1.0
                && bounds.min.y >= 0.0
                && bounds.max.y <= 1.0
                && bounds.min.z >= 0.0
                && bounds.max.z <= 1.0
        }));
    }

    #[test]
    fn all_catalog_closure_adapters_keep_distinct_source_names() {
        let renderers: Vec<Box<dyn CustomRenderer>> = vec![
            Box::new(ChestStateRenderer),
            Box::new(CopyStairBlockRenderer),
            Box::new(DoorStateRenderer),
            Box::new(FenceGateBlockRenderer),
            Box::new(FenceGateBlockStateRenderer),
            Box::new(FenceWallBlockRenderer),
            Box::new(FenceWallBlockStateRenderer),
            Box::new(FluidStateRenderer),
            Box::new(GlowLichenStateRenderer),
            Box::new(PaneStateRenderer),
            Box::new(RailCraftSlabBlockRenderer),
            Box::new(RailCraftTrackRenderer),
            Box::new(RedstoneWireStateRenderer),
            Box::new(RpRotatedBoxRenderer),
            Box::new(RpSupportFrameRenderer),
            Box::new(StairBlockRenderer),
            Box::new(StairStateRenderer),
            Box::new(TfcLooseRockRenderer),
            Box::new(TfcSupportRenderer),
            Box::new(TfcWoodRenderer),
            Box::new(ThaumFurnaceRenderer),
            Box::new(VineStateRenderer),
        ];
        let names = renderers
            .iter()
            .map(|renderer| renderer.name())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(names.len(), 22);
    }
}
