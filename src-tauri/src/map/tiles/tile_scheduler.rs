use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

use super::tile_key::TileKey;
use super::tile_queue::{EnqueueResult, TilePriority, TileQueue};

struct SchedulerState {
    queue: TileQueue,
    active: usize,
    cancelled: HashSet<(TileKey, u64)>,
}

struct PendingRequestGuard {
    scheduler: Arc<TileScheduler>,
    key: Option<TileKey>,
    sequence: u64,
}

impl PendingRequestGuard {
    fn new(scheduler: Arc<TileScheduler>, key: TileKey, sequence: u64) -> Self {
        Self {
            scheduler,
            key: Some(key),
            sequence,
        }
    }

    fn disarm(&mut self) {
        self.key = None;
    }
}

impl Drop for PendingRequestGuard {
    fn drop(&mut self) {
        if let Some(key) = self.key.take() {
            self.scheduler.remove_pending(&key, self.sequence);
        }
    }
}

pub(crate) struct TileScheduler {
    state: Mutex<SchedulerState>,
    notify: Notify,
    max_workers: usize,
}

impl TileScheduler {
    pub(crate) fn new(capacity: usize, max_workers: usize) -> Self {
        Self {
            state: Mutex::new(SchedulerState {
                queue: TileQueue::new(capacity),
                active: 0,
                cancelled: HashSet::new(),
            }),
            notify: Notify::new(),
            max_workers: max_workers.max(1),
        }
    }

    pub(crate) async fn acquire(
        self: &Arc<Self>,
        key: TileKey,
        priority: TilePriority,
    ) -> Result<SchedulerPermit, String> {
        let sequence = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "Map tile scheduler is poisoned".to_string())?;
            if state.queue.contains(&key) {
                return Err("Map tile render request is already scheduled".to_string());
            }
            match state.queue.enqueue(key.clone(), priority) {
                EnqueueResult::Inserted { sequence, evicted } => {
                    if let Some(tile) = evicted {
                        state.cancelled.insert((tile.key, tile.sequence));
                    }
                    sequence
                }
                EnqueueResult::Coalesced => {
                    return Err("Map tile render request is already scheduled".to_string());
                }
                EnqueueResult::Full => {
                    return Err("Map tile render queue is full".to_string());
                }
            }
        };
        self.notify.notify_waiters();

        let mut pending_guard = PendingRequestGuard::new(Arc::clone(self), key.clone(), sequence);

        loop {
            let notified = self.notify.notified();
            let ready = {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| "Map tile scheduler is poisoned".to_string())?;
                if state.cancelled.remove(&(key.clone(), sequence)) {
                    return Err(
                        "Map tile render request was evicted by a higher-priority request"
                            .to_string(),
                    );
                }
                let is_next = state
                    .queue
                    .peek()
                    .is_some_and(|tile| tile.key == key && tile.sequence == sequence);
                if is_next && state.active < self.max_workers {
                    let _ = state.queue.pop();
                    state.active += 1;
                    true
                } else {
                    false
                }
            };
            if ready {
                pending_guard.disarm();
                return Ok(SchedulerPermit {
                    scheduler: Arc::clone(self),
                });
            }
            notified.await;
        }
    }

    fn remove_pending(&self, key: &TileKey, sequence: u64) {
        if let Ok(mut state) = self.state.lock() {
            state.queue.remove(key, sequence);
            state.cancelled.remove(&(key.clone(), sequence));
        }
        self.notify.notify_waiters();
    }

    fn release(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.active = state.active.saturating_sub(1);
        }
        self.notify.notify_waiters();
    }
}

pub(crate) struct SchedulerPermit {
    scheduler: Arc<TileScheduler>,
}

impl Drop for SchedulerPermit {
    fn drop(&mut self) {
        self.scheduler.release();
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

    #[tokio::test]
    async fn scheduler_releases_a_bounded_worker_in_priority_order() {
        let scheduler = Arc::new(TileScheduler::new(4, 1));
        let first = scheduler
            .acquire(key(1), TilePriority::Background)
            .await
            .expect("first permit");
        let scheduler_for_waiter = Arc::clone(&scheduler);
        let waiting = tokio::spawn(async move {
            scheduler_for_waiter
                .acquire(key(2), TilePriority::Viewport)
                .await
                .expect("second permit")
        });
        tokio::task::yield_now().await;
        drop(first);
        let second = waiting.await.expect("waiter should finish");
        drop(second);
    }

    #[tokio::test]
    async fn cancelled_waiter_is_removed_from_the_bounded_queue() {
        let scheduler = Arc::new(TileScheduler::new(1, 1));
        let first = scheduler
            .acquire(key(1), TilePriority::Viewport)
            .await
            .expect("first permit");
        let scheduler_for_waiter = Arc::clone(&scheduler);
        let waiting = tokio::spawn(async move {
            scheduler_for_waiter
                .acquire(key(2), TilePriority::Background)
                .await
        });
        tokio::task::yield_now().await;
        waiting.abort();
        let _ = waiting.await;
        drop(first);
        let replacement = scheduler
            .acquire(key(3), TilePriority::Viewport)
            .await
            .expect("replacement request should fit after cancellation");
        drop(replacement);
    }

    #[tokio::test]
    async fn viewport_admission_evicts_and_wakes_a_lower_priority_waiter() {
        let scheduler = Arc::new(TileScheduler::new(1, 1));
        let first = scheduler
            .acquire(key(1), TilePriority::Viewport)
            .await
            .expect("first permit");
        let scheduler_for_background = Arc::clone(&scheduler);
        let background = tokio::spawn(async move {
            scheduler_for_background
                .acquire(key(2), TilePriority::Background)
                .await
        });
        tokio::task::yield_now().await;

        let scheduler_for_viewport = Arc::clone(&scheduler);
        let viewport = tokio::spawn(async move {
            scheduler_for_viewport
                .acquire(key(3), TilePriority::Viewport)
                .await
        });
        let background_result = tokio::time::timeout(std::time::Duration::from_secs(1), background)
            .await
            .expect("evicted waiter should wake")
            .expect("background task should not panic");
        let background_error = match background_result {
            Ok(_) => panic!("evicted request must not acquire a permit"),
            Err(error) => error,
        };
        assert!(background_error.contains("evicted"));

        drop(first);
        let viewport_permit = viewport
            .await
            .expect("viewport task should not panic")
            .expect("viewport request should acquire after worker release");
        drop(viewport_permit);
    }

    #[tokio::test]
    async fn same_priority_request_still_reports_queue_full() {
        let scheduler = Arc::new(TileScheduler::new(1, 1));
        let first = scheduler
            .acquire(key(1), TilePriority::Viewport)
            .await
            .expect("first permit");
        let scheduler_for_waiter = Arc::clone(&scheduler);
        let waiting = tokio::spawn(async move {
            scheduler_for_waiter
                .acquire(key(2), TilePriority::Adjacent)
                .await
        });
        tokio::task::yield_now().await;

        let result = scheduler.acquire(key(3), TilePriority::Adjacent).await;
        let error = match result {
            Ok(_) => panic!("same-priority queue should stay full"),
            Err(error) => error,
        };
        assert_eq!(error, "Map tile render queue is full");
        waiting.abort();
        let _ = waiting.await;
        drop(first);
    }

    #[tokio::test]
    async fn duplicate_request_is_rejected_without_consuming_capacity() {
        let scheduler = Arc::new(TileScheduler::new(1, 1));
        let first = scheduler
            .acquire(key(1), TilePriority::Viewport)
            .await
            .expect("first permit");
        let scheduler_for_waiter = Arc::clone(&scheduler);
        let waiting = tokio::spawn(async move {
            scheduler_for_waiter
                .acquire(key(2), TilePriority::Background)
                .await
        });
        tokio::task::yield_now().await;

        let duplicate = scheduler.acquire(key(2), TilePriority::Viewport).await;
        let error = match duplicate {
            Ok(_) => panic!("duplicate queued request should be rejected"),
            Err(error) => error,
        };
        assert_eq!(error, "Map tile render request is already scheduled");
        waiting.abort();
        let _ = waiting.await;
        drop(first);
    }
}
