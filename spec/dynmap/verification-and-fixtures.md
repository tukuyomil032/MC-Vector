# Verification and Fixtures

## Evidence levels

The renderer uses separate evidence levels. A React preview or a pure colour
unit test is not evidence that a Paper world, Anvil file, Rust renderer, and
Tauri IPC path work together.

1. Rust unit tests for coordinate, NBT, model, geometry, and cache logic.
2. Rust integration tests with temporary Anvil/region fixtures.
3. Java unit and MockBukkit tests for queue and Paper event behavior.
4. Real Paper 1.21.10 smoke tests for plugin load, hello, snapshot, and dirty
   events.
5. Golden image tests for the renderer.
6. Real `tauri dev` manual verification for IPC, tile display, and controls.

## World fixtures

The fixture set must contain:

- flat opaque terrain;
- water and coastline;
- forest, leaves, and foliage tint;
- snow, ice, and translucent blocks;
- stairs, slabs, fences, doors, roofs, and other non-cube models;
- height changes and shadows;
- negative X/Z coordinates;
- chunk boundaries crossing a tile;
- an empty generated chunk and a missing chunk;
- a block mutation between two snapshots;
- a custom resource-pack override.

Each fixture records Minecraft version, asset identity, world seed or source,
chunk coordinates, expected state, and the renderer version.

## Golden image comparison

Golden images are compared at the following levels:

- PNG decode succeeds;
- terrain coverage and empty coverage;
- coast and terrain silhouette;
- building shape and partial blocks;
- water, foliage, snow, and transparency;
- light and elevation response;
- perspective and tile-edge continuity;
- dirty update scope;
- player marker overlay separately from terrain.

Exact byte equality is used only where the renderer and asset manifest are
identical. Otherwise the test stores explicit tolerances and a diagnostic
diff image rather than declaring visual parity from one average colour.

## Real Paper smoke test

The smoke test creates a temporary Paper 1.21.10 server, installs the managed
plugin, writes a test bridge configuration, and starts a fixture listener. It
verifies plugin load, hello/capability negotiation, heartbeat, loaded snapshot,
unloaded-chunk refusal, a test block mutation, and clean shutdown. A second run
starts Paper without a listener and verifies that the game server still starts.

## Acceptance gate

The map is not called a Dynmap-like renderer until a fixture with terrain,
water, foliage, snow, and non-cube structures produces a recognizable oblique
image, and the same fixture remains visible after zooming out and a live dirty
update. Empty, asset-missing, stale, and error states must be visible in the
UI and not collapse into a successful green surface.
