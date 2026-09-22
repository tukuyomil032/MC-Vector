//! Bounded, generation-aware tile render scheduling.
//!
//! This module is deliberately runtime-agnostic.  It owns deduplication,
//! capacity, retry timing, and result acceptance; an application adapter owns
//! the actual async task and can cancel the request IDs returned by
//! `begin_generation`.

use std::collections::{BTreeMap, VecDeque};

use crate::cache::TileCacheKey;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct RenderRequestId(pub u64);

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd)]
pub struct ViewportGeneration(pub u64);

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct RetryBackoff {
    pub base_ticks: u64,
    pub max_ticks: u64,
}

impl RetryBackoff {
    pub const fn new(base_ticks: u64, max_ticks: u64) -> Self {
        Self {
            base_ticks,
            max_ticks,
        }
    }

    pub fn delay(self, attempt: u32) -> u64 {
        if attempt == 0 || self.base_ticks == 0 || self.max_ticks == 0 {
            return 0;
        }
        let shift = (attempt - 1).min(63);
        self.base_ticks
            .checked_shl(shift)
            .unwrap_or(u64::MAX)
            .min(self.max_ticks)
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct RenderJob {
    pub request_id: RenderRequestId,
    pub generation: ViewportGeneration,
    pub key: TileCacheKey,
    pub attempt: u32,
    pub ready_at_tick: u64,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum EnqueueDecision {
    Enqueued(RenderRequestId),
    Deduplicated(RenderRequestId),
    QueueFull,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum CompletionDecision {
    Accepted,
    Cancelled,
    Unknown,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum SchedulerError {
    InvalidCapacity,
    RequestIdExhausted,
}

#[derive(Debug)]
pub struct RenderScheduler {
    max_in_flight: usize,
    max_pending: usize,
    retry_backoff: RetryBackoff,
    generation: ViewportGeneration,
    next_request_id: u64,
    current_tick: u64,
    queued: VecDeque<RenderJob>,
    in_flight: BTreeMap<RenderRequestId, RenderJob>,
    cancelled: BTreeMap<RenderRequestId, ()>,
}

impl RenderScheduler {
    pub fn new(
        max_in_flight: usize,
        max_pending: usize,
        retry_backoff: RetryBackoff,
    ) -> Result<Self, SchedulerError> {
        if crate::security::validate_scheduler_capacity(max_in_flight, max_pending).is_err() {
            return Err(SchedulerError::InvalidCapacity);
        }
        Ok(Self {
            max_in_flight,
            max_pending,
            retry_backoff,
            generation: ViewportGeneration(0),
            next_request_id: 0,
            current_tick: 0,
            queued: VecDeque::new(),
            in_flight: BTreeMap::new(),
            cancelled: BTreeMap::new(),
        })
    }

    pub const fn generation(&self) -> ViewportGeneration {
        self.generation
    }

    pub const fn current_tick(&self) -> u64 {
        self.current_tick
    }

    pub fn advance_ticks(&mut self, ticks: u64) {
        self.current_tick = self.current_tick.saturating_add(ticks);
    }

    pub fn begin_generation(
        &mut self,
    ) -> Result<(ViewportGeneration, Vec<RenderRequestId>), SchedulerError> {
        self.generation = ViewportGeneration(
            self.generation
                .0
                .checked_add(1)
                .ok_or(SchedulerError::RequestIdExhausted)?,
        );
        self.queued.retain(|job| job.generation == self.generation);
        let cancelled = self
            .in_flight
            .iter()
            .filter_map(|(request_id, job)| {
                (job.generation != self.generation).then_some(*request_id)
            })
            .collect::<Vec<_>>();
        for request_id in &cancelled {
            self.in_flight.remove(request_id);
            self.cancelled.insert(*request_id, ());
        }
        Ok((self.generation, cancelled))
    }

    pub fn enqueue(&mut self, key: TileCacheKey, attempt: u32) -> EnqueueDecision {
        if let Some(job) = self
            .queued
            .iter()
            .chain(self.in_flight.values())
            .find(|job| job.generation == self.generation && job.key == key)
        {
            return EnqueueDecision::Deduplicated(job.request_id);
        }
        if self.pending_count() >= self.max_pending {
            return EnqueueDecision::QueueFull;
        }
        let Some(request_id_value) = self.next_request_id.checked_add(1) else {
            return EnqueueDecision::QueueFull;
        };
        self.next_request_id = request_id_value;
        let request_id = RenderRequestId(request_id_value);
        let ready_at_tick = self
            .current_tick
            .saturating_add(self.retry_backoff.delay(attempt));
        self.queued.push_back(RenderJob {
            request_id,
            generation: self.generation,
            key,
            attempt,
            ready_at_tick,
        });
        EnqueueDecision::Enqueued(request_id)
    }

    pub fn poll_next(&mut self) -> Option<RenderJob> {
        if self.in_flight.len() >= self.max_in_flight {
            return None;
        }
        let index = self
            .queued
            .iter()
            .position(|job| job.ready_at_tick <= self.current_tick)?;
        let job = self.queued.remove(index)?;
        self.in_flight.insert(job.request_id, job.clone());
        Some(job)
    }

    pub fn complete(&mut self, request_id: RenderRequestId) -> CompletionDecision {
        if self.in_flight.remove(&request_id).is_some() {
            CompletionDecision::Accepted
        } else if self.cancelled.remove(&request_id).is_some() {
            CompletionDecision::Cancelled
        } else {
            CompletionDecision::Unknown
        }
    }

    pub fn pending_count(&self) -> usize {
        self.queued.len() + self.in_flight.len()
    }

    pub fn queued_count(&self) -> usize {
        self.queued.len()
    }

    pub fn in_flight_count(&self) -> usize {
        self.in_flight.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::TileCacheKey;
    use crate::domain::MinecraftVersionId;
    use crate::renderer::dynmap::tile::{TileCoordinate, TileProjection};

    fn key(tile_x: i64) -> TileCacheKey {
        TileCacheKey {
            minecraft_version: MinecraftVersionId::new("1.21.4").expect("fixture version"),
            renderer_version: "scheduler-test".to_owned(),
            asset_sha256: "asset".to_owned(),
            world_digest: "world".to_owned(),
            chunk_digest: "chunk".to_owned(),
            projection: TileProjection::WorldXZ,
            zoom: 8,
            tile: TileCoordinate::new(tile_x, 0),
        }
    }

    fn scheduler() -> RenderScheduler {
        RenderScheduler::new(1, 2, RetryBackoff::new(2, 8)).expect("valid scheduler")
    }

    #[test]
    fn deduplicates_tiles_and_enforces_pending_capacity() {
        let mut scheduler = scheduler();
        let first = scheduler.enqueue(key(0), 0);
        let first_id = match first {
            EnqueueDecision::Enqueued(request_id) => request_id,
            other => panic!("unexpected decision: {other:?}"),
        };
        assert_eq!(
            scheduler.enqueue(key(0), 0),
            EnqueueDecision::Deduplicated(first_id)
        );
        assert!(matches!(
            scheduler.enqueue(key(1), 0),
            EnqueueDecision::Enqueued(_)
        ));
        assert_eq!(scheduler.enqueue(key(2), 0), EnqueueDecision::QueueFull);
        let job = scheduler.poll_next().expect("first job is ready");
        assert_eq!(job.request_id, first_id);
        assert_eq!(scheduler.in_flight_count(), 1);
        assert!(scheduler.poll_next().is_none());
        assert_eq!(scheduler.complete(first_id), CompletionDecision::Accepted);
        assert!(scheduler.poll_next().is_some());
    }

    #[test]
    fn generation_change_cancels_old_work_and_accepts_only_new_work() {
        let mut scheduler = scheduler();
        let old_id = match scheduler.enqueue(key(0), 0) {
            EnqueueDecision::Enqueued(request_id) => request_id,
            other => panic!("unexpected decision: {other:?}"),
        };
        scheduler.poll_next().expect("old job starts");
        let (generation, cancelled) = scheduler.begin_generation().unwrap();
        assert_eq!(generation, ViewportGeneration(1));
        assert_eq!(cancelled, vec![old_id]);
        assert_eq!(scheduler.complete(old_id), CompletionDecision::Cancelled);
        let new_id = match scheduler.enqueue(key(1), 0) {
            EnqueueDecision::Enqueued(request_id) => request_id,
            other => panic!("unexpected decision: {other:?}"),
        };
        assert_eq!(scheduler.poll_next().unwrap().request_id, new_id);
        assert_eq!(scheduler.complete(new_id), CompletionDecision::Accepted);
    }

    #[test]
    fn retry_backoff_delays_only_the_retrying_job() {
        let mut scheduler = scheduler();
        assert!(matches!(
            scheduler.enqueue(key(0), 1),
            EnqueueDecision::Enqueued(_)
        ));
        assert!(scheduler.poll_next().is_none());
        scheduler.advance_ticks(1);
        assert!(scheduler.poll_next().is_none());
        scheduler.advance_ticks(1);
        assert!(scheduler.poll_next().is_some());
        assert_eq!(RetryBackoff::new(2, 8).delay(0), 0);
        assert_eq!(RetryBackoff::new(2, 8).delay(1), 2);
        assert_eq!(RetryBackoff::new(2, 8).delay(3), 8);
    }

    #[test]
    fn invalid_capacity_is_rejected() {
        assert_eq!(
            RenderScheduler::new(0, 1, RetryBackoff::new(1, 1)).unwrap_err(),
            SchedulerError::InvalidCapacity
        );
        assert_eq!(
            RenderScheduler::new(2, 1, RetryBackoff::new(1, 1)).unwrap_err(),
            SchedulerError::InvalidCapacity
        );
    }
}
