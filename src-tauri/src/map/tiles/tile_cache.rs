use std::collections::HashMap;

use super::tile_key::TileKey;

#[derive(Debug)]
struct CacheEntry {
    bytes: Vec<u8>,
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

    pub(crate) fn get(&mut self, key: &TileKey) -> Option<Vec<u8>> {
        let entry = self.entries.get_mut(key)?;
        self.clock = self.clock.wrapping_add(1);
        entry.last_used = self.clock;
        Some(entry.bytes.clone())
    }

    pub(crate) fn insert(&mut self, key: TileKey, bytes: Vec<u8>) {
        self.clock = self.clock.wrapping_add(1);
        self.entries.insert(
            key,
            CacheEntry {
                bytes,
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
        cache.insert(key(1), vec![1]);
        cache.insert(key(2), vec![2]);
        assert_eq!(cache.get(&key(1)), Some(vec![1]));
        cache.insert(key(3), vec![3]);
        assert!(cache.get(&key(2)).is_none());
        assert_eq!(cache.get(&key(1)), Some(vec![1]));
        assert_eq!(cache.len(), 2);
    }
}
