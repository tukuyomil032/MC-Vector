# R10: Dynmap Voxel Traversal and Block Visibility

## Purpose

Make voxel traversal a separately testable renderer operation. The ray must
visit half-open chunk blocks in deterministic order, bound its work, and pass
the correct interval to patch intersection.

## Scope

- Use the Dynmap-derived ray-box entry/exit contract.
- Traverse X/Y/Z voxel boundaries with DDA-style stepping.
- Preserve negative-direction and zero-direction behavior.
- Record each visited block and its entry/exit distances.
- Bound traversal so malformed geometry cannot produce an infinite loop.
- Keep missing block/model/light data as explicit renderer errors.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

The focused traversal test verifies ordered crossing of adjacent blocks and
non-overlapping visit intervals. Existing renderer tests keep missing model,
texture, block, and light data explicit.

## Explicit non-goals

This phase does not claim neighboring-chunk source aggregation, transparent
multi-layer compositing, all built-in renderers, Java trace parity, or final
pixel parity.

## Completion condition

R10 is complete only when traversal is deterministic, bounded, and connected to
the patch interval checks under the warning/test gates.

## Commit

```text
feat: port dynmap voxel traversal and hit selection
```
