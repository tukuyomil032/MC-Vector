# Phase 09: Dynmap Source Porting

## Goal

Bring selected Dynmap renderer source into the feature with traceable origin,
license, and a clear Java-to-Rust translation boundary.

## Scope

Upstream snapshots, license files, source references, porting manifest, and
Rust module skeletons for geometry/assets/shaders.

## Owned files

Main: `spec/dynmap/**` and license review. Agent B: Rust destination skeleton
and SPDX/origin headers. Agent A: bundle isolation review.

## Dependencies

Phase 08 asset model and Phase 00 pinned commit.

## Implementation tasks

- add only selected upstream files under `src/map/dynmap/upstream`;
- preserve original headers and add `LICENSE-APACHE-2.0`, `NOTICE`, `SOURCE-REF`;
- register every source file/symbol in the manifest;
- translate platform-neutral logic into Rust without Bukkit dependencies;
- verify upstream source is not bundled by Vite or the Paper JAR.

## Focused tests

Manifest consistency, SPDX/origin checks, bundle/JAR contents, and source path
review. No claim of renderer parity yet.

## Diff review checklist

Exact commit/path present, no unrelated upstream copy, license artifact present,
and translated code has a fixture assignment.

## Phase gate

The next renderer phase can trace every reused algorithm to source and license.

## Known non-goals

No Dynmap runtime dependency, web server, commands, or API compatibility.

## Follow-up phases

Phase 10 implements projection and geometry.
