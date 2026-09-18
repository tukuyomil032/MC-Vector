use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use fastanvil::{JavaChunk, Region};

use super::region_index::region_for_chunk;
use super::ChunkKey;

const READ_ATTEMPTS: usize = 3;
const RETRY_DELAY: Duration = Duration::from_millis(8);

pub fn read_chunk_bytes(world_root: &Path, key: &ChunkKey) -> Result<Option<Vec<u8>>, String> {
    let (region_x, region_z, local_x, local_z) = region_for_chunk(key.chunk_x, key.chunk_z);
    let path = region_path(world_root, region_x, region_z);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to inspect region file: {error}")),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("World region file is not a normal file".to_string());
    }

    let mut region = Region::from_stream(
        fs::File::open(&path).map_err(|error| format!("Failed to open region file: {error}"))?,
    )
    .map_err(|error| format!("Failed to parse region file: {error}"))?;
    for attempt in 0..READ_ATTEMPTS {
        match region.read_chunk(local_x, local_z) {
            Ok(chunk) => return Ok(chunk),
            Err(error) if attempt + 1 < READ_ATTEMPTS => {
                let _ = error;
                thread::sleep(RETRY_DELAY);
            }
            Err(error) => return Err(format!("Failed to read chunk from region: {error}")),
        }
    }
    Ok(None)
}

pub fn read_java_chunk(world_root: &Path, key: &ChunkKey) -> Result<Option<JavaChunk>, String> {
    let Some(bytes) = read_chunk_bytes(world_root, key)? else {
        return Ok(None);
    };
    catch_unwind(AssertUnwindSafe(|| JavaChunk::from_bytes(&bytes)))
        .map_err(|_| "Failed to decode Minecraft chunk NBT: parser panicked".to_string())?
        .map(Some)
        .map_err(|error| format!("Failed to decode Minecraft chunk NBT: {error}"))
}

fn region_path(world_root: &Path, region_x: i64, region_z: i64) -> PathBuf {
    world_root
        .join("region")
        .join(format!("r.{region_x}.{region_z}.mca"))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::fs;
    use std::fs::OpenOptions;

    use fastanvil::Chunk;
    use fastanvil::Region;
    use fastnbt::Value;
    use uuid::Uuid;

    use super::*;

    #[test]
    fn missing_region_is_an_empty_saved_source() {
        let root = std::env::temp_dir().join(format!("mc-vector-anvil-{}", Uuid::new_v4()));
        let key = ChunkKey::new("minecraft:overworld", -1, -1);
        assert_eq!(read_chunk_bytes(&root, &key).expect("read"), None);
    }

    #[test]
    fn reads_a_written_chunk() {
        let root = std::env::temp_dir().join(format!("mc-vector-anvil-{}", Uuid::new_v4()));
        let region_dir = root.join("region");
        fs::create_dir_all(&region_dir).expect("region directory");
        let path = region_dir.join("r.0.0.mca");
        let region_file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(&path)
            .expect("region file");
        let mut region = Region::create(region_file).expect("region create");
        region
            .write_chunk(0, 0, &[10, 0, 0, 0])
            .expect("chunk write");
        drop(region);
        let key = ChunkKey::new("minecraft:overworld", 0, 0);
        assert_eq!(
            read_chunk_bytes(&root, &key).expect("read"),
            Some(vec![10, 0, 0, 0])
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn keeps_sparse_post18_chunk_without_complete_section_conversion() {
        let bytes = fastnbt::to_bytes(&HashMap::from([
            ("DataVersion".to_string(), Value::Int(3953)),
            ("Status".to_string(), Value::String("full".to_string())),
            ("sections".to_string(), Value::List(Vec::new())),
        ]))
        .expect("minimal chunk NBT should encode");

        let chunk = JavaChunk::from_bytes(&bytes).expect("sparse chunk should decode");
        assert_eq!(chunk.y_range(), 0..0);
    }
}
