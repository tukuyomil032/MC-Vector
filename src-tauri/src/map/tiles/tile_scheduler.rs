use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

use super::tile_key::TileKey;
use super::tile_queue::{TilePriority, TileQueue};

struct SchedulerState {
    queue: TileQueue,
    active: usize,
}

struct PendingRequestGuard {
    scheduler: Arc<TileScheduler>,
    key: Option<TileKey>,
}

impl PendingRequestGuard {
    fn new(scheduler: Arc<TileScheduler>, key: TileKey) -> Self {
        Self {
            scheduler,
            key: Some(key),
        }
    }

    fn disarm(&mut self) {
        self.key = None;
    }
}

impl Drop for PendingRequestGuard {
    fn drop(&mut self) {
        if let Some(key) = self.key.take() {
            self.scheduler.remove_pending(&key);
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
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "Map tile scheduler is poisoned".to_string())?;
            if state.queue.contains(&key) {
                return Err("Map tile render request is already scheduled".to_string());
            }
            if !state.queue.enqueue(key.clone(), priority) {
                return Err("Map tile render queue is full".to_string());
            }
        }

        let mut pending_guard = PendingRequestGuard::new(Arc::clone(self), key.clone());

        loop {
            let notified = self.notify.notified();
            let ready = {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| "Map tile scheduler is poisoned".to_string())?;
                let is_next = state.queue.peek().is_some_and(|tile| tile.key == key);
                if is_next && state.active < self.max_workers {
                    state.queue.pop();
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

    fn remove_pending(&self, key: &TileKey) {
        if let Ok(mut state) = self.state.lock() {
            state.queue.remove(key);
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
}
