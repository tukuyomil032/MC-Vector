# R11: Versioned Minecraft Asset Loading

## Purpose

Establish a trusted asset boundary for client JARs and resource packs. The
renderer must consume verified archive bytes, not arbitrary paths or an
unverified version mix.

## Scope

- Bind an archive to its expected SHA-256 before opening entries.
- Bound archive size, entry count, per-entry size, and total uncompressed size.
- Reject traversal, absolute, backslash, empty, and duplicate entry paths.
- Expose immutable entry bytes to model and texture resolvers.
- Keep missing assets as explicit errors; do not synthesize guessed colours.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover hash-bound archive reads and redacted digest/path failures.

## Explicit non-goals

This phase does not yet resolve blockstate/model inheritance, texture atlas
coordinates, version-specific asset semantics, or complete client-JAR matrix
verification.

## Completion condition

R11 is complete only when archive input is bounded, hash-verified, immutable,
and warning-clean. A valid ZIP alone is not proof of a matching Minecraft
version or renderer asset completeness.

## Commit

```text
feat: add versioned minecraft asset loading
```
