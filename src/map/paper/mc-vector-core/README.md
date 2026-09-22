# MC-Vector Core

`MC-Vector Core` is the lightweight Paper-side bridge for the MC-Vector Map
feature. It is intentionally a conventional `JavaPlugin` with a
`plugin.yml`, so Paper reports it as a normal plugin.

The plugin observes player and block-change events and serves bounded surface
snapshots for chunks that are already loaded by Paper. It coalesces player
positions and sends JSON Lines over a loopback TCP connection. Socket I/O is
performed on a daemon executor; the Paper main thread never waits for the Rust
process. Snapshot extraction is capped at one chunk per tick and never forces
an unloaded chunk to generate.

The current bridge contract is protocol v2. It advertises
`chunk_surface_snapshot_v1`, uses a bounded deflate/base64 payload, and returns
an explicit `not_loaded` response when a requested chunk is unavailable.

## Build

```bash
./gradlew --no-daemon clean test jar -PcoreVersion=2.0.63
```

Release-like builds require `-PcoreVersion=X.Y.Z` and produce
`build/libs/mc-vector-core-X.Y.Z.jar`. The repository release workflow validates
that the generated `plugin.yml` version, protocol metadata, SHA-256 sidecar,
and manifest all use the same app version. Local development may omit the
property and uses the development version `0.1.0`.

The supported API target is Paper 1.21.x and the plugin is compiled for Java
21. The Gradle Wrapper pins Gradle 9.6.1 so the build does not depend on a
globally installed Gradle version. A real Paper startup check is maintained as
a separate integration gate because a successful JAR build does not prove that
Paper loads the plugin at runtime.

## Real Paper smoke test

The smoke test intentionally receives the Paper server JAR from the caller so
the downloaded binary can be pinned and verified outside the repository. It
starts temporary servers for an active bridge, an unavailable listener, and a
`.jar.disabled` component.

```bash
PAPER_JAR=/path/to/paper-1.21.10-130.jar \
  node scripts/paper-bridge-smoke.mjs
```

The CI workflow downloads Paper 1.21.10 build 130 from Paper's official
distribution and verifies its SHA-256 before running this script.
