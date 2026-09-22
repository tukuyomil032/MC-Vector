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
    use fastnbt::Value;

    use super::{decode, AdapterError, DATA_VERSION};
    use crate::assets::model_view::AssetResolutionState;
    use crate::world::anvil::AnvilError;
    use crate::world::chunk_view::ChunkCoord;

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
}
