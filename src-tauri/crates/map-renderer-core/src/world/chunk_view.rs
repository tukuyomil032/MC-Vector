//! Owned, source-independent chunk data consumed by renderers.

use std::collections::BTreeMap;

use crate::assets::model_view::AssetResolutionState;

pub const CHUNK_SIDE: usize = 16;
pub const SECTION_BLOCK_COUNT: usize = CHUNK_SIDE * CHUNK_SIDE * CHUNK_SIDE;
pub const CHUNK_COLUMN_COUNT: usize = CHUNK_SIDE * CHUNK_SIDE;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct BlockStateId(pub u32);

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct BlockState {
    pub id: BlockStateId,
    pub name: String,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum SectionPalette {
    Complete(Vec<BlockState>),
    Missing { reason: MissingBlockDataReason },
}

impl SectionPalette {
    pub fn complete(entries: Vec<BlockState>) -> Result<Self, ChunkDataError> {
        if entries.is_empty() {
            return Err(ChunkDataError::EmptySectionPalette);
        }
        Ok(Self::Complete(entries))
    }

    fn get(&self, index: usize) -> Result<&BlockState, ChunkDataError> {
        match self {
            Self::Complete(entries) => entries
                .get(index)
                .ok_or(ChunkDataError::PaletteIndexOutOfBounds { index }),
            Self::Missing { reason } => Err(ChunkDataError::MissingBlockData {
                reason: reason.clone(),
            }),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum BlockStateData {
    Complete {
        palette: SectionPalette,
        indices: Vec<u16>,
    },
    Missing {
        reason: MissingBlockDataReason,
    },
}

impl BlockStateData {
    pub fn complete(palette: SectionPalette, indices: Vec<u16>) -> Result<Self, ChunkDataError> {
        if !matches!(palette, SectionPalette::Complete(_)) {
            return Err(ChunkDataError::MissingBlockData {
                reason: MissingBlockDataReason::Palette,
            });
        }
        if indices.len() != SECTION_BLOCK_COUNT {
            return Err(ChunkDataError::InvalidSectionLength {
                expected: SECTION_BLOCK_COUNT,
                actual: indices.len(),
            });
        }
        Ok(Self::Complete { palette, indices })
    }

    fn get(&self, local_index: usize) -> Result<&BlockState, ChunkDataError> {
        match self {
            Self::Complete { palette, indices } => palette.get(indices[local_index] as usize),
            Self::Missing { reason } => Err(ChunkDataError::MissingBlockData {
                reason: reason.clone(),
            }),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum MissingBlockDataReason {
    Palette,
    States,
    Unavailable,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum LightData {
    Complete(Vec<u8>),
    Missing { reason: MissingLightDataReason },
}

impl LightData {
    pub fn complete(values: Vec<u8>) -> Result<Self, ChunkDataError> {
        if values.len() != SECTION_BLOCK_COUNT {
            return Err(ChunkDataError::InvalidSectionLength {
                expected: SECTION_BLOCK_COUNT,
                actual: values.len(),
            });
        }
        if values.iter().any(|value| *value > 15) {
            return Err(ChunkDataError::InvalidLightValue);
        }
        Ok(Self::Complete(values))
    }

    fn get(&self, local_index: usize, kind: LightKind) -> Result<u8, ChunkDataError> {
        match self {
            Self::Complete(values) => Ok(values[local_index]),
            Self::Missing { reason } => Err(ChunkDataError::MissingLightData {
                kind,
                reason: reason.clone(),
            }),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum MissingLightDataReason {
    Sky,
    Block,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum LightKind {
    Sky,
    Block,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum BiomeData {
    Complete(Vec<u32>),
    Missing,
}

impl BiomeData {
    pub fn complete(values: Vec<u32>) -> Result<Self, ChunkDataError> {
        if values.len() != CHUNK_COLUMN_COUNT {
            return Err(ChunkDataError::InvalidColumnLength {
                expected: CHUNK_COLUMN_COUNT,
                actual: values.len(),
            });
        }
        Ok(Self::Complete(values))
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum HeightData {
    Complete(Vec<i32>),
    Missing,
}

impl HeightData {
    pub fn complete(values: Vec<i32>) -> Result<Self, ChunkDataError> {
        if values.len() != CHUNK_COLUMN_COUNT {
            return Err(ChunkDataError::InvalidColumnLength {
                expected: CHUNK_COLUMN_COUNT,
                actual: values.len(),
            });
        }
        Ok(Self::Complete(values))
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct ChunkCoord {
    pub x: i64,
    pub z: i64,
}

impl ChunkCoord {
    pub const fn new(x: i64, z: i64) -> Self {
        Self { x, z }
    }

    pub fn from_block(x: i64, z: i64) -> (Self, LocalBlockCoord) {
        let chunk = Self::new(
            x.div_euclid(CHUNK_SIDE as i64),
            z.div_euclid(CHUNK_SIDE as i64),
        );
        (
            chunk,
            LocalBlockCoord::new(
                x.rem_euclid(CHUNK_SIDE as i64) as u8,
                z.rem_euclid(CHUNK_SIDE as i64) as u8,
            ),
        )
    }

    pub fn origin(self) -> (i64, i64) {
        (self.x * CHUNK_SIDE as i64, self.z * CHUNK_SIDE as i64)
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct LocalBlockCoord {
    pub x: u8,
    pub z: u8,
}

impl LocalBlockCoord {
    pub const fn new(x: u8, z: u8) -> Self {
        Self { x, z }
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct BlockCoord {
    pub x: i64,
    pub y: i32,
    pub z: i64,
}

impl BlockCoord {
    pub const fn new(x: i64, y: i32, z: i64) -> Self {
        Self { x, y, z }
    }

    pub fn chunk(self) -> (ChunkCoord, LocalBlockCoord) {
        ChunkCoord::from_block(self.x, self.z)
    }

    pub fn local_y(self) -> (i32, usize) {
        (
            self.y.div_euclid(CHUNK_SIDE as i32),
            self.y.rem_euclid(CHUNK_SIDE as i32) as usize,
        )
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct TileBoundary {
    pub min: BlockCoord,
    pub max_exclusive: BlockCoord,
}

impl TileBoundary {
    pub fn new(min: BlockCoord, max_exclusive: BlockCoord) -> Result<Self, ChunkDataError> {
        if min.x >= max_exclusive.x || min.y >= max_exclusive.y || min.z >= max_exclusive.z {
            return Err(ChunkDataError::InvalidTileBoundary);
        }
        Ok(Self { min, max_exclusive })
    }

    pub fn contains(self, position: BlockCoord) -> bool {
        position.x >= self.min.x
            && position.x < self.max_exclusive.x
            && position.y >= self.min.y
            && position.y < self.max_exclusive.y
            && position.z >= self.min.z
            && position.z < self.max_exclusive.z
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TileBoundaryState {
    Present(TileBoundary),
    Missing,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ChunkLoadState {
    Loaded,
    Unloaded { reason: String },
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ChunkSection {
    pub section_y: i32,
    pub block_states: BlockStateData,
    pub biome: BiomeData,
    pub height: HeightData,
    pub sky_light: LightData,
    pub block_light: LightData,
}

#[derive(Debug, Clone)]
pub struct MapChunkCache {
    pub chunk: ChunkCoord,
    pub load_state: ChunkLoadState,
    pub sections: BTreeMap<i32, ChunkSection>,
    pub biome: BiomeData,
    pub height: HeightData,
    pub tile_boundary: TileBoundaryState,
    pub asset_state: AssetResolutionState,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct LightSample {
    pub sky: u8,
    pub block: u8,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ChunkDataError {
    Unloaded {
        reason: String,
    },
    MissingBlockData {
        reason: MissingBlockDataReason,
    },
    MissingLightData {
        kind: LightKind,
        reason: MissingLightDataReason,
    },
    MissingBiomeData,
    MissingHeightData,
    MissingTileBoundary,
    EmptySectionPalette,
    PaletteIndexOutOfBounds {
        index: usize,
    },
    InvalidSectionLength {
        expected: usize,
        actual: usize,
    },
    InvalidColumnLength {
        expected: usize,
        actual: usize,
    },
    InvalidLightValue,
    InvalidTileBoundary,
    ChunkMismatch {
        expected: ChunkCoord,
        actual: ChunkCoord,
    },
    SectionMissing {
        section_y: i32,
    },
}

impl MapChunkCache {
    pub fn new(
        chunk: ChunkCoord,
        load_state: ChunkLoadState,
        sections: BTreeMap<i32, ChunkSection>,
        biome: BiomeData,
        height: HeightData,
        tile_boundary: TileBoundaryState,
        asset_state: AssetResolutionState,
    ) -> Self {
        Self {
            chunk,
            load_state,
            sections,
            biome,
            height,
            tile_boundary,
            asset_state,
        }
    }

    fn ensure_loaded(&self) -> Result<(), ChunkDataError> {
        match &self.load_state {
            ChunkLoadState::Loaded => Ok(()),
            ChunkLoadState::Unloaded { reason } => Err(ChunkDataError::Unloaded {
                reason: reason.clone(),
            }),
        }
    }

    pub fn block_state_at(&self, position: BlockCoord) -> Result<&BlockState, ChunkDataError> {
        self.ensure_loaded()?;
        let (actual_chunk, local) = position.chunk();
        if actual_chunk != self.chunk {
            return Err(ChunkDataError::ChunkMismatch {
                expected: self.chunk,
                actual: actual_chunk,
            });
        }
        let (section_y, local_y) = position.local_y();
        let section = self
            .sections
            .get(&section_y)
            .ok_or(ChunkDataError::SectionMissing { section_y })?;
        section.block_states.get(
            local_y * CHUNK_SIDE * CHUNK_SIDE + local.z as usize * CHUNK_SIDE + local.x as usize,
        )
    }

    pub fn light_at(&self, position: BlockCoord) -> Result<LightSample, ChunkDataError> {
        self.ensure_loaded()?;
        let (actual_chunk, local) = position.chunk();
        if actual_chunk != self.chunk {
            return Err(ChunkDataError::ChunkMismatch {
                expected: self.chunk,
                actual: actual_chunk,
            });
        }
        let (section_y, local_y) = position.local_y();
        let section = self
            .sections
            .get(&section_y)
            .ok_or(ChunkDataError::SectionMissing { section_y })?;
        let index =
            local_y * CHUNK_SIDE * CHUNK_SIDE + local.z as usize * CHUNK_SIDE + local.x as usize;
        Ok(LightSample {
            sky: section.sky_light.get(index, LightKind::Sky)?,
            block: section.block_light.get(index, LightKind::Block)?,
        })
    }

    pub fn biome_at(&self, position: BlockCoord) -> Result<u32, ChunkDataError> {
        self.ensure_loaded()?;
        let (actual_chunk, local) = position.chunk();
        if actual_chunk != self.chunk {
            return Err(ChunkDataError::ChunkMismatch {
                expected: self.chunk,
                actual: actual_chunk,
            });
        }
        match &self.biome {
            BiomeData::Complete(values) => {
                Ok(values[local.z as usize * CHUNK_SIDE + local.x as usize])
            }
            BiomeData::Missing => Err(ChunkDataError::MissingBiomeData),
        }
    }

    pub fn height_at(&self, position: BlockCoord) -> Result<i32, ChunkDataError> {
        self.ensure_loaded()?;
        let (actual_chunk, local) = position.chunk();
        if actual_chunk != self.chunk {
            return Err(ChunkDataError::ChunkMismatch {
                expected: self.chunk,
                actual: actual_chunk,
            });
        }
        match &self.height {
            HeightData::Complete(values) => {
                Ok(values[local.z as usize * CHUNK_SIDE + local.x as usize])
            }
            HeightData::Missing => Err(ChunkDataError::MissingHeightData),
        }
    }

    pub fn boundary(&self) -> Result<TileBoundary, ChunkDataError> {
        match self.tile_boundary {
            TileBoundaryState::Present(boundary) => Ok(boundary),
            TileBoundaryState::Missing => Err(ChunkDataError::MissingTileBoundary),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{
        BiomeData, BlockCoord, BlockStateData, ChunkCoord, ChunkDataError, ChunkLoadState,
        ChunkSection, HeightData, LightData, MapChunkCache, MissingBlockDataReason,
        MissingLightDataReason, TileBoundary,
    };
    use crate::assets::model_view::AssetResolutionState;

    #[test]
    fn negative_world_coordinates_use_floor_chunking() {
        let (chunk, local) = ChunkCoord::from_block(-1, -17);
        assert_eq!(chunk, ChunkCoord::new(-1, -2));
        assert_eq!(local.x, 15);
        assert_eq!(local.z, 15);
    }

    #[test]
    fn tile_boundary_is_half_open_and_explicit() {
        let boundary =
            TileBoundary::new(BlockCoord::new(-16, 0, -16), BlockCoord::new(16, 256, 16)).unwrap();
        assert!(boundary.contains(BlockCoord::new(-16, 0, -16)));
        assert!(!boundary.contains(BlockCoord::new(16, 0, 0)));
        assert!(!boundary.contains(BlockCoord::new(0, 256, 0)));
    }

    fn cache_with_incomplete_section() -> MapChunkCache {
        let section = ChunkSection {
            section_y: 0,
            block_states: BlockStateData::Missing {
                reason: MissingBlockDataReason::States,
            },
            biome: BiomeData::Missing,
            height: HeightData::Missing,
            sky_light: LightData::Missing {
                reason: MissingLightDataReason::Sky,
            },
            block_light: LightData::Missing {
                reason: MissingLightDataReason::Block,
            },
        };
        let mut sections = BTreeMap::new();
        sections.insert(0, section);
        MapChunkCache::new(
            ChunkCoord::new(0, 0),
            ChunkLoadState::Loaded,
            sections,
            BiomeData::Missing,
            HeightData::Missing,
            super::TileBoundaryState::Missing,
            AssetResolutionState::Available,
        )
    }

    #[test]
    fn incomplete_block_data_is_rejected_without_a_default_state() {
        let cache = cache_with_incomplete_section();
        let result = cache.block_state_at(BlockCoord::new(0, 0, 0));
        assert!(matches!(
            result,
            Err(ChunkDataError::MissingBlockData {
                reason: MissingBlockDataReason::States
            })
        ));
    }

    #[test]
    fn incomplete_light_data_is_rejected_without_a_fixed_light_value() {
        let result = cache_with_incomplete_section().light_at(BlockCoord::new(0, 0, 0));
        assert!(matches!(
            result,
            Err(ChunkDataError::MissingLightData {
                kind: super::LightKind::Sky,
                reason: MissingLightDataReason::Sky
            })
        ));
    }
}
