//! Minecraft Java Edition 1.21.4 Anvil adapter.

use crate::assets::model_view::AssetResolutionState;
use crate::domain::MinecraftVersionId;
use crate::world::anvil::{decode_chunk, read_header, AnvilError};
use crate::world::chunk_view::{ChunkCoord, MapChunkCache};

pub const MINECRAFT_VERSION: &str = "1.21.4";
pub const DATA_VERSION: i64 = 4189;

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AdapterError {
    Anvil(AnvilError),
    VersionMismatch {
        expected: MinecraftVersionId,
        actual_data_version: i64,
    },
    UnsupportedStatus(Option<String>),
}

impl From<AnvilError> for AdapterError {
    fn from(error: AnvilError) -> Self {
        Self::Anvil(error)
    }
}

pub fn decode(
    expected_chunk: ChunkCoord,
    bytes: &[u8],
    asset_state: AssetResolutionState,
) -> Result<MapChunkCache, AdapterError> {
    let header = read_header(bytes)?;
    if header.data_version != DATA_VERSION {
        return Err(AdapterError::VersionMismatch {
            expected: MinecraftVersionId::new(MINECRAFT_VERSION)
                .expect("version constant is valid"),
            actual_data_version: header.data_version,
        });
    }
    if header.status.as_deref() != Some("minecraft:full") {
        return Err(AdapterError::UnsupportedStatus(header.status));
    }
    decode_chunk(expected_chunk, bytes, asset_state).map_err(AdapterError::from)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::io::Cursor;

    use fastanvil::Region;
    use fastnbt::{ByteArray, Value};

    use super::{decode, AdapterError, DATA_VERSION};
    use crate::assets::model_view::AssetResolutionState;
    use crate::world::anvil::AnvilError;
    use crate::world::chunk_view::{BlockCoord, ChunkCoord};
    use crate::world::region::RegionSource;

    fn compound(entries: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
        Value::Compound(
            entries
                .into_iter()
                .map(|(key, value)| (key.to_owned(), value))
                .collect::<HashMap<_, _>>(),
        )
    }

    fn complete_chunk_bytes() -> Vec<u8> {
        let block_state = compound([("Name", Value::String("minecraft:stone".to_owned()))]);
        let section = compound([
            ("Y", Value::Byte(0)),
            (
                "block_states",
                compound([("palette", Value::List(vec![block_state]))]),
            ),
            (
                "biomes",
                compound([(
                    "palette",
                    Value::List(vec![Value::String("minecraft:plains".to_owned())]),
                )]),
            ),
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
            ("DataVersion", Value::Int(DATA_VERSION as i32)),
            ("Status", Value::String("minecraft:full".to_owned())),
            ("x", Value::Int(0)),
            ("z", Value::Int(0)),
            ("sections", Value::List(vec![section])),
        ]);
        fastnbt::to_bytes(&root).expect("fixture NBT serializes")
    }

    fn fixture_with_data_version(data_version: i32) -> Vec<u8> {
        let root = Value::Compound(
            [
                ("DataVersion".to_owned(), Value::Int(data_version)),
                (
                    "Status".to_owned(),
                    Value::String("minecraft:full".to_owned()),
                ),
                ("x".to_owned(), Value::Int(0)),
                ("z".to_owned(), Value::Int(0)),
                ("sections".to_owned(), Value::List(Vec::new())),
            ]
            .into_iter()
            .collect(),
        );
        fastnbt::to_bytes(&root).expect("fixture serializes")
    }

    #[test]
    fn rejects_a_neighboring_data_version_before_decode() {
        let bytes = fixture_with_data_version((DATA_VERSION - 1) as i32);
        assert!(matches!(
            decode(
                ChunkCoord::new(0, 0),
                &bytes,
                AssetResolutionState::Available,
            ),
            Err(AdapterError::VersionMismatch { .. })
        ));
    }

    #[test]
    fn malformed_input_remains_an_explicit_anvil_error() {
        assert!(matches!(
            decode(
                ChunkCoord::new(0, 0),
                b"not-an-nbt-chunk",
                AssetResolutionState::Available,
            ),
            Err(AdapterError::Anvil(AnvilError::MalformedNbt))
        ));
    }

    #[test]
    fn deterministic_region_fixture_round_trips_through_the_version_adapter() {
        let root = std::env::temp_dir().join(format!(
            "mc-vector-anvil-version-1-21-4-fixture-{}",
            std::process::id()
        ));
        let region_dir = root.join("region");
        std::fs::create_dir_all(&region_dir).expect("fixture directory");

        let mut region = Region::create(Cursor::new(Vec::new())).expect("create region");
        region
            .write_chunk(0, 0, &complete_chunk_bytes())
            .expect("write fixture chunk");
        let region_bytes = region.into_inner().expect("finish region").into_inner();
        std::fs::write(region_dir.join("r.0.0.mca"), region_bytes).expect("write region");

        let source = RegionSource::new(&root);
        let extracted = source
            .read_chunk_nbt(ChunkCoord::new(0, 0))
            .expect("read region")
            .expect("chunk exists");
        let cache = decode(
            ChunkCoord::new(0, 0),
            &extracted,
            AssetResolutionState::Available,
        )
        .expect("1.21.4 adapter accepts its own data version");
        assert_eq!(cache.chunk, ChunkCoord::new(0, 0));
        assert_eq!(
            cache
                .block_state_at(BlockCoord::new(0, 0, 0))
                .expect("stone block is available")
                .name,
            "minecraft:stone|"
        );
        assert_eq!(
            source.read_chunk_digest(ChunkCoord::new(0, 0)),
            source.read_chunk_digest(ChunkCoord::new(0, 0))
        );
        std::fs::remove_dir_all(root).expect("remove fixture");
    }
}
