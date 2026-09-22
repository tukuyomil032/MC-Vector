# R39: Bounded scheduler and cancellation

## Purpose

Define the concurrency and viewport-generation rules that keep map rendering
bounded and prevent an old viewport from overwriting a newer one. The core
contract is runtime-agnostic so Tauri adapters can attach async tasks without
moving queue correctness into command handlers.

## Scope

- Configurable maximum in-flight work and total pending work.
- Per-key deduplication for queued and in-flight tile renders.
- Monotonic viewport generations.
- Cancellation of queued and in-flight requests from an obsolete generation.
- Completion acceptance only for requests still owned by the scheduler.
- Deterministic retry backoff with immediate first attempts and exponential
  delays for retries.
- Queue-full and invalid-capacity outcomes.

The scheduler returns request IDs to the application adapter. The adapter owns
the actual task cancellation and renderer invocation; this crate only decides
which results remain eligible for commit.

## Rust destination

- `src-tauri/crates/map-renderer-core/src/scheduler.rs`
- `src-tauri/crates/map-renderer-core/src/cache.rs`

## Input and output contract

Each enqueue operation carries a complete `TileCacheKey` and an attempt number.
Attempt `0` is ready immediately. Retry attempts use a bounded exponential
backoff. A duplicate key in the current generation returns the existing
request ID without creating another render.

`begin_generation` increments the generation, removes obsolete queued and
in-flight work, and returns the request IDs that the runtime should cancel.
Completion of those IDs is classified as `Cancelled`; a completion for a
request no longer known to the scheduler is `Unknown`.

## Failure states

- `QueueFull`: bounded capacity prevents unbounded memory or live snapshot
  pressure.
- `Cancelled`: an obsolete viewport request must not commit a tile.
- `Unknown`: late, duplicate, or externally cancelled completion.
- `InvalidCapacity`: the configured in-flight/pending limits are unsafe.
- `RequestIdExhausted`: monotonic IDs or generations cannot advance.

No failure becomes a successful empty tile. Cache state and redacted UI
diagnostics are handled by R38/R40.

## Tests and fixture boundary

Focused tests cover:

- duplicate suppression and pending-capacity enforcement;
- generation change cancellation and latest-generation acceptance;
- immediate first render versus retry backoff;
- invalid capacity rejection.

No async runtime, Paper socket, filesystem watcher, or Tauri command is
introduced here. Those adapters must use this state machine rather than
reimplementing deduplication in a second layer.

## Gate commands

```bash
bun run check
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## Completion boundary

R39 is complete when bounded scheduling, deduplication, generation
cancellation, and retry timing pass in the renderer core. It does not prove
that the real app cancels OS tasks, limits Paper requests, or connects cache
hits to Tauri events.

## Commit message

```text
feat: add bounded map render scheduler
```
