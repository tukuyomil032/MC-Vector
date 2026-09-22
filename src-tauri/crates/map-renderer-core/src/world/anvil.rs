//! Saved Anvil source adapter for the renderer domain.
//!
//! `fastanvil` owns region-sector and Minecraft block-state decoding.  This
//! module owns the boundary between that representation and the renderer's
//! source-independent `MapChunkCache` contract.  No renderer fallback is
//! performed here: absent or malformed state remains an explicit error.

use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use fastanvil::{Chunk as _, JavaChunk};
use fastnbt::Value;

use crate::assets::model_view::AssetResolutionState;
use crate::domain::{ChunkDataAvailability, MissingDataKind};

use super::chunk_view::{
    BiomeData, BlockCoord, BlockState, BlockStateData, BlockStateId, ChunkCoord, ChunkLoadState,
    ChunkSection, HeightData, LightData, MapChunkCache, MissingBlockDataReason,
    MissingLightDataReason, SectionPalette, TileBoundary, TileBoundaryState, CHUNK_SIDE,
    SECTION_BLOCK_COUNT,
};
use super::region::{RegionReadError, RegionSource};

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AnvilError {
    Region(RegionReadError),
    MalformedNbt,
    InvalidChunkCoordinate,
    MissingChunkCoordinate,
    MissingDataVersion,
    InvalidDataVersion,
    DuplicateSection,
    InvalidSectionCoordinate,
    InvalidBlockStates,
    InvalidLightData,
    InvalidBiomeData,
    EmptyChunk,
}

#[derive(Debug, Clone)]
pub struct SavedAnvilSource {
    regions: RegionSource,
    asset_state: AssetResolutionState,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct AnvilChunkHeader {
    pub data_version: i64,
    pub status: Option<String>,
    pub coordinate: ChunkCoord,
}

impl SavedAnvilSource {
    pub fn new(world_root: impl Into<std::path::PathBuf>) -> Self {
        Self {
            regions: RegionSource::new(world_root),
            asset_state: AssetResolutionState::Available,
        }
    }

    pub fn with_asset_state(mut self, asset_state: AssetResolutionState) -> Self {
        self.asset_state = asset_state;
        self
    }

    pub fn world_root(&self) -> &Path {
        self.regions.world_root()
    }

    pub fn load_chunk(&self, chunk: ChunkCoord) -> Result<Option<MapChunkCache>, AnvilError> {
        let Some(bytes) = self
            .regions
            .read_chunk_nbt(chunk)
            .map_err(AnvilError::Region)?
        else {
            return Ok(None);
        };

        decode_chunk(chunk, &bytes, self.asset_state.clone()).map(Some)
    }

    pub fn chunk_source_digest(&self, chunk: ChunkCoord) -> Result<Option<[u8; 32]>, AnvilError> {
        self.regions
            .read_chunk_digest(chunk)
            .map_err(AnvilError::Region)
    }
}

pub fn decode_chunk(
    expected_chunk: ChunkCoord,
    bytes: &[u8],
    asset_state: AssetResolutionState,
) -> Result<MapChunkCache, AnvilError> {
    let java_chunk = JavaChunk::from_bytes(bytes).map_err(|_| AnvilError::MalformedNbt)?;
    let root_value: Value = fastnbt::from_bytes(bytes).map_err(|_| AnvilError::MalformedNbt)?;
    let root = root_compound(&root_value).ok_or(AnvilError::MalformedNbt)?;

    let header = decode_header(root)?;
    if header.coordinate != expected_chunk {
        return Err(AnvilError::InvalidChunkCoordinate);
    }

    let sections = section_compounds(root)?;
    let y_range = java_chunk.y_range();
    if y_range.start >= y_range.end {
        return Err(AnvilError::EmptyChunk);
    }

    let min_section = y_range.start.div_euclid(CHUNK_SIDE as isize) as i32;
    let max_section = (y_range.end - 1).div_euclid(CHUNK_SIDE as isize) as i32;
    let mut domain_sections = BTreeMap::new();
    let mut missing_data = Vec::new();
    for section_y in min_section..=max_section {
        let section = match sections.get(&section_y) {
            Some(section) => decode_section(&java_chunk, section_y, section)?,
            None => {
                missing_data.extend([
                    MissingDataKind::BlockStates,
                    MissingDataKind::SkyLight,
                    MissingDataKind::BlockLight,
                ]);
                missing_section(section_y)
            }
        };
        domain_sections.insert(section_y, section);
    }

    let height = decode_height(&java_chunk, y_range.clone())?;
    let biome = decode_biomes(&java_chunk, &height)?;
    let boundary = TileBoundary::new(
        BlockCoord::new(
            expected_chunk.x * CHUNK_SIDE as i64,
            y_range.start as i32,
            expected_chunk.z * CHUNK_SIDE as i64,
        ),
        BlockCoord::new(
            expected_chunk.x * CHUNK_SIDE as i64 + CHUNK_SIDE as i64,
            y_range.end as i32,
            expected_chunk.z * CHUNK_SIDE as i64 + CHUNK_SIDE as i64,
        ),
    )
    .map_err(|_| AnvilError::EmptyChunk)?;

    if !matches!(asset_state, AssetResolutionState::Available) {
        missing_data.push(MissingDataKind::Asset);
    }
    missing_data.sort_by_key(|kind| format!("{kind:?}"));
    missing_data.dedup();
    let availability = if missing_data.is_empty() {
        ChunkDataAvailability::Complete
    } else {
        ChunkDataAvailability::Partial {
            missing: missing_data,
        }
    };

    Ok(MapChunkCache::new(
        expected_chunk,
        ChunkLoadState::Loaded,
        domain_sections,
        biome,
        height,
        TileBoundaryState::Present(boundary),
        asset_state,
    )
    .with_availability(availability))
}

pub fn decode_header(root: &HashMap<String, Value>) -> Result<AnvilChunkHeader, AnvilError> {
    let data_version = root
        .get("DataVersion")
        .and_then(Value::as_i64)
        .ok_or(AnvilError::MissingDataVersion)?;
    if data_version < 0 {
        return Err(AnvilError::InvalidDataVersion);
    }
    let x = root
        .get("x")
        .and_then(Value::as_i64)
        .ok_or(AnvilError::MissingChunkCoordinate)?;
    let z = root
        .get("z")
        .and_then(Value::as_i64)
        .ok_or(AnvilError::MissingChunkCoordinate)?;
    let status = root
        .get("Status")
        .and_then(Value::as_str)
        .map(str::to_owned);
    Ok(AnvilChunkHeader {
        data_version,
        status,
        coordinate: ChunkCoord::new(x, z),
    })
}

fn root_compound(value: &Value) -> Option<&HashMap<String, Value>> {
    let Value::Compound(root) = value else {
        return None;
    };
    match root.get("Level") {
        Some(Value::Compound(level)) => Some(level),
        _ => Some(root),
    }
}

fn section_compounds(
    root: &HashMap<String, Value>,
) -> Result<BTreeMap<i32, &HashMap<String, Value>>, AnvilError> {
    let Some(Value::List(sections)) = root.get("sections") else {
        return Err(AnvilError::MalformedNbt);
    };
    let mut result = BTreeMap::new();
    for section in sections {
        let Value::Compound(section) = section else {
            return Err(AnvilError::MalformedNbt);
        };
        let Some(section_y) = section.get("Y").and_then(Value::as_i64) else {
            return Err(AnvilError::InvalidSectionCoordinate);
        };
        let section_y =
            i32::try_from(section_y).map_err(|_| AnvilError::InvalidSectionCoordinate)?;
        if result.insert(section_y, section).is_some() {
            return Err(AnvilError::DuplicateSection);
        }
    }
    Ok(result)
}

fn decode_section(
    chunk: &JavaChunk,
    section_y: i32,
    raw: &HashMap<String, Value>,
) -> Result<ChunkSection, AnvilError> {
    let block_states = if raw.contains_key("block_states") {
        decode_block_states(chunk, section_y)?
    } else {
        BlockStateData::Missing {
            reason: MissingBlockDataReason::States,
        }
    };
    let sky_light = decode_light(raw, "SkyLight", MissingLightDataReason::Sky)?;
    let block_light = decode_light(raw, "BlockLight", MissingLightDataReason::Block)?;

    Ok(ChunkSection {
        section_y,
        block_states,
        // Biomes and heightmaps are promoted to chunk-level data below.  Keep
        // the section fields explicit until the renderer consumes section
        // local biome volumes.
        biome: BiomeData::Missing,
        height: HeightData::Missing,
        sky_light,
        block_light,
    })
}

fn missing_section(section_y: i32) -> ChunkSection {
    ChunkSection {
        section_y,
        block_states: BlockStateData::Missing {
            reason: MissingBlockDataReason::Unavailable,
        },
        biome: BiomeData::Missing,
        height: HeightData::Missing,
        sky_light: LightData::Missing {
            reason: MissingLightDataReason::Sky,
        },
        block_light: LightData::Missing {
            reason: MissingLightDataReason::Block,
        },
    }
}

fn decode_block_states(chunk: &JavaChunk, section_y: i32) -> Result<BlockStateData, AnvilError> {
    let mut names = Vec::with_capacity(SECTION_BLOCK_COUNT);
    for local_y in 0..CHUNK_SIDE {
        for local_z in 0..CHUNK_SIDE {
            for local_x in 0..CHUNK_SIDE {
                let y = section_y * CHUNK_SIDE as i32 + local_y as i32;
                let Some(block) = chunk.block(local_x, y as isize, local_z) else {
                    return Ok(BlockStateData::Missing {
                        reason: MissingBlockDataReason::Unavailable,
                    });
                };
                names.push(block.encoded_description().to_owned());
            }
        }
    }

    if names.len() != SECTION_BLOCK_COUNT {
        return Err(AnvilError::InvalidBlockStates);
    }
    let mut palette_names = names.clone();
    palette_names.sort_unstable();
    palette_names.dedup();
    let palette = palette_names
        .iter()
        .enumerate()
        .map(|(id, name)| BlockState {
            id: BlockStateId(id as u32),
            name: name.clone(),
            properties: BTreeMap::new(),
        })
        .collect();
    let palette = SectionPalette::complete(palette).map_err(|_| AnvilError::InvalidBlockStates)?;
    let indices = names
        .iter()
        .map(|name| {
            palette_names
                .binary_search(name)
                .map(|index| index as u16)
                .map_err(|_| AnvilError::InvalidBlockStates)
        })
        .collect::<Result<Vec<_>, _>>()?;
    BlockStateData::complete(palette, indices).map_err(|_| AnvilError::InvalidBlockStates)
}

fn decode_light(
    section: &HashMap<String, Value>,
    key: &str,
    missing_reason: MissingLightDataReason,
) -> Result<LightData, AnvilError> {
    let Some(value) = section.get(key) else {
        return Ok(LightData::Missing {
            reason: missing_reason,
        });
    };
    let Value::ByteArray(values) = value else {
        return Err(AnvilError::InvalidLightData);
    };
    if values.len() != SECTION_BLOCK_COUNT / 2 {
        return Err(AnvilError::InvalidLightData);
    }
    let mut unpacked = Vec::with_capacity(SECTION_BLOCK_COUNT);
    for byte in values.iter() {
        let value = *byte as u8;
        unpacked.push(value & 0x0f);
        unpacked.push((value >> 4) & 0x0f);
    }
    LightData::complete(unpacked).map_err(|_| AnvilError::InvalidLightData)
}

fn decode_height(
    chunk: &JavaChunk,
    y_range: std::ops::Range<isize>,
) -> Result<HeightData, AnvilError> {
    let mut heights = Vec::with_capacity(256);
    for local_z in 0..CHUNK_SIDE {
        for local_x in 0..CHUNK_SIDE {
            let top = (y_range.start..y_range.end)
                .rev()
                .find(|y| {
                    chunk
                        .block(local_x, *y, local_z)
                        .map(|block| !is_air(block.name()))
                        .unwrap_or(false)
                })
                .map(|y| y as i32 + 1)
                .unwrap_or(y_range.start as i32);
            heights.push(top);
        }
    }
    HeightData::complete(heights).map_err(|_| AnvilError::InvalidBiomeData)
}

fn decode_biomes(chunk: &JavaChunk, height: &HeightData) -> Result<BiomeData, AnvilError> {
    let HeightData::Complete(heights) = height else {
        return Ok(BiomeData::Missing);
    };
    let mut values = Vec::with_capacity(256);
    for (index, height) in heights.iter().enumerate() {
        let local_x = index % CHUNK_SIDE;
        let local_z = index / CHUNK_SIDE;
        let Some(biome) = chunk.biome(local_x, (*height - 1) as isize, local_z) else {
            return Ok(BiomeData::Missing);
        };
        values.push(stable_id(&format!("{biome:?}")));
    }
    BiomeData::complete(values).map_err(|_| AnvilError::InvalidBiomeData)
}

fn stable_id(value: &str) -> u32 {
    let mut hash = 2_166_136_261u32;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16_777_619);
    }
    hash
}

fn is_air(name: &str) -> bool {
    matches!(
        name,
        "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::io::Cursor;

    use fastanvil::Region;
    use fastnbt::{ByteArray, Value};

    use super::{decode_chunk, decode_header, stable_id, AnvilError};
    use crate::assets::model_view::AssetResolutionState;
    use crate::world::chunk_view::{BlockCoord, ChunkCoord};

    fn compound(entries: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
        Value::Compound(
            entries
                .into_iter()
                .map(|(key, value)| (key.to_owned(), value))
                .collect::<HashMap<_, _>>(),
        )
    }

    fn fixture_chunk_bytes() -> Vec<u8> {
        let block_state = compound([("Name", Value::String("minecraft:stone".to_owned()))]);
        let biome = Value::String("minecraft:plains".to_owned());
        let section = compound([
            ("Y", Value::Byte(0)),
            (
                "block_states",
                compound([("palette", Value::List(vec![block_state]))]),
            ),
            ("biomes", compound([("palette", Value::List(vec![biome]))])),
            (
                "SkyLight",
                Value::ByteArray(ByteArray::new(vec![15_i8; 2048])),
            ),
            (
                "BlockLight",
                Value::ByteArray(ByteArray::new(vec![0_i8; 2048])),
            ),
        ]);
        let root = compound([
            ("DataVersion", Value::Int(4189)),
            ("Status", Value::String("minecraft:full".to_owned())),
            ("x", Value::Int(0)),
            ("z", Value::Int(0)),
            ("sections", Value::List(vec![section])),
        ]);
        fastnbt::to_bytes(&root).expect("fixture NBT serializes")
    }

    #[test]
    fn one_point_one_twenty_one_chunk_becomes_complete_renderer_view() {
        let cache = decode_chunk(
            ChunkCoord::new(0, 0),
            &fixture_chunk_bytes(),
            AssetResolutionState::Available,
        )
        .expect("valid fixture");
        assert_eq!(cache.chunk, ChunkCoord::new(0, 0));
        assert_eq!(cache.height_at(BlockCoord::new(0, 16, 0)).unwrap(), 16);
        assert_eq!(cache.light_at(BlockCoord::new(0, 0, 0)).unwrap().sky, 15);
        assert_eq!(
            cache.block_state_at(BlockCoord::new(0, 0, 0)).unwrap().name,
            "minecraft:stone|"
        );
    }

    #[test]
    fn anvil_region_round_trip_is_deterministic() {
        let root =
            std::env::temp_dir().join(format!("mc-vector-anvil-fixture-{}", std::process::id()));
        let region_dir = root.join("region");
        std::fs::create_dir_all(&region_dir).expect("fixture directory");

        let mut region = Region::create(Cursor::new(Vec::new())).expect("create region");
        region
            .write_chunk(0, 0, &fixture_chunk_bytes())
            .expect("write fixture chunk");
        let bytes = region.into_inner().expect("finish region").into_inner();
        std::fs::write(region_dir.join("r.0.0.mca"), bytes).expect("write fixture region");

        let source = super::SavedAnvilSource::new(&root);
        let first = source
            .load_chunk(ChunkCoord::new(0, 0))
            .expect("read fixture")
            .expect("fixture chunk exists");
        let second = source
            .load_chunk(ChunkCoord::new(0, 0))
            .expect("read fixture again")
            .expect("fixture chunk exists");
        assert_eq!(first.chunk, second.chunk);
        assert_eq!(
            source.chunk_source_digest(ChunkCoord::new(0, 0)),
            source.chunk_source_digest(ChunkCoord::new(0, 0))
        );
        std::fs::remove_dir_all(root).expect("remove temporary fixture");
    }

    #[test]
    fn malformed_nbt_is_not_converted_to_an_empty_chunk() {
        assert!(matches!(
            decode_chunk(
                ChunkCoord::new(0, 0),
                b"not-an-nbt-chunk",
                AssetResolutionState::Available,
            ),
            Err(AnvilError::MalformedNbt)
        ));
    }

    #[test]
    fn missing_chunk_header_fields_are_rejected() {
        let root = compound([("sections", Value::List(Vec::new()))]);
        let bytes = fastnbt::to_bytes(&root).expect("fixture serializes");
        let value: Value = fastnbt::from_bytes(&bytes).expect("fixture parses");
        let Value::Compound(root) = value else {
            panic!("fixture root is compound");
        };
        assert!(matches!(
            decode_header(&root),
            Err(AnvilError::MissingDataVersion)
        ));
    }

    #[test]
    fn biome_ids_are_stable_for_renderer_cache_keys() {
        assert_eq!(stable_id("Plains"), stable_id("Plains"));
        assert_ne!(stable_id("Plains"), stable_id("Forest"));
    }
}
