use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

use fastnbt::Value;
use flate2::read::GzDecoder;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WorldMetadata {
    pub spawn_x: Option<i64>,
    pub spawn_y: Option<i64>,
    pub spawn_z: Option<i64>,
    pub data_version: Option<i64>,
    pub world_border: Option<WorldBorderMetadata>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WorldBorderMetadata {
    pub center_x: Option<f64>,
    pub center_z: Option<f64>,
    pub size: Option<f64>,
    pub warning_blocks: Option<i64>,
    pub warning_time: Option<i64>,
}

pub fn read_level_metadata(world_root: &Path) -> Result<Option<WorldMetadata>, String> {
    let path = world_root.join("level.dat");
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read world level metadata: {error}")),
    };
    parse_level_metadata(&bytes).map(Some)
}

fn parse_level_metadata(bytes: &[u8]) -> Result<WorldMetadata, String> {
    let mut decoded = Vec::new();
    if bytes.starts_with(&[0x1f, 0x8b]) {
        GzDecoder::new(bytes)
            .read_to_end(&mut decoded)
            .map_err(|error| format!("Failed to decompress level.dat: {error}"))?;
    } else {
        decoded.extend_from_slice(bytes);
    }
    let value: Value = fastnbt::from_bytes(&decoded)
        .map_err(|error| format!("Failed to parse level.dat NBT: {error}"))?;
    let root = match value {
        Value::Compound(root) => root,
        _ => return Err("level.dat root is not an NBT compound".to_string()),
    };
    let data = root.get("Data").and_then(as_compound).unwrap_or(&root);
    Ok(WorldMetadata {
        spawn_x: integer(data, "SpawnX"),
        spawn_y: integer(data, "SpawnY"),
        spawn_z: integer(data, "SpawnZ"),
        data_version: integer(data, "DataVersion"),
        world_border: parse_world_border(data),
    })
}

fn as_compound(value: &Value) -> Option<&HashMap<String, Value>> {
    match value {
        Value::Compound(compound) => Some(compound),
        _ => None,
    }
}

fn integer(compound: &HashMap<String, Value>, key: &str) -> Option<i64> {
    match compound.get(key)? {
        Value::Byte(value) => Some(i64::from(*value)),
        Value::Short(value) => Some(i64::from(*value)),
        Value::Int(value) => Some(i64::from(*value)),
        Value::Long(value) => Some(*value),
        _ => None,
    }
}

fn parse_world_border(data: &HashMap<String, Value>) -> Option<WorldBorderMetadata> {
    let border = WorldBorderMetadata {
        center_x: finite_double(data, "BorderCenterX"),
        center_z: finite_double(data, "BorderCenterZ"),
        size: finite_double(data, "BorderSize"),
        warning_blocks: integer(data, "BorderWarningBlocks"),
        warning_time: integer(data, "BorderWarningTime"),
    };
    (border.center_x.is_some()
        || border.center_z.is_some()
        || border.size.is_some()
        || border.warning_blocks.is_some()
        || border.warning_time.is_some())
    .then_some(border)
}

fn finite_double(compound: &HashMap<String, Value>, key: &str) -> Option<f64> {
    match compound.get(key)? {
        Value::Double(value) if value.is_finite() => Some(*value),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::io::Write;

    use fastnbt::Value;
    use flate2::{write::GzEncoder, Compression};

    use super::*;

    fn level_dat() -> Vec<u8> {
        let data = Value::Compound(HashMap::from([
            ("SpawnX".to_string(), Value::Int(128)),
            ("SpawnY".to_string(), Value::Int(70)),
            ("SpawnZ".to_string(), Value::Int(-32)),
            ("DataVersion".to_string(), Value::Int(4189)),
        ]));
        let root = Value::Compound(HashMap::from([("Data".to_string(), data)]));
        let raw = fastnbt::to_bytes(&root).expect("NBT");
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&raw).expect("gzip");
        encoder.finish().expect("finish")
    }

    fn level_dat_with_world_border(border: HashMap<String, Value>) -> Vec<u8> {
        let mut entries = HashMap::from([
            ("SpawnX".to_string(), Value::Int(128)),
            ("SpawnY".to_string(), Value::Int(70)),
            ("SpawnZ".to_string(), Value::Int(-32)),
            ("DataVersion".to_string(), Value::Int(4189)),
        ]);
        entries.extend(border);
        let data = Value::Compound(entries);
        let root = Value::Compound(HashMap::from([("Data".to_string(), data)]));
        let raw = fastnbt::to_bytes(&root).expect("NBT");
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&raw).expect("gzip");
        encoder.finish().expect("finish")
    }

    #[test]
    fn reads_spawn_and_data_version_from_gzipped_level_dat() {
        let metadata = parse_level_metadata(&level_dat()).expect("metadata");
        assert_eq!(metadata.spawn_x, Some(128));
        assert_eq!(metadata.spawn_y, Some(70));
        assert_eq!(metadata.spawn_z, Some(-32));
        assert_eq!(metadata.data_version, Some(4189));
        assert_eq!(metadata.world_border, None);
    }

    #[test]
    fn reads_flat_world_border_fields_without_changing_spawn_metadata() {
        let border = HashMap::from([
            ("BorderCenterX".to_string(), Value::Double(12.5)),
            ("BorderCenterZ".to_string(), Value::Double(-8.25)),
            ("BorderSize".to_string(), Value::Double(59_999_968.0)),
            ("BorderWarningBlocks".to_string(), Value::Int(5)),
            ("BorderWarningTime".to_string(), Value::Int(15)),
        ]);
        let metadata =
            parse_level_metadata(&level_dat_with_world_border(border)).expect("metadata");

        assert_eq!(metadata.spawn_x, Some(128));
        assert_eq!(metadata.spawn_z, Some(-32));
        assert_eq!(
            metadata.world_border,
            Some(WorldBorderMetadata {
                center_x: Some(12.5),
                center_z: Some(-8.25),
                size: Some(59_999_968.0),
                warning_blocks: Some(5),
                warning_time: Some(15),
            })
        );
    }

    #[test]
    fn invalid_flat_world_border_fields_are_none_without_failing_world_metadata() {
        let border = HashMap::from([
            (
                "BorderCenterX".to_string(),
                Value::String("12.5".to_string()),
            ),
            ("BorderCenterZ".to_string(), Value::Double(-8.25)),
            ("BorderSize".to_string(), Value::Int(100)),
            (
                "BorderWarningBlocks".to_string(),
                Value::String("five".to_string()),
            ),
            ("BorderWarningTime".to_string(), Value::Int(15)),
        ]);
        let metadata = parse_level_metadata(&level_dat_with_world_border(border))
            .expect("invalid optional fields must not fail parsing");

        assert_eq!(metadata.spawn_x, Some(128));
        assert_eq!(
            metadata.world_border,
            Some(WorldBorderMetadata {
                center_x: None,
                center_z: Some(-8.25),
                size: None,
                warning_blocks: None,
                warning_time: Some(15),
            })
        );
    }

    #[test]
    fn malformed_level_dat_returns_a_diagnostic() {
        let error = parse_level_metadata(b"not nbt").expect_err("invalid NBT");
        assert!(error.contains("level.dat"));
    }
}
