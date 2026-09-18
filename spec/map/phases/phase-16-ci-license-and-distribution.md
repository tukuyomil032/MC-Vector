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

## Diff review checklist

No mutable action where policy requires pinning, no token/asset leakage, and no
workflow path that still points to root `bridge/`.

## Phase gate

The full local matrix passes; Paper workflow is defined and manual/nightly
dispatch remains explicit.

## Known non-goals

No push, PR creation, workflow dispatch, signing, or notarization.

## Follow-up phases

Phase 17 is the final acceptance review.
