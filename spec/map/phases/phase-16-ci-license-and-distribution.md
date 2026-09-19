# Phase 16: CI, License, and Distribution

## Goal

Make Map feature changes reproducible in CI and ensure derived source/assets
have a reviewable distribution boundary.

## Scope

Path filters, Java 21/Gradle wrapper, Rust/frontend checks, Paper manual/nightly
workflow, artifacts, notices, source attribution, and asset non-bundling.

## Owned files

Main integrates `.github/workflows/**`, package scripts, Gradle paths, and
license/distribution files. Agents provide focused changes and tests.

## Dependencies

Phase 15 evidence and all previous implementation gates.

## Implementation tasks

- validate TypeScript, frontend tests/build, Rust fmt/test, Java test/JAR;
- add Paper workflow with pinned version/SHA and redacted artifacts;
- verify plugin.yml and entrypoint in the JAR;
- include Dynmap Apache/NOTICE/source records where derived code ships;
- ensure generated JARs, caches, Paper worlds, and Minecraft assets are excluded.

## Focused tests

The full command matrix from the plan plus workflow-action/path checks and JAR
content checks.

## Local evidence

The local Phase 16 gate was run on 2026-09-18. The frontend matrix completed
with 47 files and 423 tests passing, the Rust matrix completed with 201 tests
passing and one intentionally ignored test, and the Paper plugin completed
`clean test jar` successfully. Rust formatting also passed.

```text
bun run check
bun run test
bun run typecheck:tests
bun run build
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cd src/map/paper/mc-vector-core && ./gradlew --no-daemon clean test jar

bun run check:workflow-actions
```

The workflow-action check and the distribution-boundary shell checks pass.
The CI workflow verifies the Dynmap Apache/NOTICE/source records, rejects a
reintroduced root `bridge/`, and rejects Dynmap or Minecraft asset paths in
the Paper plugin JAR. Remote CI has not been dispatched from this checkout.

## Diff review checklist

No mutable action where policy requires pinning, no token/asset leakage, and no
workflow path that still points to root `bridge/`.

## Phase gate

The full local matrix passes and the Paper workflow is defined. Manual/nightly
dispatch remains explicit and is intentionally not invoked from this checkout.

## Known non-goals

No push, PR creation, workflow dispatch, signing, or notarization.

## Follow-up phases

Phase 17 starts the tile-system work. Final acceptance is Phase 27 after the
dimension, overlay, UI, real-environment, golden-fixture, and coverage gates.
