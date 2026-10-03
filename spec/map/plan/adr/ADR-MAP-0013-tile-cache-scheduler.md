# ADR-MAP-0013: Tile, cache and scheduler correctness

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Tile identity includes world/dimension, perspective, exact version, renderer version, asset digest, tile coordinate and relevant source/chunk digest. Verified PNG and metadata writes are atomic. Stale, empty, failed, retryable and cancelled results are distinct. Scheduling is bounded, deduplicated and generation-aware.

## Consequences

Zero-source/transparent/error output is never fresh success. Corrupt/legacy unknown cache entries are revalidated, not trusted. A failed target render cannot evict the last verified visible layer. `chunk_dirty` invalidates only affected dependent tiles, and cancellation cannot overwrite newer viewport output.
