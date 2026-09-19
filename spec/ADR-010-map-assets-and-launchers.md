# ADR-010: Map Assets and Launchers

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Minecraft block appearance is defined by versioned client assets and resource
pack rules, not a small colour table. Launchers do not share one universal
layout: some keep the client JAR under `versions`, while PrismLauncher,
Modrinth, GDLauncher, and ATLauncher commonly use shared runtime libraries and
an instance-specific game directory.

## Decision

Resolve explicit or auto-detected user-owned client JAR/resource-pack sources
through launcher-specific adapters, record the launcher metadata that produced
the path, version/hash/pack order, and parse blockstates/models/textures in
Rust. PrismLauncher must pair `mmc-pack.json` with the shared
`libraries/com/mojang/minecraft/<version>/minecraft-<version>-client.jar`.
Modrinth, CurseForge, GDLauncher Carbon, ATLauncher, MultiMC, the official
launcher, custom roots, and manual paths each require their own runtime-layout
resolution rules. Do not bundle Minecraft assets by default.

An asset is `usable` only after archive validation, version resolution, and
non-zero blockstate/model/texture parsing have succeeded. A stored path is
only `selected`, never `usable`, until the renderer has been given the same
manifest identity.

## Consequences

Missing/mismatched assets are explicit quality states. Cache identity changes
when asset identity changes. Distribution requires a separate asset/license
review. The adapter evidence and fixture matrix are maintained in
`spec/dynmap/launcher-asset-sources.md` and the Phase 07–12 documents.
