use std::collections::HashMap;

use super::tile_key::TileKey;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(crate) enum TilePriority {
    Viewport = 0,
    Adjacent = 1,
    Player = 2,
    Background = 3,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct QueuedTile {
    pub(crate) key: TileKey,
    pub(crate) priority: TilePriority,
    sequence: u64,
}

#[derive(Debug)]
pub(crate) struct TileQueue {
    capacity: usize,
    sequence: u64,
    pending: HashMap<TileKey, QueuedTile>,
}

impl TileQueue {
    pub(crate) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            sequence: 0,
            pending: HashMap::new(),
        }
    }

    pub(crate) fn enqueue(&mut self, key: TileKey, priority: TilePriority) -> bool {
        if let Some(existing) = self.pending.get_mut(&key) {
            if priority < existing.priority {
                existing.priority = priority;
            }
            return true;
        }
        if self.pending.len() >= self.capacity {
            return false;
        }
        self.sequence = self.sequence.wrapping_add(1);
        self.pending.insert(
            key.clone(),
            QueuedTile {
                key,
                priority,
                sequence: self.sequence,
            },
        );
        true
    }

    pub(crate) fn contains(&self, key: &TileKey) -> bool {
        self.pending.contains_key(key)
    }

    pub(crate) fn remove(&mut self, key: &TileKey) -> bool {
        self.pending.remove(key).is_some()
    }

    pub(crate) fn pop(&mut self) -> Option<QueuedTile> {
        let key = self
            .pending
            .values()
            .min_by_key(|tile| (tile.priority, tile.sequence))
            .map(|tile| tile.key.clone())?;
        self.pending.remove(&key)
    }

    pub(crate) fn peek(&self) -> Option<&QueuedTile> {
        self.pending
            .values()
            .min_by_key(|tile| (tile.priority, tile.sequence))
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.pending.len()
    }

    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.pending.is_empty()
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
    fn viewport_work_wins_over_background_and_fifo_is_stable() {
        let mut queue = TileQueue::new(3);
        assert!(queue.enqueue(key(1), TilePriority::Background));
        assert!(queue.enqueue(key(2), TilePriority::Viewport));
        assert!(queue.enqueue(key(3), TilePriority::Viewport));
        assert_eq!(queue.pop().expect("first").key.tile_x, 2);
        assert_eq!(queue.pop().expect("second").key.tile_x, 3);
        assert_eq!(queue.pop().expect("third").key.tile_x, 1);
        assert!(queue.is_empty());
    }

    #[test]
    fn duplicate_requests_coalesce_and_can_be_promoted() {
        let mut queue = TileQueue::new(1);
        assert!(queue.enqueue(key(1), TilePriority::Background));
        assert!(queue.enqueue(key(1), TilePriority::Viewport));
        assert_eq!(queue.len(), 1);
        assert_eq!(
            queue.peek().expect("pending").priority,
            TilePriority::Viewport
        );
        assert!(!queue.enqueue(key(2), TilePriority::Viewport));
    }
}
