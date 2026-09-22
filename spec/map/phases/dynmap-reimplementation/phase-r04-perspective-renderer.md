# R04: Dynmap Perspective Renderer

## Goal

Translate the Dynmap perspective renderer into Rust and produce one real,
non-transparent terrain PNG from the R03 saved source.

## Dependencies

R01, R02, and R03.

## Owned files

- `src-tauri/src/map/renderer/dynmap/hd_perspective.rs`
- `src-tauri/src/map/renderer/dynmap/iso_hd_perspective.rs`
- `src-tauri/src/map/renderer/dynmap/model.rs`
- `src-tauri/src/map/renderer/dynmap/texture.rs`
- `src-tauri/src/map/renderer/dynmap/shader.rs`
- `src-tauri/src/map/renderer/dynmap/lighting.rs`
- `src-tauri/src/map/renderer/png.rs`

## Implementation tasks

- preserve Dynmap ray traversal and projected coordinate order;
- translate patch/model/face intersection and face orientation;
- resolve blockstate/model inheritance and texture UVs;
- apply texture rotation, transparency, biome tint, shade, ambient, sky light,
  and block light;
- rasterize with explicit alpha semantics and stable PNG encoding;
- reject missing model/texture/light inputs with typed renderer errors;
- do not add zoom-band-specific simplified renderers.

## Focused checks

- flat, cliff, transparent, rotated-model, and tinted block fixtures;
- non-zero alpha assertion;
- deterministic PNG hash;
- pixel-level projection and UV assertions;
- chunk boundary render with neighboring data.

## Gate

The same saved fixture renders recognizable terrain through the Rust Dynmap
translation, with deterministic output and no transparent-success path.
