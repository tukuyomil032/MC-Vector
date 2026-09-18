use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::tile_key::TileKey;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TileMetadata {
    pub(crate) rendered_chunk_count: usize,
    pub(crate) has_terrain: bool,
    pub(crate) coverage_ratio: f32,
    pub(crate) message: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct CachedTile {
    pub(crate) bytes: Vec<u8>,
    pub(crate) metadata: TileMetadata,
}

#[derive(Debug)]
struct CacheEntry {
    tile: CachedTile,
    last_used: u64,
}

#[derive(Debug)]
pub(crate) struct MemoryTileCache {
    capacity: usize,
    clock: u64,
    entries: HashMap<TileKey, CacheEntry>,
}

impl MemoryTileCache {
    pub(crate) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            clock: 0,
            entries: HashMap::new(),
        }
    }

    pub(crate) fn get(&mut self, key: &TileKey) -> Option<CachedTile> {
        let entry = self.entries.get_mut(key)?;
        self.clock = self.clock.wrapping_add(1);
        entry.last_used = self.clock;
        Some(entry.tile.clone())
    }

    pub(crate) fn insert(&mut self, key: TileKey, tile: CachedTile) {
        self.clock = self.clock.wrapping_add(1);
        self.entries.insert(
            key,
            CacheEntry {
                tile,
                last_used: self.clock,
            },
        );
        while self.entries.len() > self.capacity {
            let Some(oldest) = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            self.entries.remove(&oldest);
        }
    }

    pub(crate) fn remove_where(&mut self, mut predicate: impl FnMut(&TileKey) -> bool) {
        self.entries.retain(|key, _| !predicate(key));
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::map::tiles::tile_key::DEFAULT_PERSPECTIVE;

    fn key(tile_x: i32) -> TileKey {
        TileKey::new(
            "server",
            "overworld",
            "1.21.10",
            "pack",
            "manifest",
            "renderer",
            DEFAULT_PERSPECTIVE,
            8,
            tile_x,
            0,
        )
    }

    #[test]
    fn evicts_the_least_recently_used_tile() {
        let mut cache = MemoryTileCache::new(2);
        cache.insert(
            key(1),
            CachedTile {
                bytes: vec![1],
                metadata: TileMetadata::default(),
            },
        );
        cache.insert(
            key(2),
            CachedTile {
                bytes: vec![2],
                metadata: TileMetadata::default(),
            },
        );
        assert_eq!(cache.get(&key(1)).map(|tile| tile.bytes), Some(vec![1]));
        cache.insert(
            key(3),
            CachedTile {
                bytes: vec![3],
                metadata: TileMetadata::default(),
            },
        );
        assert!(cache.get(&key(2)).is_none());
        assert_eq!(cache.get(&key(1)).map(|tile| tile.bytes), Some(vec![1]));
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn preserves_render_metadata_with_the_cached_png() {
        let mut cache = MemoryTileCache::new(1);
        let metadata = TileMetadata {
            rendered_chunk_count: 12,
            has_terrain: true,
            coverage_ratio: 0.42,
            message: None,
        };
        cache.insert(
            key(0),
            CachedTile {
                bytes: vec![1, 2, 3],
                metadata: metadata.clone(),
            },
        );
        assert_eq!(cache.get(&key(0)).expect("cached tile").metadata, metadata);
    }
}
