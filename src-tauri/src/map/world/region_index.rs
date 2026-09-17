use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::map::projection::floor_div;

pub const REGION_HEADER_BYTES: usize = 8192;
const REGION_SIZE_CHUNKS: i64 = 32;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RegionIndex {
    pub region_x: i64,
    pub region_z: i64,
    pub path: PathBuf,
    pub modified_at: Option<u64>,
    present_chunks: Vec<(i64, i64)>,
}

impl RegionIndex {
    pub fn present_chunks(&self) -> &[(i64, i64)] {
        &self.present_chunks
    }

    pub fn contains_chunk(&self, chunk_x: i64, chunk_z: i64) -> bool {
        self.present_chunks
            .iter()
            .any(|candidate| *candidate == (chunk_x, chunk_z))
    }
}

pub fn enumerate_region_files(world_root: &Path) -> Result<Vec<RegionIndex>, String> {
    let region_dir = world_root.join("region");
    let metadata = match fs::symlink_metadata(&region_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Failed to inspect world region directory: {error}")),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("World region path is not a normal directory".to_string());
    }

    let mut indexes = Vec::new();
    for entry in fs::read_dir(&region_dir)
        .map_err(|error| format!("Failed to read world region directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to read world region entry: {error}"))?;
        let path = entry.path();
        let entry_metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Failed to inspect world region entry: {error}"))?;
        if entry_metadata.file_type().is_symlink() || !entry_metadata.is_file() {
            continue;
        }
        let Some((region_x, region_z)) = parse_region_file_name(&path) else {
            continue;
        };
        indexes.push(read_region_index(path, region_x, region_z)?);
    }
    indexes.sort_by_key(|index| (index.region_x, index.region_z));
    Ok(indexes)
}

pub fn present_chunks_for_bounds(
    world_root: &Path,
    min_chunk_x: i64,
    max_chunk_x: i64,
    min_chunk_z: i64,
    max_chunk_z: i64,
) -> Result<Vec<(i64, i64)>, String> {
    if min_chunk_x > max_chunk_x || min_chunk_z > max_chunk_z {
        return Ok(Vec::new());
    }
    let mut chunks = Vec::new();
    for index in enumerate_region_files(world_root)? {
        let region_min_x = index.region_x * REGION_SIZE_CHUNKS;
        let region_max_x = region_min_x + REGION_SIZE_CHUNKS - 1;
        let region_min_z = index.region_z * REGION_SIZE_CHUNKS;
        let region_max_z = region_min_z + REGION_SIZE_CHUNKS - 1;
        if region_max_x < min_chunk_x
            || region_min_x > max_chunk_x
            || region_max_z < min_chunk_z
            || region_min_z > max_chunk_z
        {
            continue;
        }
        chunks.extend(
            index
                .present_chunks()
                .iter()
                .copied()
                .filter(|(chunk_x, chunk_z)| {
                    *chunk_x >= min_chunk_x
                        && *chunk_x <= max_chunk_x
                        && *chunk_z >= min_chunk_z
                        && *chunk_z <= max_chunk_z
                }),
        );
    }
    chunks.sort_unstable();
    chunks.dedup();
    Ok(chunks)
}

fn read_region_index(path: PathBuf, region_x: i64, region_z: i64) -> Result<RegionIndex, String> {
    let mut file = fs::File::open(&path)
        .map_err(|error| format!("Failed to open world region file: {error}"))?;
    let mut header = [0u8; REGION_HEADER_BYTES];
    file.read_exact(&mut header)
        .map_err(|error| format!("Failed to read world region header: {error}"))?;
    let present_chunks = (0..1024)
        .filter_map(|index| {
            let offset = index * 4;
            let location = &header[offset..offset + 4];
            let sector_offset = u32::from_be_bytes([location[0], location[1], location[2], 0]);
            let sector_count = location[3];
            if sector_offset == 0 && sector_count == 0 {
                return None;
            }
            let local_x = (index % 32) as i64;
            let local_z = (index / 32) as i64;
            Some((
                region_x * REGION_SIZE_CHUNKS + local_x,
                region_z * REGION_SIZE_CHUNKS + local_z,
            ))
        })
        .collect();
    let modified_at = fs::metadata(&path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);
    Ok(RegionIndex {
        region_x,
        region_z,
        path,
        modified_at,
        present_chunks,
    })
}

fn parse_region_file_name(path: &Path) -> Option<(i64, i64)> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(".mca")?;
    let mut parts = stem.split('.');
    if parts.next()? != "r" {
        return None;
    }
    Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
}

pub fn region_for_chunk(chunk_x: i64, chunk_z: i64) -> (i64, i64, usize, usize) {
    let region_x = floor_div(chunk_x, REGION_SIZE_CHUNKS);
    let region_z = floor_div(chunk_z, REGION_SIZE_CHUNKS);
    let local_x = (chunk_x - region_x * REGION_SIZE_CHUNKS) as usize;
    let local_z = (chunk_z - region_z * REGION_SIZE_CHUNKS) as usize;
    (region_x, region_z, local_x, local_z)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use uuid::Uuid;

    use super::*;

    #[test]
    fn enumerates_sparse_positive_and_negative_region_coordinates() {
        let root = std::env::temp_dir().join(format!("mc-vector-region-index-{}", Uuid::new_v4()));
        let region = root.join("region");
        fs::create_dir_all(&region).expect("region directory");
        let mut header = vec![0u8; REGION_HEADER_BYTES];
        let positive = 4 * (3 + 4 * 32);
        header[positive + 2] = 2;
        header[positive + 3] = 1;
        fs::write(region.join("r.0.0.mca"), &header).expect("positive region");
        let negative = 4 * (31 + 31 * 32);
        header[negative + 2] = 2;
        header[negative + 3] = 1;
        fs::write(region.join("r.-1.-1.mca"), &header).expect("negative region");

        let indexes = enumerate_region_files(&root).expect("indexes");
        assert_eq!(indexes.len(), 2);
        assert!(indexes.iter().any(|index| index.contains_chunk(3, 4)));
        assert!(indexes.iter().any(|index| index.contains_chunk(-1, -1)));
        assert_eq!(
            present_chunks_for_bounds(&root, -1, -1, -1, -1).expect("negative bounds"),
            vec![(-1, -1)]
        );
        assert_eq!(region_for_chunk(-1, -1), (-1, -1, 31, 31));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn ignores_non_region_files() {
        let root = std::env::temp_dir().join(format!("mc-vector-region-ignore-{}", Uuid::new_v4()));
        let region = root.join("region");
        fs::create_dir_all(&region).expect("region directory");
        fs::write(region.join("README"), b"not a region").expect("fixture");
        assert!(enumerate_region_files(&root).expect("indexes").is_empty());
        fs::remove_dir_all(root).expect("cleanup");
    }
}
