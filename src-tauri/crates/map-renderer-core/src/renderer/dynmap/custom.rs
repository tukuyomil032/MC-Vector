//! Source-independent compatibility boundary for Dynmap CustomRenderer APIs.

use std::collections::{BTreeMap, BTreeSet};

use crate::renderer::dynmap::patch::{PatchDefinition, PatchDefinitionFactory, PatchError};
use crate::renderer::dynmap::types::{SideVisible, Vec3};
use crate::world::chunk_view::{BlockCoord, BlockState, ChunkDataError, MapChunkCache};

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct DynmapBlockState {
    pub id: u32,
    pub name: String,
    pub properties: BTreeMap<String, String>,
}

impl From<&BlockState> for DynmapBlockState {
    fn from(state: &BlockState) -> Self {
        Self {
            id: state.id.0,
            name: state.name.clone(),
            properties: state.properties.clone(),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum CustomRendererError {
    MissingContext,
    UnsupportedState,
    Patch(PatchError),
    Chunk(ChunkDataError),
}

impl From<PatchError> for CustomRendererError {
    fn from(error: PatchError) -> Self {
        Self::Patch(error)
    }
}

impl From<ChunkDataError> for CustomRendererError {
    fn from(error: ChunkDataError) -> Self {
        Self::Chunk(error)
    }
}

pub struct MapDataContext<'a> {
    chunk: &'a MapChunkCache,
    origin: BlockCoord,
}

impl<'a> MapDataContext<'a> {
    pub const fn new(chunk: &'a MapChunkCache, origin: BlockCoord) -> Self {
        Self { chunk, origin }
    }

    pub const fn origin(&self) -> BlockCoord {
        self.origin
    }

    pub fn block_state(
        &self,
        coordinate: BlockCoord,
    ) -> Result<DynmapBlockState, CustomRendererError> {
        Ok(self.chunk.block_state_at(coordinate)?.into())
    }

    pub fn neighbor_state(
        &self,
        offset: (i64, i32, i64),
    ) -> Result<DynmapBlockState, CustomRendererError> {
        self.block_state(BlockCoord::new(
            self.origin.x + offset.0,
            self.origin.y + offset.1,
            self.origin.z + offset.2,
        ))
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct RenderPatchFactory;

impl RenderPatchFactory {
    pub fn patch(
        &self,
        origin: Vec3,
        u_end: Vec3,
        v_end: Vec3,
        texture_index: i32,
        shade: bool,
    ) -> Result<PatchDefinition, CustomRendererError> {
        self.patch_with_side(
            origin,
            u_end,
            v_end,
            SideVisible::Both,
            texture_index,
            shade,
        )
    }

    pub fn patch_with_side(
        &self,
        origin: Vec3,
        u_end: Vec3,
        v_end: Vec3,
        side_visible: SideVisible,
        texture_index: i32,
        shade: bool,
    ) -> Result<PatchDefinition, CustomRendererError> {
        PatchDefinitionFactory::create(origin, u_end, v_end, side_visible, texture_index, shade)
            .map_err(CustomRendererError::from)
    }

    pub fn patch_with_uv_bounds(
        &self,
        origin: Vec3,
        u_end: Vec3,
        v_end: Vec3,
        uv: (f64, f64, f64, f64),
        style: (SideVisible, i32, bool),
    ) -> Result<PatchDefinition, CustomRendererError> {
        PatchDefinition::new(
            origin, u_end, v_end, uv.0, uv.1, uv.2, uv.3, uv.2, uv.3, style.0, style.1, style.2,
        )
        .map_err(CustomRendererError::from)
    }

    pub fn rotated_patch(
        &self,
        patch: PatchDefinition,
        x_degrees: f64,
        y_degrees: f64,
        z_degrees: f64,
        texture_index: i32,
    ) -> PatchDefinition {
        patch.rotated(x_degrees, y_degrees, z_degrees, texture_index)
    }
}

pub trait CustomRenderer {
    fn name(&self) -> &str;

    fn render(
        &self,
        state: &DynmapBlockState,
        context: &MapDataContext<'_>,
        factory: &RenderPatchFactory,
    ) -> Result<Vec<PatchDefinition>, CustomRendererError>;
}

#[derive(Debug, Clone, Default)]
pub struct CustomRendererRegistry {
    names: BTreeSet<String>,
}

impl CustomRendererRegistry {
    pub fn register(&mut self, name: impl Into<String>) -> Result<(), CustomRendererError> {
        let name = name.into();
        if name.is_empty() || !self.names.insert(name) {
            return Err(CustomRendererError::UnsupportedState);
        }
        Ok(())
    }

    pub fn contains(&self, name: &str) -> bool {
        self.names.contains(name)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{
        CustomRenderer, CustomRendererRegistry, DynmapBlockState, MapDataContext,
        RenderPatchFactory,
    };
    use crate::assets::model_view::AssetResolutionState;
    use crate::renderer::dynmap::types::Vec3;
    use crate::world::chunk_view::{
        BiomeData, BlockCoord, BlockState, BlockStateData, BlockStateId, ChunkCoord,
        ChunkLoadState, ChunkSection, HeightData, LightData, MapChunkCache, SectionPalette,
        TileBoundary, TileBoundaryState, CHUNK_COLUMN_COUNT, SECTION_BLOCK_COUNT,
    };

    struct OnePatchRenderer;

    impl CustomRenderer for OnePatchRenderer {
        fn name(&self) -> &str {
            "one_patch"
        }

        fn render(
            &self,
            state: &DynmapBlockState,
            context: &MapDataContext<'_>,
            factory: &RenderPatchFactory,
        ) -> Result<Vec<crate::renderer::dynmap::patch::PatchDefinition>, super::CustomRendererError>
        {
            assert_eq!(state.name, "minecraft:test");
            assert_eq!(context.neighbor_state((0, 0, 0))?.id, 1);
            Ok(vec![factory.patch(
                Vec3::ZERO,
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(0.0, 1.0, 0.0),
                0,
                true,
            )?])
        }
    }

    fn chunk() -> MapChunkCache {
        let section = ChunkSection {
            section_y: 0,
            block_states: BlockStateData::complete(
                SectionPalette::complete(vec![BlockState {
                    id: BlockStateId(1),
                    name: "minecraft:test".to_owned(),
                    properties: BTreeMap::new(),
                }])
                .unwrap(),
                vec![0; SECTION_BLOCK_COUNT],
            )
            .unwrap(),
            biome: BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).unwrap(),
            height: HeightData::complete(vec![1; CHUNK_COLUMN_COUNT]).unwrap(),
            sky_light: LightData::complete(vec![15; SECTION_BLOCK_COUNT]).unwrap(),
            block_light: LightData::complete(vec![0; SECTION_BLOCK_COUNT]).unwrap(),
        };
        MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            [(0, section)].into_iter().collect(),
            BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).unwrap(),
            HeightData::complete(vec![1; CHUNK_COLUMN_COUNT]).unwrap(),
            TileBoundaryState::Present(
                TileBoundary::new(BlockCoord::new(0, 0, 0), BlockCoord::new(16, 16, 16)).unwrap(),
            ),
            AssetResolutionState::Available,
        )
    }

    #[test]
    fn custom_renderer_receives_state_context_and_patch_factory() {
        let chunk = chunk();
        let state = DynmapBlockState::from(chunk.block_state_at(BlockCoord::new(0, 0, 0)).unwrap());
        let context = MapDataContext::new(&chunk, BlockCoord::new(0, 0, 0));
        let patches = OnePatchRenderer
            .render(&state, &context, &RenderPatchFactory)
            .unwrap();
        assert_eq!(patches.len(), 1);
    }

    #[test]
    fn registry_rejects_duplicate_renderer_names() {
        let mut registry = CustomRendererRegistry::default();
        registry.register("stairs").unwrap();
        assert!(registry.register("stairs").is_err());
        assert!(registry.contains("stairs"));
    }
}
