# R16: Dynmap HD Lighting Pipeline

## Purpose

Separate sky light, block light, face shade, ambient, shadow, and emissive
behavior before the shader and renderer consume final RGBA values.

## Scope

- Keep a fixed 0..15 brightness table as an explicit input.
- Provide Default, LightLevel, and Shadow lighting modes.
- Preserve face shade and alpha behavior across modes.
- Keep emissive material output independent from sampled light.
- Clamp invalid Minecraft light values to the protocol's 0..15 range.

## Evidence and gates

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

Focused tests cover light level zero, shadow mode, face shade, alpha
preservation, and emissive output.

## Explicit non-goals

The exact pinned Dynmap `lightings.txt`/`HDLighting` reference trace and all
night/day/cave/underwater resource profiles remain later reference gates.

## Completion condition

R16 is complete only when lighting modes are explicit and warning-clean. The
current numeric profile is not yet proof of pixel parity with Java Dynmap.

## Commit

```text
feat: port dynmap hd lighting pipeline
```
