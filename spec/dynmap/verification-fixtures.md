# Verification Fixtures

## Evidence layers

Keep these claims separate:

1. Rust unit tests for geometry, NBT, assets, queue, and cache.
2. Rust integration tests against checked-in synthetic/real fixture files.
3. Java/MockBukkit tests for plugin scheduling and protocol behavior.
4. Real Paper 1.21.10 smoke evidence.
5. React/Playwright tests for UI state and interactions.
6. Real Tauri `tauri dev` evidence for IPC, filesystem, and app-data paths.
7. Golden-image comparison for renderer quality.

Passing a mock or build does not satisfy a real Paper or real Tauri claim.

## Golden fixture matrix

```text
flat terrain
mountain/high difference
water and lava
forest/biome tint
snow and ice
stairs/slabs/fences/doors
leaves/glass/transparency
building across chunk boundary
negative coordinates
unloaded/empty area
custom resource pack override
```

Each fixture records Minecraft version, source asset hash, renderer version,
camera/perspective, tile key, expected metadata, and a review image. Pixel
comparison uses a documented tolerance; visual review remains necessary for
alpha, seams, and geometry.

## Real Paper scenario

- install the managed JAR into a temporary Paper 1.21.10 server;
- receive protocol v2 hello and heartbeat;
- request a loaded chunk snapshot;
- request an unloaded chunk and verify `not_loaded` without generation;
- mutate a block and verify dirty/live update behavior;
- run without a Rust listener and confirm Paper continues;
- rename to `.jar.disabled` and confirm no hello;
- capture Paper and fixture logs as artifacts.

## Real Tauri scenario

- start `bun run tauri:dev`;
- select a real server and asset source;
- verify spawn/loaded terrain at local and overview zooms;
- pan, zoom, recenter, and observe player/marker layers;
- trigger block change and verify only affected tiles invalidate;
- observe empty, stale, asset-missing, bridge-incompatible, and error states;
- restart and verify disk-cache reuse;
- verify Debug and Production app-data roots are distinct.

## Acceptance rule

The phrase “Dynmap-like” is allowed only after a real non-transparent tile,
model/texture/alpha/tint/lighting coverage, live Paper evidence, cache reuse,
and explicit failure-state UI evidence are all recorded.
