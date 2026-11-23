//! Read-only views of Minecraft NBT files for the Native Files view: a flat
//! tree of tags, a world's level.dat summary and a region file's chunk count.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use fastnbt::Value;
use flate2::read::{GzDecoder, ZlibDecoder};

/// Decompressed NBT larger than this is refused.
pub const MAX_NBT_BYTES: u64 = 64 * 1024 * 1024;
/// Tags listed before the tree is cut off.
pub const MAX_NBT_NODES: usize = 20_000;
/// Array items written into an array tag's value.
const ARRAY_PREVIEW: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NbtErrorKind {
    TooLarge,
    Invalid,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NbtError {
    pub kind: NbtErrorKind,
    pub message: String,
}

impl NbtError {
    fn new(kind: NbtErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

/// One tag. `parent` is `None` for the root's children's parent, the root itself.
#[derive(Debug, Clone, PartialEq)]
pub struct NbtNode {
    pub id: u32,
    pub parent: Option<u32>,
    /// The key in a compound, or `[index]` in a list.
    pub name: String,
    pub kind: &'static str,
    /// Display text for leaves and arrays; empty for compounds and lists.
    pub value: String,
    pub child_count: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NbtTree {
    /// In display order: each node follows its parent, children sorted by name.
    pub nodes: Vec<NbtNode>,
    pub truncated: bool,
    pub compression: &'static str,
}

/// The parts of level.dat the Files view shows for a world folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorldInfo {
    pub level_name: Option<String>,
    pub seed: Option<i64>,
    pub version_name: Option<String>,
    pub data_version: Option<i32>,
    /// Milliseconds since the Unix epoch.
    pub last_played: Option<i64>,
    pub game_type: Option<i32>,
    pub hardcore: Option<bool>,
}

/// Reads an NBT file (gzip, zlib or uncompressed) into a flat tree.
pub fn read_nbt_tree(path: &Path) -> Result<NbtTree, NbtError> {
    let (bytes, compression) = read_nbt_bytes(path)?;
    let value: Value = fastnbt::from_bytes(&bytes)
        .map_err(|error| NbtError::new(NbtErrorKind::Invalid, format!("not NBT: {error}")))?;
    let mut tree = NbtTree {
        nodes: Vec::new(),
        truncated: false,
        compression,
    };
    flatten(&value, String::new(), None, &mut tree);
    Ok(tree)
}

/// Summarises `<folder>/level.dat`; `None` when the folder has none.
pub fn read_world_info(folder: &Path) -> Result<Option<WorldInfo>, NbtError> {
    let level = folder.join("level.dat");
    if !level.is_file() {
        return Ok(None);
    }
    let (bytes, _) = read_nbt_bytes(&level)?;
    let root: Value = fastnbt::from_bytes(&bytes)
        .map_err(|error| NbtError::new(NbtErrorKind::Invalid, format!("not NBT: {error}")))?;
    let Some(data) = compound(&root).and_then(|root| compound(root.get("Data")?)) else {
        return Ok(None);
    };
    let seed = data
        .get("WorldGenSettings")
        .and_then(compound)
        .and_then(|settings| integer(settings.get("seed")?))
        .or_else(|| integer(data.get("RandomSeed")?));
    let version = data.get("Version").and_then(compound);
    Ok(Some(WorldInfo {
        level_name: text(data.get("LevelName")),
        seed,
        version_name: version.and_then(|version| text(version.get("Name"))),
        data_version: data
            .get("DataVersion")
            .and_then(integer)
            .and_then(|value| i32::try_from(value).ok()),
        last_played: data.get("LastPlayed").and_then(integer),
        game_type: data
            .get("GameType")
            .and_then(integer)
            .and_then(|value| i32::try_from(value).ok()),
        hardcore: data
            .get("hardcore")
            .and_then(integer)
            .map(|value| value != 0),
    }))
}

/// Chunks present in a region (.mca) file: the non-zero entries of its
/// 1024-entry location table.
pub fn count_region_chunks(path: &Path) -> Result<u32, NbtError> {
    let mut header = [0_u8; 4096];
    let mut file = std::fs::File::open(path).map_err(io_error)?;
    let mut read = 0;
    while read < header.len() {
        let count = file.read(&mut header[read..]).map_err(io_error)?;
        if count == 0 {
            break;
        }
        read += count;
    }
    if read < header.len() {
        return Err(NbtError::new(
            NbtErrorKind::Invalid,
            "not a region file: the header is shorter than 4 KiB",
        ));
    }
    Ok(header
        .chunks_exact(4)
        .filter(|entry| entry.iter().any(|byte| *byte != 0))
        .count() as u32)
}

// MARK: Reading

fn read_nbt_bytes(path: &Path) -> Result<(Vec<u8>, &'static str), NbtError> {
    let raw = std::fs::read(path).map_err(io_error)?;
    match raw.as_slice() {
        [0x1f, 0x8b, ..] => Ok((inflate(GzDecoder::new(raw.as_slice()))?, "gzip")),
        [0x78, 0x01 | 0x5e | 0x9c | 0xda, ..] => {
            Ok((inflate(ZlibDecoder::new(raw.as_slice()))?, "zlib"))
        }
        _ => {
            if raw.len() as u64 > MAX_NBT_BYTES {
                return Err(too_large());
            }
            Ok((raw, "none"))
        }
    }
}

fn inflate(reader: impl Read) -> Result<Vec<u8>, NbtError> {
    let mut bytes = Vec::new();
    reader
        .take(MAX_NBT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            NbtError::new(NbtErrorKind::Invalid, format!("cannot decompress: {error}"))
        })?;
    if bytes.len() as u64 > MAX_NBT_BYTES {
        return Err(too_large());
    }
    Ok(bytes)
}

fn too_large() -> NbtError {
    NbtError::new(
        NbtErrorKind::TooLarge,
        format!("NBT larger than {} MiB", MAX_NBT_BYTES / 1024 / 1024),
    )
}

fn io_error(error: std::io::Error) -> NbtError {
    NbtError::new(NbtErrorKind::Io, error.to_string())
}

// MARK: Flattening

/// Appends `value` and its descendants; returns false once the limit is hit.
fn flatten(value: &Value, name: String, parent: Option<u32>, tree: &mut NbtTree) -> bool {
    if tree.nodes.len() >= MAX_NBT_NODES {
        tree.truncated = true;
        return false;
    }
    let id = tree.nodes.len() as u32;
    let (kind, text, children) = describe(value);
    tree.nodes.push(NbtNode {
        id,
        parent,
        name,
        kind,
        value: text,
        child_count: children.len() as u32,
    });
    for (child_name, child) in children {
        if !flatten(child, child_name, Some(id), tree) {
            return false;
        }
    }
    true
}

/// A tag's kind, its display text, and its children (sorted for compounds).
fn describe(value: &Value) -> (&'static str, String, Vec<(String, &Value)>) {
    match value {
        Value::Byte(byte) => ("byte", byte.to_string(), Vec::new()),
        Value::Short(short) => ("short", short.to_string(), Vec::new()),
        Value::Int(int) => ("int", int.to_string(), Vec::new()),
        Value::Long(long) => ("long", long.to_string(), Vec::new()),
        Value::Float(float) => ("float", float.to_string(), Vec::new()),
        Value::Double(double) => ("double", double.to_string(), Vec::new()),
        Value::String(string) => ("string", string.clone(), Vec::new()),
        Value::ByteArray(array) => ("byte_array", preview(array.iter()), Vec::new()),
        Value::IntArray(array) => ("int_array", preview(array.iter()), Vec::new()),
        Value::LongArray(array) => ("long_array", preview(array.iter()), Vec::new()),
        Value::List(items) => (
            "list",
            String::new(),
            items
                .iter()
                .enumerate()
                .map(|(index, item)| (format!("[{index}]"), item))
                .collect(),
        ),
        Value::Compound(map) => {
            let mut entries: Vec<(String, &Value)> =
                map.iter().map(|(key, item)| (key.clone(), item)).collect();
            entries.sort_by(|a, b| {
                a.0.to_lowercase()
                    .cmp(&b.0.to_lowercase())
                    .then(a.0.cmp(&b.0))
            });
            ("compound", String::new(), entries)
        }
    }
}

/// "N items: a, b, c, …" with at most ARRAY_PREVIEW items.
fn preview<T: ToString>(items: impl ExactSizeIterator<Item = T>) -> String {
    let count = items.len();
    let shown: Vec<String> = items
        .take(ARRAY_PREVIEW)
        .map(|item| item.to_string())
        .collect();
    let more = if count > ARRAY_PREVIEW { ", …" } else { "" };
    format!("[{count}] {}{more}", shown.join(", "))
}

// MARK: Value helpers

fn compound(value: &Value) -> Option<&HashMap<String, Value>> {
    match value {
        Value::Compound(map) => Some(map),
        _ => None,
    }
}

fn integer(value: &Value) -> Option<i64> {
    match value {
        Value::Byte(value) => Some(i64::from(*value)),
        Value::Short(value) => Some(i64::from(*value)),
        Value::Int(value) => Some(i64::from(*value)),
        Value::Long(value) => Some(*value),
        _ => None,
    }
}

fn text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(string) => Some(string.clone()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    /// Uncompressed NBT for a small level.dat.
    fn level_dat() -> Vec<u8> {
        let mut nbt = Vec::new();
        // TAG_Compound "" {
        nbt.extend([10, 0, 0]);
        // TAG_Compound "Data" {
        nbt.extend([10, 0, 4]);
        nbt.extend(b"Data");
        // TAG_String "LevelName" = "world"
        nbt.extend([8, 0, 9]);
        nbt.extend(b"LevelName");
        nbt.extend([0, 5]);
        nbt.extend(b"world");
        // TAG_Long "LastPlayed" = 1_700_000_000_000
        nbt.extend([4, 0, 10]);
        nbt.extend(b"LastPlayed");
        nbt.extend(1_700_000_000_000_i64.to_be_bytes());
        // TAG_Int "GameType" = 1
        nbt.extend([3, 0, 8]);
        nbt.extend(b"GameType");
        nbt.extend(1_i32.to_be_bytes());
        // TAG_Byte "hardcore" = 0
        nbt.extend([1, 0, 8]);
        nbt.extend(b"hardcore");
        nbt.push(0);
        // TAG_Compound "WorldGenSettings" { TAG_Long "seed" = -42 }
        nbt.extend([10, 0, 16]);
        nbt.extend(b"WorldGenSettings");
        nbt.extend([4, 0, 4]);
        nbt.extend(b"seed");
        nbt.extend((-42_i64).to_be_bytes());
        nbt.push(0);
        // TAG_List "Pos" of 2 doubles
        nbt.extend([9, 0, 3]);
        nbt.extend(b"Pos");
        nbt.push(6);
        nbt.extend(2_i32.to_be_bytes());
        nbt.extend(1.5_f64.to_be_bytes());
        nbt.extend(64.0_f64.to_be_bytes());
        // TAG_Int_Array "UUID" of 4
        nbt.extend([11, 0, 4]);
        nbt.extend(b"UUID");
        nbt.extend(4_i32.to_be_bytes());
        for part in [1_i32, 2, 3, 4] {
            nbt.extend(part.to_be_bytes());
        }
        // } }
        nbt.extend([0, 0]);
        nbt
    }

    fn gzip(bytes: &[u8]) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(bytes).unwrap();
        encoder.finish().unwrap()
    }

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn reads_gzip_and_plain_trees_alike() {
        let dir = temp_dir();
        let plain = dir.path().join("plain.nbt");
        let packed = dir.path().join("level.dat");
        std::fs::write(&plain, level_dat()).unwrap();
        std::fs::write(&packed, gzip(&level_dat())).unwrap();
        let plain_tree = read_nbt_tree(&plain).unwrap();
        let packed_tree = read_nbt_tree(&packed).unwrap();
        assert_eq!(plain_tree.compression, "none");
        assert_eq!(packed_tree.compression, "gzip");
        assert_eq!(plain_tree.nodes, packed_tree.nodes);
        assert!(!packed_tree.truncated);

        let nodes = &packed_tree.nodes;
        assert_eq!(nodes[0].kind, "compound");
        assert_eq!(nodes[0].child_count, 1);
        let data = &nodes[1];
        assert_eq!((data.name.as_str(), data.parent), ("Data", Some(0)));
        // Children sorted by name, case-insensitively.
        let names: Vec<&str> = nodes
            .iter()
            .filter(|node| node.parent == Some(data.id))
            .map(|node| node.name.as_str())
            .collect();
        assert_eq!(
            names,
            [
                "GameType",
                "hardcore",
                "LastPlayed",
                "LevelName",
                "Pos",
                "UUID",
                "WorldGenSettings"
            ]
        );
        let level = nodes.iter().find(|node| node.name == "LevelName").unwrap();
        assert_eq!((level.kind, level.value.as_str()), ("string", "world"));
        let uuid = nodes.iter().find(|node| node.name == "UUID").unwrap();
        assert_eq!(
            (uuid.kind, uuid.value.as_str()),
            ("int_array", "[4] 1, 2, 3, 4")
        );
        let pos = nodes.iter().find(|node| node.name == "Pos").unwrap();
        assert_eq!((pos.kind, pos.child_count), ("list", 2));
        assert!(nodes
            .iter()
            .any(|node| node.name == "[1]" && node.value == "64"));
    }

    #[test]
    fn summarises_level_dat() {
        let dir = temp_dir();
        std::fs::write(dir.path().join("level.dat"), gzip(&level_dat())).unwrap();
        let info = read_world_info(dir.path()).unwrap().unwrap();
        assert_eq!(info.level_name.as_deref(), Some("world"));
        assert_eq!(info.seed, Some(-42));
        assert_eq!(info.last_played, Some(1_700_000_000_000));
        assert_eq!(info.game_type, Some(1));
        assert_eq!(info.hardcore, Some(false));
        assert_eq!(info.version_name, None);
    }

    #[test]
    fn folders_without_level_dat_are_not_worlds() {
        let dir = temp_dir();
        assert_eq!(read_world_info(dir.path()).unwrap(), None);
    }

    #[test]
    fn stops_at_the_node_limit() {
        let mut nbt = vec![10, 0, 0, 9, 0, 4];
        nbt.extend(b"list");
        nbt.push(1);
        let count = MAX_NBT_NODES as i32 + 10;
        nbt.extend(count.to_be_bytes());
        nbt.extend(std::iter::repeat_n(7_u8, count as usize));
        nbt.push(0);
        let dir = temp_dir();
        let path = dir.path().join("big.nbt");
        std::fs::write(&path, nbt).unwrap();
        let tree = read_nbt_tree(&path).unwrap();
        assert!(tree.truncated);
        assert_eq!(tree.nodes.len(), MAX_NBT_NODES);
    }

    #[test]
    fn rejects_files_that_are_not_nbt() {
        let dir = temp_dir();
        let path = dir.path().join("server.properties");
        std::fs::write(&path, "motd=hello\n").unwrap();
        assert_eq!(
            read_nbt_tree(&path).unwrap_err().kind,
            NbtErrorKind::Invalid
        );
        let broken = dir.path().join("broken.dat");
        std::fs::write(&broken, [0x1f, 0x8b, 0, 1, 2]).unwrap();
        assert_eq!(
            read_nbt_tree(&broken).unwrap_err().kind,
            NbtErrorKind::Invalid
        );
    }

    #[test]
    fn counts_region_chunks() {
        let dir = temp_dir();
        let path = dir.path().join("r.0.0.mca");
        let mut region = vec![0_u8; 8192];
        region[0..4].copy_from_slice(&[0, 0, 2, 1]);
        region[40..44].copy_from_slice(&[0, 0, 3, 1]);
        std::fs::write(&path, &region).unwrap();
        assert_eq!(count_region_chunks(&path).unwrap(), 2);
        let short = dir.path().join("r.1.0.mca");
        std::fs::write(&short, [1, 2, 3]).unwrap();
        assert_eq!(
            count_region_chunks(&short).unwrap_err().kind,
            NbtErrorKind::Invalid
        );
    }
}
