# R03: Saved Anvil Source Adapter

## Goal

Decode a real 1.21.10 Anvil fixture into the R02 renderer domain without
losing palette, light, biome, height, or boundary information.

## Dependencies

R02 and the existing Java 1.21.10 format contract.

## Owned files

- `src-tauri/src/map/world/anvil.rs`
- `src-tauri/src/map/world/region.rs`
- `src-tauri/src/map/world/chunk_view.rs`
- `tests/fixtures/anvil/`
- Rust Anvil integration tests

## Implementation tasks

- read region headers and chunk sectors with bounded allocation;
- decode section palettes and block states;
- decode heightmaps, biomes, sky light, and block light;
- preserve missing sections and malformed chunks as typed errors;
- expose neighboring chunks needed at tile boundaries;
- make fixture reads deterministic and independent of the user's app-data path.

## Focused checks

- known chunk coordinate and block palette assertions;
- light/biome/height assertions;
- truncated region and malformed NBT rejection;
- chunk boundary neighbor lookup;
- repeated read returns the same source digest.

## Gate

A real fixture produces a complete renderer chunk view. No renderer fallback,
fixed light value, representative color, or transparent-success result is
allowed.
