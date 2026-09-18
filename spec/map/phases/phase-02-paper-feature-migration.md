# Phase 02: Paper Feature Migration

## Goal

Move the MC-Vector Core Gradle project under the Map feature and make every
managed-JAR/smoke path explicit.

## Scope

Move `bridge/mc-vector-core` to `src/map/paper/mc-vector-core` while preserving
the Java package and protocol behavior.

## Owned files

Agent A: `src/map/paper/mc-vector-core/**`; main integrates shared paths.

## Dependencies

Phase 01 layout and Phase 00 Paper contract.

## Implementation tasks

- preserve Gradle wrapper, Java tests, `plugin.yml`, and smoke script;
- update artifact identity and managed component path references;
- ensure `.jar.disabled` remains excluded from Paper loading and PluginBrowser;
- report root workflow/package/README changes for main to apply;
- remove the root `bridge/` only after all references are migrated.

## Focused tests

`./gradlew --no-daemon clean test jar` from the moved project and Java source
inspection for unused declarations.

## Diff review checklist

No package drift, no missing wrapper files, no generated JAR committed, and no
root path silently left behind.

## Phase gate

Moved Gradle build and Paper smoke paths resolve; root bridge deletion is safe.

## Known non-goals

No new snapshot protocol or renderer work.

## Follow-up phases

Phase 03 extracts the Rust backend boundaries.
