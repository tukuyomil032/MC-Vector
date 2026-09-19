# Phase 25: CI, License, and Distribution

## Goal

Make the complete map capability reproducible in CI and legally traceable for
Dynmap-derived code and user-provided Minecraft assets.

## Scope

Frontend, Rust, Java, Paper smoke, golden fixtures, source attribution,
Apache-2.0 notices, asset non-bundling, application release artifacts, and the
versioned `MC-Vector Core` plugin distribution used by production Map enablement.

## Owned files

`.github/workflows`, Gradle wrapper/config, license artifacts, distribution
checks, and CI documentation.

## Dependencies

Phases 13, 18A, 23, and 24.

## Implementation tasks

- run focused checks on pull requests and full gates at declared boundaries;
- keep real Paper workflow manual/nightly with pinned artifact hash;
- verify Java plugin JAR contents and absence of unintended assets;
- extend the existing Release workflow with a dedicated Java 21 Core build that
  uses the application release version and publishes the versioned JAR,
  SHA-256 sidecar, and manifest to the same GitHub Release tag;
- verify the release manifest points to the exact asset and records protocol,
  Paper compatibility, byte length, and source commit;
- verify the production client can resolve the exact matching release asset,
  while development-only local Gradle discovery remains unavailable to the
  production path;
- include Dynmap source ref, NOTICE, Apache license, and porting manifest;
- ensure user Minecraft assets are selected at runtime and not bundled;
- retain logs, golden reports, and failure artifacts without secrets.

## Focused tests

Workflow syntax, wrapper build, Core release asset/manifest inspection, version
agreement, license boundary, golden fixture job, production artifact resolver,
and asset-bundling negative checks.

## Diff review checklist

No path filter omits Map changes; no workflow logs tokens; no generated assets
or user worlds enter distribution artifacts; no production path depends on a
local Gradle output; no release can be created without the versioned Core JAR,
checksum, and manifest.

## Phase gate

The complete local verification matrix is reproducible in CI, every copied or
translated Dynmap source has attribution and a pinned origin, and a release-like
run produces a verified Core JAR that the production resolver can install from
the same GitHub Release as the app.

## Known non-goals

This phase does not push, create a PR, or dispatch remote workflows without
explicit user authorization.

## Follow-up phases

Phase 26 audits block/map coverage; Phase 27 makes the final completion call.
