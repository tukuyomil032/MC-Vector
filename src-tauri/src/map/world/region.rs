//! Bounded access to Minecraft Anvil region files.
//!
//! The adapter deliberately stops at decompressed chunk bytes.  NBT decoding
//! and conversion into the renderer domain live in `anvil.rs`, so the latter
//! can also be exercised with in-memory region data.

use std::fs::File;
use std::path::{Path, PathBuf};

use fastanvil::Region;
use sha2::{Digest, Sha256};

use super::chunk_view::ChunkCoord;

const REGION_SIDE: i64 = 32;
const MAX_REGION_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CHUNK_NBT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum RegionReadError {
    RegionTooLarge,
    ChunkTooLarge,
    InvalidRegion,
    Io,
}

#[derive(Debug, Clone)]
pub struct RegionSource {
    world_root: PathBuf,
}

impl RegionSource {
    pub fn new(world_root: impl Into<PathBuf>) -> Self {
        Self {
            world_root: world_root.into(),
        }
    }

    pub fn world_root(&self) -> &Path {
        &self.world_root
    }

    pub fn read_chunk_nbt(&self, chunk: ChunkCoord) -> Result<Option<Vec<u8>>, RegionReadError> {
        let (region, local_x, local_z) = region_location(chunk);
        let path = self
            .world_root
            .join("region")
            .join(format!("r.{}.{}.mca", region.x, region.z));

        let metadata = match std::fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(RegionReadError::Io),
        };
        if metadata.len() > MAX_REGION_FILE_BYTES {
            return Err(RegionReadError::RegionTooLarge);
        }

        let file = File::open(&path).map_err(|_| RegionReadError::Io)?;
        let mut region_file =
            Region::from_stream(file).map_err(|_| RegionReadError::InvalidRegion)?;
        let chunk = region_file
            .read_chunk(local_x, local_z)
            .map_err(|_| RegionReadError::InvalidRegion)?;
        let Some(chunk) = chunk else {
            return Ok(None);
        };
        if chunk.len() > MAX_CHUNK_NBT_BYTES {
            return Err(RegionReadError::ChunkTooLarge);
        }
        Ok(Some(chunk))
    }

    pub fn read_chunk_digest(
        &self,
        chunk: ChunkCoord,
    ) -> Result<Option<[u8; 32]>, RegionReadError> {
        let Some(bytes) = self.read_chunk_nbt(chunk)? else {
            return Ok(None);
        };
        let digest = Sha256::digest(bytes);
        let mut result = [0_u8; 32];
        result.copy_from_slice(&digest);
        Ok(Some(result))
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct RegionCoord {
    pub x: i64,
    pub z: i64,
}

pub fn region_location(chunk: ChunkCoord) -> (RegionCoord, usize, usize) {
    let region = RegionCoord {
        x: chunk.x.div_euclid(REGION_SIDE),
        z: chunk.z.div_euclid(REGION_SIDE),
    };
    (
        region,
        chunk.x.rem_euclid(REGION_SIDE) as usize,
        chunk.z.rem_euclid(REGION_SIDE) as usize,
    )
}

#[cfg(test)]
mod tests {
    use super::{region_location, RegionCoord};
    use crate::map::world::chunk_view::ChunkCoord;

    #[test]
    fn negative_chunk_coordinates_use_region_floor_division() {
        assert_eq!(
            region_location(ChunkCoord::new(-1, -33)),
            (RegionCoord { x: -1, z: -2 }, 31, 31)
        );
    }
}
