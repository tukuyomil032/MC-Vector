use std::cmp::Reverse;
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
    pub(crate) sequence: u64,
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum EnqueueResult {
    Inserted {
        sequence: u64,
        evicted: Option<QueuedTile>,
    },
    Coalesced,
    Full,
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

    pub(crate) fn enqueue(&mut self, key: TileKey, priority: TilePriority) -> EnqueueResult {
        if let Some(existing) = self.pending.get_mut(&key) {
            if priority < existing.priority {
                existing.priority = priority;
            }
            return EnqueueResult::Coalesced;
        }

        let evicted = if self.pending.len() >= self.capacity {
            let Some(candidate) = self
                .pending
                .values()
                .max_by_key(|tile| (tile.priority, Reverse(tile.sequence)))
                .cloned()
            else {
                return EnqueueResult::Full;
            };
            let can_replace_same_priority_viewport =
                priority == TilePriority::Viewport && candidate.priority == TilePriority::Viewport;
            if priority > candidate.priority
                || (priority == candidate.priority && !can_replace_same_priority_viewport)
            {
                return EnqueueResult::Full;
            }
            self.pending.remove(&candidate.key);
            Some(candidate)
        } else {
            None
        };

        self.sequence = self.sequence.wrapping_add(1);
        let sequence = self.sequence;
        self.pending.insert(
            key.clone(),
            QueuedTile {
                key,
                priority,
                sequence,
            },
        );
        EnqueueResult::Inserted { sequence, evicted }
    }

    pub(crate) fn contains(&self, key: &TileKey) -> bool {
        self.pending.contains_key(key)
    }

    pub(crate) fn remove(&mut self, key: &TileKey, sequence: u64) -> bool {
        if self
            .pending
            .get(key)
            .is_some_and(|tile| tile.sequence == sequence)
        {
            self.pending.remove(key).is_some()
        } else {
            false
        }
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
        assert!(matches!(
            queue.enqueue(key(1), TilePriority::Background),
            EnqueueResult::Inserted { .. }
        ));
        assert!(matches!(
            queue.enqueue(key(2), TilePriority::Viewport),
            EnqueueResult::Inserted { .. }
        ));
        assert!(matches!(
            queue.enqueue(key(3), TilePriority::Viewport),
            EnqueueResult::Inserted { .. }
        ));
        assert_eq!(queue.pop().expect("first").key.tile_x, 2);
        assert_eq!(queue.pop().expect("second").key.tile_x, 3);
        assert_eq!(queue.pop().expect("third").key.tile_x, 1);
        assert!(queue.is_empty());
    }

    #[test]
    fn duplicate_requests_coalesce_and_can_be_promoted() {
        let mut queue = TileQueue::new(1);
        assert!(matches!(
            queue.enqueue(key(1), TilePriority::Background),
            EnqueueResult::Inserted { .. }
        ));
        assert_eq!(
            queue.enqueue(key(1), TilePriority::Viewport),
            EnqueueResult::Coalesced
        );
        assert_eq!(queue.len(), 1);
        assert_eq!(
            queue.peek().expect("pending").priority,
            TilePriority::Viewport
        );
        assert_eq!(
            queue.enqueue(key(2), TilePriority::Adjacent),
            EnqueueResult::Full
        );
    }

    #[test]
    fn higher_priority_admission_evicts_the_oldest_lowest_priority_tile() {
        let mut queue = TileQueue::new(2);
        assert!(matches!(
            queue.enqueue(key(1), TilePriority::Background),
            EnqueueResult::Inserted { .. }
        ));
        assert!(matches!(
            queue.enqueue(key(2), TilePriority::Adjacent),
            EnqueueResult::Inserted { .. }
        ));

        let admission = queue.enqueue(key(3), TilePriority::Viewport);
        let EnqueueResult::Inserted { evicted, .. } = admission else {
            panic!("viewport admission should evict background work");
        };
        assert_eq!(evicted.expect("evicted tile").key.tile_x, 1);
        assert_eq!(queue.len(), 2);
        assert!(!queue.contains(&key(1)));
        assert_eq!(queue.pop().expect("viewport").key.tile_x, 3);
        assert_eq!(queue.pop().expect("adjacent").key.tile_x, 2);
    }

    #[test]
    fn same_priority_admission_stays_full() {
        let mut queue = TileQueue::new(1);
        assert!(matches!(
            queue.enqueue(key(1), TilePriority::Adjacent),
            EnqueueResult::Inserted { .. }
        ));
        assert_eq!(
            queue.enqueue(key(2), TilePriority::Adjacent),
            EnqueueResult::Full
        );
    }

    #[test]
    fn newest_viewport_replaces_stale_viewport_work() {
        let mut queue = TileQueue::new(1);
        assert!(matches!(
            queue.enqueue(key(1), TilePriority::Viewport),
            EnqueueResult::Inserted { .. }
        ));

        let admission = queue.enqueue(key(2), TilePriority::Viewport);
        let EnqueueResult::Inserted { evicted, .. } = admission else {
            panic!("new viewport work should replace stale viewport work");
        };
        assert_eq!(evicted.expect("stale viewport").key.tile_x, 1);
        assert_eq!(queue.peek().expect("new viewport").key.tile_x, 2);
    }
}
