//! Verified tile cache primitives.
//!
//! A tile PNG is never trusted by itself.  The metadata binds it to the
//! renderer, Minecraft assets, world/chunk input, geometry, source, and a
//! content digest.  Non-success states remain observable but are never
//! returned as fresh terrain.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::domain::MinecraftVersionId;
use crate::renderer::dynmap::tile::{TileCoordinate, TileProjection};

pub const TILE_CACHE_SCHEMA_VERSION: u16 = 2;

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct TileCacheKey {
    pub minecraft_version: MinecraftVersionId,
    pub renderer_version: String,
    pub asset_sha256: String,
    pub world_digest: String,
    pub chunk_digest: String,
    pub projection: TileProjection,
    pub zoom: u8,
    pub tile: TileCoordinate,
}

impl TileCacheKey {
    pub fn digest(&self) -> Result<String, TileCacheError> {
        let bytes = serde_json::to_vec(self).map_err(|_| TileCacheError::Serialization)?;
        Ok(hex_digest(&bytes))
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TileRenderSource {
    None,
    Saved,
    Live,
    SavedAndLive,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TileRenderState {
    Ready,
    Empty,
    Failed,
    Retryable,
    Stale,
}

impl TileRenderState {
    fn is_fresh_success(self) -> bool {
        self == Self::Ready
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
pub struct TileSourceStats {
    pub live_requested_count: u32,
    pub live_received_count: u32,
    pub rendered_chunk_count: u32,
    pub decode_failed_chunk_count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TileCacheMetadata {
    pub schema_version: u16,
    pub key: TileCacheKey,
    pub source: TileRenderSource,
    pub render_state: TileRenderState,
    pub png_sha256: String,
    pub byte_length: u64,
    pub has_terrain: bool,
    pub coverage_ratio: f32,
    pub stats: TileSourceStats,
}

impl TileCacheMetadata {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        key: TileCacheKey,
        source: TileRenderSource,
        render_state: TileRenderState,
        png: Option<&[u8]>,
        has_terrain: bool,
        coverage_ratio: f32,
        stats: TileSourceStats,
    ) -> Result<Self, TileCacheError> {
        if !coverage_ratio.is_finite() || !(0.0..=1.0).contains(&coverage_ratio) {
            return Err(TileCacheError::InvalidCoverage);
        }
        let (png_sha256, byte_length) = match png {
            Some(bytes) => (hex_digest(bytes), bytes.len() as u64),
            None => (String::new(), 0),
        };
        Ok(Self {
            schema_version: TILE_CACHE_SCHEMA_VERSION,
            key,
            source,
            render_state,
            png_sha256,
            byte_length,
            has_terrain,
            coverage_ratio,
            stats,
        })
    }

    fn validate_success(&self, png: &[u8]) -> Result<(), TileCacheError> {
        if self.schema_version != TILE_CACHE_SCHEMA_VERSION
            || !self.render_state.is_fresh_success()
            || self.source == TileRenderSource::None
            || !self.has_terrain
        {
            return Err(TileCacheError::NotFreshSuccess);
        }
        if self.byte_length != png.len() as u64 {
            return Err(TileCacheError::ByteLengthMismatch);
        }
        if self.png_sha256 != hex_digest(png) {
            return Err(TileCacheError::ChecksumMismatch);
        }
        self.validate_common()
    }

    fn validate_common(&self) -> Result<(), TileCacheError> {
        if self.schema_version != TILE_CACHE_SCHEMA_VERSION {
            return Err(TileCacheError::SchemaMismatch);
        }
        if !self.coverage_ratio.is_finite() || !(0.0..=1.0).contains(&self.coverage_ratio) {
            return Err(TileCacheError::InvalidCoverage);
        }
        if self.render_state.is_fresh_success()
            && (self.source == TileRenderSource::None || !self.has_terrain)
        {
            return Err(TileCacheError::NotFreshSuccess);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum CacheCorruption {
    InvalidMetadata,
    SchemaMismatch,
    KeyMismatch,
    MissingPng,
    ByteLengthMismatch,
    ChecksumMismatch,
    NotFreshSuccess,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TileCacheLookup {
    Miss,
    Hit {
        png: Vec<u8>,
        metadata: TileCacheMetadata,
    },
    Unusable {
        metadata: TileCacheMetadata,
    },
    Untrusted,
    Corrupt(CacheCorruption),
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TileCacheError {
    Io,
    Serialization,
    Deserialization,
    InvalidCoverage,
    NotFreshSuccess,
    SchemaMismatch,
    ByteLengthMismatch,
    ChecksumMismatch,
}

impl From<io::Error> for TileCacheError {
    fn from(_: io::Error) -> Self {
        Self::Io
    }
}

pub struct TileCacheStore {
    root: PathBuf,
}

impl TileCacheStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn read(&self, key: &TileCacheKey) -> Result<TileCacheLookup, TileCacheError> {
        let paths = self.paths(key)?;
        let metadata_bytes = match fs::read(&paths.metadata) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        let png_bytes = match fs::read(&paths.png) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };

        match (metadata_bytes, png_bytes) {
            (None, None) => Ok(TileCacheLookup::Miss),
            (None, Some(_)) => Ok(TileCacheLookup::Untrusted),
            (Some(metadata_bytes), png_bytes) => {
                let metadata = match serde_json::from_slice::<TileCacheMetadata>(&metadata_bytes) {
                    Ok(metadata) => metadata,
                    Err(_) => {
                        return Ok(TileCacheLookup::Corrupt(CacheCorruption::InvalidMetadata))
                    }
                };
                if metadata.schema_version != TILE_CACHE_SCHEMA_VERSION {
                    return Ok(TileCacheLookup::Corrupt(CacheCorruption::SchemaMismatch));
                }
                if metadata.key != *key {
                    return Ok(TileCacheLookup::Corrupt(CacheCorruption::KeyMismatch));
                }
                if !metadata.render_state.is_fresh_success() {
                    return Ok(TileCacheLookup::Unusable { metadata });
                }
                let Some(png) = png_bytes else {
                    return Ok(TileCacheLookup::Corrupt(CacheCorruption::MissingPng));
                };
                if !metadata.has_terrain || metadata.source == TileRenderSource::None {
                    return Ok(TileCacheLookup::Corrupt(CacheCorruption::NotFreshSuccess));
                }
                if metadata.byte_length != png.len() as u64 {
                    return Ok(TileCacheLookup::Corrupt(
                        CacheCorruption::ByteLengthMismatch,
                    ));
                }
                if metadata.png_sha256 != hex_digest(&png) {
                    return Ok(TileCacheLookup::Corrupt(CacheCorruption::ChecksumMismatch));
                }
                Ok(TileCacheLookup::Hit { png, metadata })
            }
        }
    }

    pub fn write(
        &self,
        metadata: &TileCacheMetadata,
        png: Option<&[u8]>,
    ) -> Result<(), TileCacheError> {
        metadata.validate_common()?;
        fs::create_dir_all(&self.root)?;
        let paths = self.paths(&metadata.key)?;
        match metadata.render_state {
            TileRenderState::Ready => {
                let png = png.ok_or(TileCacheError::NotFreshSuccess)?;
                metadata.validate_success(png)?;
                atomic_write(&paths.png, png)?;
                atomic_write_json(&paths.metadata, metadata)?;
            }
            TileRenderState::Empty
            | TileRenderState::Failed
            | TileRenderState::Retryable
            | TileRenderState::Stale => {
                if png.is_some() {
                    return Err(TileCacheError::NotFreshSuccess);
                }
                // Keeping the state sidecar makes the failure observable, but
                // the read path will never expose it as a fresh tile hit.
                atomic_write_json(&paths.metadata, metadata)?;
            }
        }
        Ok(())
    }

    fn paths(&self, key: &TileCacheKey) -> Result<CachePaths, TileCacheError> {
        let digest = key.digest()?;
        Ok(CachePaths {
            png: self.root.join(format!("{digest}.png")),
            metadata: self.root.join(format!("{digest}.json")),
        })
    }
}

struct CachePaths {
    png: PathBuf,
    metadata: PathBuf,
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), TileCacheError> {
    atomic_write_with(path, |file| file.write_all(bytes))
}

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), TileCacheError> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| TileCacheError::Serialization)?;
    atomic_write(path, &bytes)
}

fn atomic_write_with<F>(path: &Path, write: F) -> Result<(), TileCacheError>
where
    F: FnOnce(&mut File) -> io::Result<()>,
{
    let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .ok_or(TileCacheError::Io)?
        .to_string_lossy();
    let temporary = path.with_file_name(format!(
        ".{file_name}.part.{}.{}",
        std::process::id(),
        sequence
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        write(&mut file)?;
        file.flush()?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)?;
        Ok::<(), io::Error>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(TileCacheError::from)
}

fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::dynmap::tile::TileCoordinate;

    fn key() -> TileCacheKey {
        TileCacheKey {
            minecraft_version: MinecraftVersionId::new("1.21.4").expect("fixture version"),
            renderer_version: "renderer-test".to_string(),
            asset_sha256: "asset".to_string(),
            world_digest: "world".to_string(),
            chunk_digest: "chunk".to_string(),
            projection: TileProjection::IsoProjected,
            zoom: 8,
            tile: TileCoordinate::new(-2, 3),
        }
    }

    fn stats() -> TileSourceStats {
        TileSourceStats {
            live_requested_count: 4,
            live_received_count: 3,
            rendered_chunk_count: 1,
            decode_failed_chunk_count: 0,
        }
    }

    fn unique_root(label: &str) -> PathBuf {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "mc-vector-map-cache-{label}-{}-{sequence}",
            std::process::id()
        ))
    }

    #[test]
    fn verified_success_round_trips_as_a_fresh_hit() {
        let root = unique_root("hit");
        let store = TileCacheStore::new(&root);
        let png = b"deterministic-png";
        let metadata = TileCacheMetadata::new(
            key(),
            TileRenderSource::SavedAndLive,
            TileRenderState::Ready,
            Some(png),
            true,
            0.75,
            stats(),
        )
        .unwrap();
        store.write(&metadata, Some(png)).unwrap();
        assert!(matches!(
            store.read(&key()).unwrap(),
            TileCacheLookup::Hit { .. }
        ));
        assert!(fs::read_dir(&root).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains(".part.")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn checksum_mismatch_is_not_a_cache_hit() {
        let root = unique_root("checksum");
        let store = TileCacheStore::new(&root);
        let png = b"original";
        let metadata = TileCacheMetadata::new(
            key(),
            TileRenderSource::Saved,
            TileRenderState::Ready,
            Some(png),
            true,
            1.0,
            stats(),
        )
        .unwrap();
        store.write(&metadata, Some(png)).unwrap();
        let paths = store.paths(&key()).unwrap();
        fs::write(paths.png, b"tampered").unwrap();
        assert_eq!(
            store.read(&key()).unwrap(),
            TileCacheLookup::Corrupt(CacheCorruption::ChecksumMismatch)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn metadata_less_png_is_untrusted() {
        let root = unique_root("legacy");
        let store = TileCacheStore::new(&root);
        fs::create_dir_all(&root).unwrap();
        let paths = store.paths(&key()).unwrap();
        fs::write(paths.png, b"legacy-png").unwrap();
        assert_eq!(store.read(&key()).unwrap(), TileCacheLookup::Untrusted);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn empty_and_retryable_states_are_observable_but_not_fresh() {
        let root = unique_root("state");
        let store = TileCacheStore::new(&root);
        for state in [TileRenderState::Empty, TileRenderState::Retryable] {
            let metadata = TileCacheMetadata::new(
                key(),
                TileRenderSource::None,
                state,
                None,
                false,
                0.0,
                stats(),
            )
            .unwrap();
            store.write(&metadata, None).unwrap();
            assert!(matches!(
                store.read(&key()).unwrap(),
                TileCacheLookup::Unusable { metadata: found }
                    if found.render_state == state
            ));
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stale_state_does_not_delete_or_trust_the_old_png() {
        let root = unique_root("stale");
        let store = TileCacheStore::new(&root);
        let png = b"old-valid-png";
        let fresh = TileCacheMetadata::new(
            key(),
            TileRenderSource::Saved,
            TileRenderState::Ready,
            Some(png),
            true,
            0.5,
            stats(),
        )
        .unwrap();
        store.write(&fresh, Some(png)).unwrap();
        let stale = TileCacheMetadata::new(
            key(),
            TileRenderSource::None,
            TileRenderState::Stale,
            None,
            false,
            0.0,
            stats(),
        )
        .unwrap();
        store.write(&stale, None).unwrap();
        assert!(matches!(
            store.read(&key()).unwrap(),
            TileCacheLookup::Unusable { metadata } if metadata.render_state == TileRenderState::Stale
        ));
        fs::remove_dir_all(root).unwrap();
    }
}
