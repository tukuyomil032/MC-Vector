# R43: Enforce renderer failure and consent safety

## Purpose

Make renderer readiness an explicit policy decision instead of a side effect of bridge connectivity, a selected client asset, or a non-empty diagnostic object.

## Scope

- Add structured diagnostics predicates for verified terrain activation.
- Prevent blocked, empty, failed, retryable, cancelled, unavailable, and untrusted states from becoming fresh cache or replacing a valid old layer.
- Require a connected bridge, ready terrain, ready render state, non-empty source, and no unavailable reason before activation.
- Keep raw paths, tokens, HTTP bodies, and internal error text outside the policy contract.

## Deliberate non-goals

- This phase does not add a Map consent store; the rolled-back application has no consent state to restore yet.
- It does not claim a Paper bridge or renderer is connected.
- It does not turn the blocked R40 command into a render command.

## Verification

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
bun run check
git diff --check
```

The phase is complete only when the policy tests prove that bridge connectivity alone cannot activate Map, failed/empty results cannot become fresh cache, and only verified ready terrain can replace the old layer.

## Commit

```text
fix: enforce map renderer failure safety
```
