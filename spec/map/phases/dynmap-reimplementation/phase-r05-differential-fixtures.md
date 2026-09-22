# R05: Differential Fixtures and Golden Evidence

## Goal

Prove the Rust renderer against fixed Dynmap reference behavior instead of
accepting self-generated expected images.

## Dependencies

R04.

## Owned files

- `tests/fixtures/dynmap/`
- `scripts/run-dynmap-differential.mjs`
- Rust renderer golden tests
- `spec/dynmap/verification-fixtures.md`

## Fixture matrix

Flat terrain, mountain/cliff, water, forest/leaves, snow, stairs, slabs,
fences, doors, glass, chunk boundary, missing texture, malformed chunk,
unloaded chunk, and custom resource-pack overrides.

## Implementation tasks

- store fixture inputs and expected metadata outside generated build output;
- record Dynmap reference output and renderer revision;
- compare ray hits, face IDs, UVs, shade/light values, alpha, and pixels;
- report mismatch location and source symbol without leaking absolute paths;
- reject tests that regenerate their own expected output during execution.

## Focused checks

```bash
bun scripts/run-dynmap-differential.mjs
cargo test --manifest-path src-tauri/Cargo.toml --lib dynmap_fixture
```

## Gate

All required fixture classes pass within their documented pixel tolerance, and
every known unsupported block/model is explicitly listed rather than silently
rendered with a guessed color.
