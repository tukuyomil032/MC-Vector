# R44: Harden map renderer resource and concurrency limits

## Purpose

Make untrusted Anvil, NBT, ZIP/resource-pack, PNG, model, render, and scheduler input bounded before it can cause excessive allocation, path traversal, zip-bomb expansion, or unbounded work.

## Scope

- Centralize archive, region, chunk, model, texture, raster, voxel, and scheduler budgets.
- Apply the shared budgets to the existing archive, Anvil region, model resolver, texture decoder, perspective renderer, and scheduler boundaries.
- Reject oversized input with typed errors; never convert malformed input into an empty tile or guessed color.
- Keep atomic cache writes and generation cancellation as the state-change safety boundary.

## Verification

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
bun run check
git diff --check
```

The phase is complete only for the listed renderer-core boundaries. It does not claim that every application-level Paper download or server lifecycle path is audited; those remain separate evidence.

## Commit

```text
fix: harden map renderer resource and concurrency limits
```
