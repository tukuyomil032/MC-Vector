# Phase 25: CI, License, and Distribution

## Goal

Make the complete map capability reproducible in CI and legally traceable for
Dynmap-derived code and user-provided Minecraft assets.

## Scope

Frontend, Rust, Java, Paper smoke, golden fixtures, source attribution,
Apache-2.0 notices, asset non-bundling, and workflow artifacts.

## Owned files

`.github/workflows`, Gradle wrapper/config, license artifacts, distribution
checks, and CI documentation.

## Dependencies

Phases 13, 23, and 24.

## Implementation tasks

- run focused checks on pull requests and full gates at declared boundaries;
- keep real Paper workflow manual/nightly with pinned artifact hash;
- verify Java plugin JAR contents and absence of unintended assets;
- include Dynmap source ref, NOTICE, Apache license, and porting manifest;
- ensure user Minecraft assets are selected at runtime and not bundled;
- retain logs, golden reports, and failure artifacts without secrets.

## Focused tests

Workflow syntax, wrapper build, JAR inspection, license boundary, golden
fixture job, and asset-bundling negative checks.

## Diff review checklist

No path filter omits Map changes; no workflow logs tokens; no generated assets
or user worlds enter distribution artifacts.

## Phase gate

The complete local verification matrix is reproducible in CI, and every copied
or translated Dynmap source has attribution and a pinned origin.

## Known non-goals

This phase does not push, create a PR, or dispatch remote workflows without
explicit user authorization.

## Follow-up phases

Phase 26 audits block/map coverage; Phase 27 makes the final completion call.
