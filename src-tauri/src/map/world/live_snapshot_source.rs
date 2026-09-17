use std::collections::HashMap;
use std::io::Read;

use base64::Engine;
use flate2::read::ZlibDecoder;
use serde_json::Value;

use super::{ChunkKey, ChunkLayer, ChunkSourceKind, ChunkView};

const MAX_COMPRESSED_BYTES: usize = 256 * 1024;
const MAX_DECOMPRESSED_BYTES: usize = 2 * 1024 * 1024;
const MAX_DICTIONARY_ENTRIES: usize = 4096;
const MAX_SURFACE_LAYERS: usize = 16;

#[derive(Clone, Debug)]
struct CachedSnapshot {
    received_at: u64,
    view: ChunkView,
}

#[derive(Clone, Debug)]
pub struct LiveSnapshotCache {
    entries: HashMap<ChunkKey, CachedSnapshot>,
    max_age_ms: u64,
}

impl LiveSnapshotCache {
    pub fn new(max_age_ms: u64) -> Self {
        Self {
            entries: HashMap::new(),
            max_age_ms,
        }
    }

    pub fn insert(&mut self, view: ChunkView, received_at: u64) {
        let mut cached_view = view;
        cached_view.source = ChunkSourceKind::CachedLive;
        self.entries.insert(
            cached_view.key.clone(),
            CachedSnapshot {
                received_at,
                view: cached_view,
            },
        );
    }

    pub fn get(&self, key: &ChunkKey, now: u64) -> Option<ChunkView> {
        let cached = self.entries.get(key)?;
        if now.saturating_sub(cached.received_at) > self.max_age_ms {
            return None;
        }
        Some(cached.view.clone())
    }

    pub fn remove(&mut self, key: &ChunkKey) {
        self.entries.remove(key);
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

pub fn decode_live_snapshot(value: &Value) -> Result<ChunkView, String> {
    if value.get("codec").and_then(Value::as_str) != Some("deflate-base64") {
        return Err("Unsupported live chunk snapshot codec".to_string());
    }
    let dimension = value
        .get("dimension")
        .and_then(Value::as_str)
        .ok_or_else(|| "Live chunk snapshot is missing dimension".to_string())?;
    let payload = value
        .get("payload")
        .and_then(Value::as_str)
        .ok_or_else(|| "Live chunk snapshot is missing payload".to_string())?;
    let compressed = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|_| "Live chunk snapshot payload is not valid base64".to_string())?;
    if compressed.len() > MAX_COMPRESSED_BYTES {
        return Err("Live chunk snapshot payload is too large".to_string());
    }
    let decoder = ZlibDecoder::new(compressed.as_slice());
    let mut data = Vec::new();
    decoder
        .take((MAX_DECOMPRESSED_BYTES + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|_| "Live chunk snapshot payload could not be decompressed".to_string())?;
    if data.len() > MAX_DECOMPRESSED_BYTES {
        return Err("Live chunk snapshot decompressed payload is too large".to_string());
    }

    let mut cursor = 0;
    let magic = read_i32(&data, &mut cursor)? as u32;
    if magic != 0x4D43_5653 || read_u8(&data, &mut cursor)? != 1 {
        return Err("Unsupported live chunk snapshot format".to_string());
    }
    let chunk_x = i64::from(read_i32(&data, &mut cursor)?);
    let chunk_z = i64::from(read_i32(&data, &mut cursor)?);
    let min_y = read_i32(&data, &mut cursor)?;
    let max_y = read_i32(&data, &mut cursor)?;
    if min_y >= max_y {
        return Err("Live chunk snapshot height range is invalid".to_string());
    }

    let state_count = usize::from(read_u16(&data, &mut cursor)?);
    let biome_count = usize::from(read_u16(&data, &mut cursor)?);
    if state_count > MAX_DICTIONARY_ENTRIES || biome_count > MAX_DICTIONARY_ENTRIES {
        return Err("Live chunk snapshot dictionary is too large".to_string());
    }
    let mut states = Vec::with_capacity(state_count);
    let mut biomes = Vec::with_capacity(biome_count);
    for _ in 0..state_count {
        states.push(decode_string(&data, &mut cursor)?);
    }
    for _ in 0..biome_count {
        biomes.push(decode_string(&data, &mut cursor)?);
    }

    let mut columns = Vec::with_capacity(256);
    for _ in 0..256 {
        let layer_count = usize::from(read_u8(&data, &mut cursor)?);
        if layer_count > MAX_SURFACE_LAYERS {
            return Err("Live chunk snapshot exceeds the surface layer limit".to_string());
        }
        let mut layers = Vec::with_capacity(layer_count);
        for _ in 0..layer_count {
            let y = i32::from(read_i16(&data, &mut cursor)?);
            let state_index = usize::from(read_u16(&data, &mut cursor)?);
            let biome_index = usize::from(read_u16(&data, &mut cursor)?);
            let sky_light = read_u8(&data, &mut cursor)?;
            let block_light = read_u8(&data, &mut cursor)?;
            let state = states
                .get(state_index)
                .ok_or_else(|| "Live chunk snapshot state index is invalid".to_string())?
                .clone();
            let biome = biomes
                .get(biome_index)
                .ok_or_else(|| "Live chunk snapshot biome index is invalid".to_string())?
                .clone();
            layers.push(ChunkLayer {
                y,
                state,
                biome,
                sky_light,
                block_light,
            });
        }
        columns.push(layers);
    }

    if cursor != data.len() {
        return Err("Live chunk snapshot contains trailing bytes".to_string());
    }
    let key = ChunkKey::new(dimension, chunk_x, chunk_z);
    ChunkView::new(
        key,
        min_y,
        max_y,
        columns,
        value
            .get("capturedAt")
            .and_then(Value::as_u64)
            .unwrap_or_default(),
        value.get("capturedAt").and_then(Value::as_u64),
        ChunkSourceKind::LiveSnapshot,
    )
}

fn decode_string(data: &[u8], cursor: &mut usize) -> Result<String, String> {
    let length = read_u16(data, cursor)? as usize;
    let end = cursor
        .checked_add(length)
        .ok_or_else(|| "Snapshot string length overflowed".to_string())?;
    let bytes = data
        .get(*cursor..end)
        .ok_or_else(|| "Snapshot string exceeded payload".to_string())?;
    *cursor = end;
    String::from_utf8(bytes.to_vec()).map_err(|_| "Snapshot string was not UTF-8".to_string())
}

fn read_u8(data: &[u8], cursor: &mut usize) -> Result<u8, String> {
    let value = *data
        .get(*cursor)
        .ok_or_else(|| "Snapshot payload ended unexpectedly".to_string())?;
    *cursor += 1;
    Ok(value)
}

fn read_u16(data: &[u8], cursor: &mut usize) -> Result<u16, String> {
    let bytes = data
        .get(*cursor..(*cursor).saturating_add(2))
        .ok_or_else(|| "Snapshot payload ended unexpectedly".to_string())?;
    *cursor += 2;
    Ok(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn read_i16(data: &[u8], cursor: &mut usize) -> Result<i16, String> {
    Ok(read_u16(data, cursor)? as i16)
}

fn read_i32(data: &[u8], cursor: &mut usize) -> Result<i32, String> {
    let bytes = data
        .get(*cursor..(*cursor).saturating_add(4))
        .ok_or_else(|| "Snapshot payload ended unexpectedly".to_string())?;
    *cursor += 4;
    Ok(i32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use flate2::{write::ZlibEncoder, Compression};

    use super::*;

    fn payload(dimension: &str, captured_at: u64) -> Value {
        let mut raw = Vec::new();
        raw.extend_from_slice(&0x4D43_5653_u32.to_be_bytes());
        raw.push(1);
        raw.extend_from_slice(&(-12_i32).to_be_bytes());
        raw.extend_from_slice(&34_i32.to_be_bytes());
        raw.extend_from_slice(&(-64_i32).to_be_bytes());
        raw.extend_from_slice(&320_i32.to_be_bytes());
        raw.extend_from_slice(&1_u16.to_be_bytes());
        raw.extend_from_slice(&1_u16.to_be_bytes());
        for value in ["minecraft:grass_block", "minecraft:plains"] {
            raw.extend_from_slice(&(value.len() as u16).to_be_bytes());
            raw.extend_from_slice(value.as_bytes());
        }
        for _ in 0..256 {
            raw.push(1);
            raw.extend_from_slice(&70_i16.to_be_bytes());
            raw.extend_from_slice(&0_u16.to_be_bytes());
            raw.extend_from_slice(&0_u16.to_be_bytes());
            raw.push(15);
            raw.push(0);
        }
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&raw).expect("compress");
        let compressed = encoder.finish().expect("finish");
        serde_json::json!({
            "dimension": dimension,
            "capturedAt": captured_at,
            "codec": "deflate-base64",
            "payload": base64::engine::general_purpose::STANDARD.encode(compressed),
        })
    }

    #[test]
    fn decodes_bounded_surface_payload_into_a_chunk_view() {
        let view = decode_live_snapshot(&payload("minecraft:overworld", 42)).expect("decode");
        assert_eq!(view.key, ChunkKey::new("minecraft:overworld", -12, 34));
        assert_eq!(view.columns.len(), 256);
        assert_eq!(
            view.surface_layer(0, 0).expect("surface").state,
            "minecraft:grass_block"
        );
        assert_eq!(view.revision, 42);
        assert_eq!(view.source, ChunkSourceKind::LiveSnapshot);
    }

    #[test]
    fn rejects_missing_dimension_and_trailing_data() {
        let mut value = payload("minecraft:overworld", 42);
        value.as_object_mut().expect("object").remove("dimension");
        assert!(decode_live_snapshot(&value).is_err());
    }

    #[test]
    fn cache_returns_newest_snapshot_until_deterministic_expiry() {
        let view = decode_live_snapshot(&payload("minecraft:overworld", 42)).expect("decode");
        let key = view.key.clone();
        let mut cache = LiveSnapshotCache::new(1_000);
        cache.insert(view, 10_000);
        assert_eq!(
            cache.get(&key, 11_000).expect("fresh").source,
            ChunkSourceKind::CachedLive
        );
        assert!(cache.get(&key, 11_001).is_none());
        assert_eq!(cache.len(), 1);
    }
}
