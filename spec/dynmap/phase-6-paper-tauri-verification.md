# Phase 6: Real Paper, Tauri, and Visual Verification

## Goal

Prove the complete path using a real Paper server, Rust bridge, Tauri app, and
fixed Minecraft fixtures. Unit and MockBukkit success alone is insufficient.

## Real Paper smoke test

`bridge/mc-vector-core/scripts/paper-bridge-smoke.mjs` creates a temporary
Paper 1.21.10 server and:

1. writes a test EULA;
2. installs `mc-vector-core.jar`;
3. writes a managed bridge configuration;
4. starts a loopback fixture listener;
5. starts Paper with Java 21;
6. waits for `Done` and plugin enablement;
7. validates hello, protocol, server ID, capabilities, and heartbeat;
8. requests a loaded chunk snapshot;
9. requests an unloaded chunk and expects `not_loaded`;
10. performs a fixture block mutation and checks the subsequent snapshot;
11. stops Paper and verifies clean process exit;
12. repeats startup without a listener;
13. repeats with `.jar.disabled` and confirms no hello arrives.

Paper downloads are restricted to the official distribution and pinned by
version and SHA-256 in the script or fixture manifest.

## Tauri manual scenario

With `tauri dev`:

- select a server with Map enabled;
- confirm bridge and component status;
- select a matching client JAR/resource pack;
- view a generated fixture near spawn;
- zoom out without losing terrain;
- pan across an empty range and observe an explicit state;
- place/break a block and observe only intersecting tiles refresh;
- stop the bridge and observe stale/error state;
- repair an old bridge configuration;
- restart the app and confirm disk cache reuse;
- pause, restore, and remove the managed component.

The manual report records app-data path, server path, asset identity, renderer
version, Paper version, and screenshots. Debug and production app-data
directories must not be conflated.

## Visual fixtures

The golden fixture set includes terrain, water, forests, snow, height changes,
buildings, partial blocks, transparency, negative coordinates, and chunk-edge
continuity. Each output has a source manifest and renderer version.

## CI split

Normal CI runs Rust tests, Java tests, frontend checks, and deterministic
fixture tests. The real Paper workflow runs on manual dispatch and nightly,
stores server/fixture logs as artifacts, and fails distinctly for plugin load,
hello, protocol, snapshot, process exit, or `.jar.disabled` failures.

## Exit criteria

The feature is not called complete until real Paper, Rust, Tauri IPC, tile
generation, live update, cache reuse, and UI failure states have separate
evidence records.
