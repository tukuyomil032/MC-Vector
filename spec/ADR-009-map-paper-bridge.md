# ADR-009: Paper Bridge

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Dynmap's platform adapters are large and version-specific. MC-Vector needs only
live observations and bounded loaded-chunk snapshots.

The Paper bridge cannot be useful if the Core plugin JAR is missing. The prior
enable path could leave managed configuration/metadata behind while no
`plugins/mc-vector-core.jar` existed, causing Paper to initialize zero plugins
while the Map UI appeared enabled. A selected Minecraft client JAR is rendering
input and does not install this Paper plugin.

## Decision

Use an independent `JavaPlugin` with protocol v2 over authenticated loopback
TCP/JSON Lines. Java observes lifecycle, players, dirty hints, heartbeat, and
loaded snapshots. Rust owns rendering and Anvil reads. No synchronous network
I/O or forced chunk loading occurs on the Paper main thread.

Treat the plugin artifact as an explicit managed component. The production
application obtains a versioned `MC-Vector Core` JAR from the exact matching
GitHub Release when Map is enabled, verifies its release manifest, checksum,
size, plugin identity, and protocol version, and installs it atomically under
the stable server path `plugins/mc-vector-core.jar`. Development builds may use
an explicitly marked local Gradle artifact. `enable_map` cannot report success,
persist enabled consent, or start a usable bridge until a verified artifact is
present. Unknown same-named JARs remain a conflict and are never overwritten.

## Consequences

The Java project remains smaller than Dynmap by design; parity complexity lives
in Rust/assets/tiles. Real Paper smoke is mandatory evidence. Artifact
distribution is part of the bridge contract: the app release tag and Core
plugin version must match, while Minecraft client assets remain user-owned
runtime inputs and are not bundled into the plugin or app release.
