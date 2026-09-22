# R38: Verified tile cache and failure states

## Purpose

Make a rendered tile trustworthy only when its PNG and metadata agree. The
cache key binds the tile to the Minecraft version, renderer version, asset
digest, world/chunk inputs, projection, zoom, and tile coordinate. Empty,
failed, retryable, stale, legacy, and corrupted entries remain diagnosable but
never become fresh terrain hits.

## Scope

- Versioned `TileCacheKey` and deterministic SHA-256 cache identity.
- Schema-versioned metadata with source, render state, terrain presence,
  coverage, byte length, PNG digest, and source statistics.
- Atomic PNG and metadata writes through private `.part` files, flush, sync,
  and rename.
- Fresh-hit validation for metadata key, schema, terrain state, byte length,
  and SHA-256.
- Explicit lookup results for miss, verified hit, unusable state, untrusted
  metadata-less PNG, and corruption.
- Safe retention of an old PNG when a stale state is written; the stale
  metadata prevents it from being trusted as a current hit.

This phase does not select saved versus live sources, schedule renders, or
delete cache entries. It provides the verified storage primitive those later
layers must use.

## Rust destination

- `src-tauri/crates/map-renderer-core/src/cache.rs`
- `src-tauri/crates/map-renderer-core/src/renderer/dynmap/tile.rs`

## Input and output contract

`TileCacheStore::write` accepts metadata plus optional PNG bytes. A `Ready`
entry must have a non-`None` source, terrain, byte length, and matching digest.
`Empty`, `Failed`, `Retryable`, and `Stale` entries are metadata-only state
records and cannot be written with a fresh PNG result.

`TileCacheStore::read` returns `Hit` only after all identity and content checks
pass. A PNG without schema-2 metadata is `Untrusted`; checksum, key, schema,
and byte-length failures are `Corrupt`; non-ready metadata is `Unusable`.

## Failure states

- `Miss`: no cache files exist.
- `Untrusted`: a legacy or metadata-less PNG exists.
- `Corrupt`: metadata, key, schema, byte length, or checksum is invalid.
- `Unusable`: the recorded render state is empty, failed, retryable, or stale.
- `Io`/serialization failures remain typed and do not expose filesystem paths
  or raw response bodies.

## Tests and fixture boundary

Focused tests cover:

- verified success round-trip and fresh-hit validation;
- checksum mismatch rejection;
- metadata-less legacy PNG rejection;
- observable empty/retryable states without fresh-hit behavior;
- stale-state retention without trusting the old PNG;
- cleanup of temporary `.part` files after a successful atomic write.

No cache test treats a transparent or zero-source tile as success. Real app
data placement and server-scoped locking are deferred to R39/R40 and the
application lifecycle phases.

## Gate commands

```bash
bun run check
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## Completion boundary

R38 is complete when the core cache rejects unverified or stale bytes and
atomically persists verified success metadata/PNG pairs. It does not prove
bounded scheduling, Tauri integration, filesystem permission behavior in a
real app-data directory, or UI old-layer retention.

## Commit message

```text
feat: add verified map tile cache and failure states
```
