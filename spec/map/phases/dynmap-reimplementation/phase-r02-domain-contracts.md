# R02: Dynmap Renderer Domain Contracts

## Goal

Define source-independent Rust data structures that match the information
Dynmap's renderer consumes, before connecting Tauri or Paper.

## Dependencies

R01.

## Owned files

- `src-tauri/src/map/renderer/dynmap/types.rs`
- `src-tauri/src/map/renderer/dynmap/transform.rs`
- `src-tauri/src/map/renderer/dynmap/patch.rs`
- `src-tauri/src/map/world/chunk_view.rs`
- `src-tauri/src/map/assets/model_view.rs`
- focused Rust tests beside these modules

## Contract

The renderer receives a `MapChunkCache`-equivalent view containing block state,
section palette, biome, height, sky light, block light, chunk/world coordinates,
boundary presence, loaded state, and asset resolution state. It must not know
whether the view came from Anvil, Paper, or a fixture.

## Implementation tasks

- define owned, serde-free renderer domain types;
- preserve integer coordinate and fixed-point behavior where Dynmap relies on
  it;
- translate `Matrix3D` and patch geometry without adding product-specific
  zoom behavior;
- define explicit missing/unknown/unloaded states instead of default colors or
  fixed light values;
- add source and fixture references to translated modules.

## Focused checks

- matrix and coordinate round trips;
- patch bounds and face intersection cases;
- chunk boundary coordinate cases;
- rejection of incomplete light/block data;
- `cargo test --manifest-path src-tauri/Cargo.toml --lib map::renderer`.

## Gate

The renderer API can accept an immutable chunk view and model view without
depending on Tauri, Paper, filesystem paths, or frontend types.
