//! Paper snapshot adapter for Minecraft 1.21.4.

use std::collections::{BTreeMap, BTreeSet};

use crate::assets::model_view::AssetResolutionState;
use crate::bridge::{SnapshotRequest, SnapshotResponse, SnapshotStatus};
use crate::domain::{
    ChunkDataAvailability, ChunkIdentity, DimensionId, MinecraftVersionId, WorldId,
};
use crate::world::anvil::stable_id;
use crate::world::chunk_view::{
    BiomeData, BlockState, BlockStateData, BlockStateId, ChunkCoord, ChunkLoadState, ChunkSection,
    HeightData, LightData, MapChunkCache, SectionPalette, TileBoundaryState, CHUNK_SIDE,
    SECTION_BLOCK_COUNT,
};

pub const MINECRAFT_VERSION: &str = "1.21.4";
pub const DATA_VERSION: i64 = 4189;
const NIBBLE_BYTES: usize = SECTION_BLOCK_COUNT / 2;

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum SnapshotAdapterError {
    Bridge(crate::bridge::ValidationError),
    UnsupportedDataVersion { expected: i64, actual: i64 },
    InvalidCoordinate,
    InvalidHeightmap,
    InvalidBiomeSamples,
    InvalidSection,
    EmptyPalette,
    PackedStatesTooShort,
    PackedStateIndexOutOfBounds,
    InvalidLightLength,
    InvalidLightValue,
    DuplicateSection,
    InvalidIdentifier,
}

pub fn decode(
    request: &SnapshotRequest,
    response: &SnapshotResponse,
    asset_state: AssetResolutionState,
) -> Result<MapChunkCache, SnapshotAdapterError> {
    response
        .validate_against(request)
        .map_err(SnapshotAdapterError::Bridge)?;
    if response.status != SnapshotStatus::Loaded {
        return Err(SnapshotAdapterError::Bridge(
            crate::bridge::ValidationError::UnexpectedSnapshot,
        ));
    }
    let snapshot = response
        .snapshot
        .as_ref()
        .ok_or(SnapshotAdapterError::InvalidSection)?;
    if snapshot.data_version != DATA_VERSION {
        return Err(SnapshotAdapterError::UnsupportedDataVersion {
            expected: DATA_VERSION,
            actual: snapshot.data_version,
        });
    }
    if snapshot.chunk_x != request.chunk_x || snapshot.chunk_z != request.chunk_z {
        return Err(SnapshotAdapterError::InvalidCoordinate);
    }
    if snapshot.biomes.len() != CHUNK_SIDE * CHUNK_SIDE {
        return Err(SnapshotAdapterError::InvalidBiomeSamples);
    }
    if snapshot.heightmap.len() != CHUNK_SIDE * CHUNK_SIDE {
        return Err(SnapshotAdapterError::InvalidHeightmap);
    }

    let mut sections = BTreeMap::new();
    for section in &snapshot.sections {
        if sections.contains_key(&section.section_y) {
            return Err(SnapshotAdapterError::DuplicateSection);
        }
        let block_states = decode_block_states(section)?;
        let biome = decode_section_biomes(section)?;
        let sky_light = decode_light(section.sky_light.as_deref())?;
        let block_light = decode_light(section.block_light.as_deref())?;
        sections.insert(
            section.section_y,
            ChunkSection {
                section_y: section.section_y,
                block_states,
                biome,
                height: HeightData::complete(snapshot.heightmap.clone())
                    .map_err(|_| SnapshotAdapterError::InvalidHeightmap)?,
                sky_light,
                block_light,
            },
        );
    }
    if sections.is_empty() {
        return Err(SnapshotAdapterError::InvalidSection);
    }

    let chunk = ChunkCoord::new(i64::from(request.chunk_x), i64::from(request.chunk_z));
    let minecraft_version = MinecraftVersionId::new(MINECRAFT_VERSION)
        .map_err(|_| SnapshotAdapterError::InvalidIdentifier)?;
    let world = WorldId::new(request.world_id.clone())
        .map_err(|_| SnapshotAdapterError::InvalidIdentifier)?;
    let dimension = DimensionId::new(request.dimension.clone())
        .map_err(|_| SnapshotAdapterError::InvalidIdentifier)?;
    let identity = ChunkIdentity {
        minecraft_version,
        world,
        dimension,
        coordinate: crate::domain::ChunkCoordinate::new(chunk.x, chunk.z),
    };
    MapChunkCache::new(
        chunk,
        ChunkLoadState::Loaded,
        sections,
        BiomeData::complete(
            snapshot
                .biomes
                .iter()
                .map(|biome| stable_id(biome))
                .collect(),
        )
        .map_err(|_| SnapshotAdapterError::InvalidBiomeSamples)?,
        HeightData::complete(snapshot.heightmap.clone())
            .map_err(|_| SnapshotAdapterError::InvalidHeightmap)?,
        TileBoundaryState::Missing,
        asset_state,
    )
    .with_identity(identity)
    .map_err(|_| SnapshotAdapterError::InvalidCoordinate)
    .map(|cache| cache.with_availability(ChunkDataAvailability::Complete))
}

fn decode_block_states(
    section: &crate::bridge::SectionSnapshot,
) -> Result<BlockStateData, SnapshotAdapterError> {
    let palette = if section.block_palette.is_empty() {
        return Err(SnapshotAdapterError::EmptyPalette);
    } else {
        SectionPalette::complete(
            section
                .block_palette
                .iter()
                .enumerate()
                .map(|(index, entry)| BlockState {
                    id: BlockStateId(index as u32),
                    name: format_state_name(&entry.name, &entry.properties),
                    properties: entry
                        .properties
                        .iter()
                        .map(|property| (property.name.clone(), property.value.clone()))
                        .collect(),
                })
                .collect(),
        )
        .map_err(|_| SnapshotAdapterError::EmptyPalette)?
    };
    let indices = unpack_indices(
        &section.packed_block_states,
        section.block_palette.len(),
        SECTION_BLOCK_COUNT,
    )?;
    BlockStateData::complete(palette, indices)
        .map_err(|_| SnapshotAdapterError::PackedStateIndexOutOfBounds)
}

fn decode_section_biomes(
    section: &crate::bridge::SectionSnapshot,
) -> Result<BiomeData, SnapshotAdapterError> {
    if section.biome_palette.is_empty() {
        return Err(SnapshotAdapterError::EmptyPalette);
    }
    BiomeData::complete(vec![
        stable_id(&section.biome_palette[0]);
        CHUNK_SIDE * CHUNK_SIDE
    ])
    .map_err(|_| SnapshotAdapterError::InvalidBiomeSamples)
}

fn decode_light(bytes: Option<&[u8]>) -> Result<LightData, SnapshotAdapterError> {
    let Some(bytes) = bytes else {
        return Err(SnapshotAdapterError::InvalidLightLength);
    };
    if bytes.len() != NIBBLE_BYTES {
        return Err(SnapshotAdapterError::InvalidLightLength);
    }
    let mut values = Vec::with_capacity(SECTION_BLOCK_COUNT);
    for byte in bytes {
        let low = byte & 0x0f;
        let high = byte >> 4;
        if low > 15 || high > 15 {
            return Err(SnapshotAdapterError::InvalidLightValue);
        }
        values.extend([low, high]);
    }
    LightData::complete(values).map_err(|_| SnapshotAdapterError::InvalidLightLength)
}

fn unpack_indices(
    packed: &[i64],
    palette_len: usize,
    count: usize,
) -> Result<Vec<u16>, SnapshotAdapterError> {
    if palette_len == 1 && packed.is_empty() {
        return Ok(vec![0; count]);
    }
    let bits = usize::max(
        4,
        usize::BITS as usize - (palette_len - 1).leading_zeros() as usize,
    );
    let required_bits = bits
        .checked_mul(count)
        .ok_or(SnapshotAdapterError::PackedStatesTooShort)?;
    if packed.len().saturating_mul(64) < required_bits {
        return Err(SnapshotAdapterError::PackedStatesTooShort);
    }
    let mask = (1_u64 << bits) - 1;
    let mut indices = Vec::with_capacity(count);
    for index in 0..count {
        let bit_index = index * bits;
        let word_index = bit_index / 64;
        let offset = bit_index % 64;
        let mut value = (packed[word_index] as u64 >> offset) & mask;
        if offset + bits > 64 {
            let next_bits = offset + bits - 64;
            value |= (packed[word_index + 1] as u64 & ((1_u64 << next_bits) - 1)) << (64 - offset);
        }
        if value >= palette_len as u64 {
            return Err(SnapshotAdapterError::PackedStateIndexOutOfBounds);
        }
        indices.push(value as u16);
    }
    Ok(indices)
}

fn format_state_name(name: &str, properties: &[crate::bridge::BlockPropertySnapshot]) -> String {
    if properties.is_empty() {
        return format!("{name}|");
    }
    let sorted = properties
        .iter()
        .map(|property| (property.name.as_str(), property.value.as_str()))
        .collect::<BTreeSet<_>>();
    let properties = sorted
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join(",");
    format!("{name}|{properties}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bridge::{
        BlockPropertySnapshot, BlockStateSnapshot, ChunkSnapshot, SectionSnapshot,
        UnavailableReason,
    };

    fn request() -> SnapshotRequest {
        SnapshotRequest {
            request_id: "request-1".to_owned(),
            server_id: "server-1".to_owned(),
            minecraft_version: MinecraftVersionId::new(MINECRAFT_VERSION).unwrap(),
            world_id: "world-1".to_owned(),
            dimension: "minecraft:overworld".to_owned(),
            chunk_x: -2,
            chunk_z: 4,
        }
    }

    fn packed_zeroes() -> Vec<i64> {
        vec![0; 256]
    }

    fn response() -> SnapshotResponse {
        SnapshotResponse {
            request_id: "request-1".to_owned(),
            server_id: "server-1".to_owned(),
            minecraft_version: MinecraftVersionId::new(MINECRAFT_VERSION).unwrap(),
            world_id: "world-1".to_owned(),
            dimension: "minecraft:overworld".to_owned(),
            chunk_x: -2,
            chunk_z: 4,
            status: SnapshotStatus::Loaded,
            snapshot: Some(ChunkSnapshot {
                data_version: DATA_VERSION,
                chunk_x: -2,
                chunk_z: 4,
                biomes: vec!["minecraft:plains".to_owned(); 256],
                heightmap: vec![64; 256],
                sections: vec![SectionSnapshot {
                    section_y: 0,
                    block_palette: vec![BlockStateSnapshot {
                        name: "minecraft:stone".to_owned(),
                        properties: vec![BlockPropertySnapshot {
                            name: "axis".to_owned(),
                            value: "y".to_owned(),
                        }],
                    }],
                    packed_block_states: packed_zeroes(),
                    biome_palette: vec!["minecraft:plains".to_owned()],
                    sky_light: Some(vec![0xff; NIBBLE_BYTES]),
                    block_light: Some(vec![0; NIBBLE_BYTES]),
                }],
            }),
            unavailable_reason: None,
        }
    }

    #[test]
    fn loaded_1_21_4_snapshot_becomes_identity_bound_chunk_view() {
        let cache = decode(&request(), &response(), AssetResolutionState::Available)
            .expect("valid snapshot");
        assert_eq!(cache.chunk, ChunkCoord::new(-2, 4));
        assert_eq!(cache.identity.minecraft_version.as_str(), MINECRAFT_VERSION);
        assert_eq!(
            cache
                .block_state_at(crate::world::chunk_view::BlockCoord::new(-32, 0, 64))
                .expect("block state")
                .name,
            "minecraft:stone|axis=y"
        );
        assert_eq!(
            cache
                .light_at(crate::world::chunk_view::BlockCoord::new(-32, 0, 64))
                .unwrap()
                .sky,
            15
        );
    }

    #[test]
    fn unavailable_snapshot_never_becomes_a_loaded_chunk() {
        let mut unavailable = response();
        unavailable.status = SnapshotStatus::NotLoaded;
        unavailable.snapshot = None;
        unavailable.unavailable_reason = Some(UnavailableReason::NotLoaded);
        assert!(matches!(
            decode(&request(), &unavailable, AssetResolutionState::Available),
            Err(SnapshotAdapterError::Bridge(_))
        ));
    }

    #[test]
    fn wrong_data_version_is_explicit() {
        let mut wrong = response();
        wrong.snapshot.as_mut().unwrap().data_version -= 1;
        assert!(matches!(
            decode(&request(), &wrong, AssetResolutionState::Available),
            Err(SnapshotAdapterError::UnsupportedDataVersion {
                expected,
                actual,
            }) if expected == DATA_VERSION && actual == DATA_VERSION - 1
        ));
    }
}
