# Phase 18A: Map Core Artifact Distribution and Enablement Recovery

## Goal

Make enabling Map install a verified `MC-Vector Core` Paper plugin in every
supported environment, and make the production app obtain that plugin from the
same GitHub Release channel as the application. This phase is the immediate
follow-up to Phase 17 because the real-app gate found that Map could be marked
enabled while `mc-vector-core.jar` was absent from the server's `plugins`
directory.

This phase repairs the component lifecycle and distribution prerequisite. It
does not claim Dynmap renderer parity by itself.

## Observed failure being fixed

The current enable path searches the packaged resource directory and the local
Gradle `build/libs` directory. When neither contains the plugin JAR, it can
still write Map metadata/configuration and return a non-failing status. The
result is a server with `mc-vector-core.yml` and managed metadata but no
`mc-vector-core.jar`; Paper then initializes zero plugins and the Map screen can
show an apparently enabled component without a live bridge.

The current plugin project also declares `0.1.0` independently from the app
release version. Phase 18A must replace that divergence in release artifacts;
the exact Gradle/plugin.yml version injection mechanism is an implementation
task, not permission to keep two silently incompatible version sources.

The user-selected PrismLauncher client JAR is unrelated to this failure. It is
Minecraft rendering input, not the Paper plugin artifact. The verified test
asset path used by the preceding real-app attempt was:

```text
/Users/hosiyomi322/Library/Application Support/PrismLauncher/libraries/com/mojang/minecraft/1.21.10/minecraft-1.21.10-client.jar
```

## Scope

### A. Enablement must be artifact-authoritative

- Treat the active managed JAR, its verified metadata, and the Paper-compatible
  plugin identity as prerequisites for `enable_map` success.
- Do not persist Map consent as enabled, start a bridge listener, or report an
  active component when no verified artifact has been materialized.
- Return a structured `artifact_missing` or `artifact_download_required` state
  instead of silently succeeding.
- Preserve the existing safety rule: never overwrite, rename, or delete an
  unknown same-named JAR. Report `conflict` and require explicit resolution.
- Keep active installation name stable as `plugins/mc-vector-core.jar`; the
  release asset itself is versioned.
- Preserve disabled-component behavior with
  `plugins/mc-vector-core.jar.disabled` and require a managed identity before
  restoring it.

### B. One release version for the app and Core plugin

The application release version is the compatibility anchor. A release tagged
`vX.Y.Z` must publish a Core plugin built and declared as `X.Y.Z`; the plugin
must not continue to use an unrelated hard-coded `0.1.0` version in a released
artifact.

Each application GitHub Release must contain these additional assets:

```text
mc-vector-core-X.Y.Z.jar
mc-vector-core-X.Y.Z.jar.sha256
mc-vector-core-X.Y.Z.manifest.json
```

The manifest is machine-readable and contains at least:

```json
{
  "releaseTag": "vX.Y.Z",
  "appVersion": "X.Y.Z",
  "pluginVersion": "X.Y.Z",
  "artifactName": "mc-vector-core-X.Y.Z.jar",
  "sha256": "...",
  "byteLength": 0,
  "protocolVersion": 2,
  "paperCompatibility": ["1.21.10"],
  "sourceCommit": "..."
}
```

The manifest is not permission to load an arbitrary JAR. The client validates
the release owner/repository, exact release tag, expected artifact name,
SHA-256, byte length, `plugin.yml` main class, plugin version, and protocol
compatibility before installation.

### C. Production on-demand download

When a production build enables Map and no managed compatible Core JAR is
already installed, the enable operation downloads the exact Core asset for the
application release from the fixed MC-Vector GitHub repository. It does not
search a local checkout and does not silently select an unrelated `latest`
release.

The production flow is:

1. Resolve the app version and the exact release tag `vX.Y.Z`.
2. Fetch the release manifest over HTTPS from the fixed repository.
3. Verify the manifest's release tag, app/plugin version, protocol, Paper
   compatibility, artifact name, size, and SHA-256.
4. Download the versioned JAR to a private temporary file.
5. Inspect the JAR and `plugin.yml` before accepting it.
6. Verify the SHA-256 and byte length again from the downloaded bytes.
7. Atomically move the verified bytes into the app's Core artifact cache.
8. Copy/install the verified artifact to the server's stable managed path,
   preserving unknown files and existing managed metadata rules.
9. Record provenance as `github_release`, including release tag, plugin
   version, source commit, asset URL, SHA-256, and download time.
10. Return `waiting_restart` when the server is already running; otherwise
    return the actual installed state.

The first Map enable click owns this download and exposes progress/failure to
the UI. A failed download, checksum mismatch, incompatible release, offline
state, or missing release asset must not persist `consent=enabled`. A later
enable may reuse a verified app-data cache entry without another network
request.

The fixed release endpoint is derived from the repository and exact tag rather
than accepting a URL from the renderer. Redirects, timeouts, maximum download
size, and allowed-host policy are enforced by the Rust backend. Tokens and
private filesystem details never enter normal logs or UI errors.

### D. Development behavior

Local Gradle output remains available only for an explicit development/test
mode. It must not be the production fallback and must not be required by a
packaged application. If `tauri dev` has no local JAR, it must show the same
structured missing-artifact state rather than pretending that Map is active.

Debug and production artifact provenance must remain distinguishable in
metadata and diagnostics.

## Owned files

Rust/Tauri implementation and tests:

```text
src-tauri/src/map/**
src-tauri/src/commands/map/**
src-tauri/src/commands/map.rs
tests or Rust fixtures for release manifests and artifact verification
```

Release integration and plugin versioning:

```text
.github/workflows/release.yml
src/map/paper/mc-vector-core/build.gradle.kts
src/map/paper/mc-vector-core/src/main/resources/plugin.yml
scripts or release manifest templates used by the workflow
```

React status/progress surface:

```text
src/map/api/**
src/map/state/**
src/map/components/**
src/i18n/**
```

The existing release workflow may gain a dedicated `build-core-plugin` job,
but its asset must be published by the same release job and tag as the app.

## Dependencies

- Phase 02 Paper feature migration;
- Phase 04 structured Map error states;
- Phase 15 real Paper/Tauri integration contracts;
- Phase 16 Gradle wrapper and existing release workflow;
- Phase 17 tile lifecycle and server-state request gates.

## Implementation tasks

### Artifact and lifecycle repair

- Split artifact discovery into explicit development, bundled, cache, and
  GitHub-release sources.
- Make production source selection deterministic and reject local checkout
  paths outside development mode.
- Add an artifact state machine such as:

  ```text
  missing | download_required | downloading | verifying | installed |
  outdated | invalid | conflict | error
  ```

- Make `enable_map` atomic from the user's perspective: no enabled consent or
  active bridge until artifact installation succeeds.
- Make repeated enable idempotent and make concurrent enable requests join one
  in-flight download/install operation.
- Preserve managed metadata only after the artifact identity has been verified.
- Ensure status reports distinguish “asset configured” from “Core plugin
  installed”; selecting a Minecraft client JAR must never imply the Paper
  plugin exists.
- Add explicit restart-required behavior after installation into a running
  Paper server.

### Release workflow

- Add a Java 21 Gradle step that runs the Core plugin tests and JAR build on
  every application release candidate.
- Inject the release version into Gradle and `plugin.yml`, and fail if app,
  plugin, protocol, or Paper compatibility metadata disagree.
- Verify the JAR contains `plugin.yml` and
  `com.mcvector.core.MCVectorCorePlugin`, and contains no Dynmap source or
  user Minecraft assets.
- Generate the versioned JAR, SHA-256 sidecar, and release manifest.
- Upload all three assets to the existing `vX.Y.Z` GitHub Release together
  with the app bundles.
- Fail the release if the Core asset, checksum, or manifest is missing.
- Keep release action references pinned and avoid logging user paths or tokens.

### UI and IPC

- Extend `MapStatus` and Map events with artifact state, version, provenance,
  release tag, verification state, restart requirement, and redacted error
  reason.
- Show “Core plugin is being downloaded”, checksum/incompatibility errors,
  offline retry, and “restart required” separately from Minecraft asset status.
- Keep the Map tile scheduler stopped while the Core artifact or bridge
  prerequisite is unresolved.

## Focused tests

### Rust/Tauri

- `enable_map` with no local/build/resource JAR returns a structured missing or
  download-required state and does not persist enabled consent.
- A valid release manifest and JAR are downloaded, hash-verified, atomically
  cached, and installed under the stable plugin name.
- A second enable uses the verified cache and does not download again.
- Invalid JSON, wrong release tag, wrong app/plugin version, wrong protocol,
  wrong Paper compatibility, missing entrypoint, oversized payload, checksum
  mismatch, and truncated JAR are rejected.
- Network timeout/offline/release-not-found errors remain retryable and do not
  leave a partial active JAR.
- Unknown same-named active or disabled JARs remain untouched and produce
  `conflict`.
- A managed JAR installed while the server is running produces
  `waiting_restart`; the Paper process is not forcibly restarted.
- Release metadata records `github_release` versus development provenance and
  contains no token.

### Release workflow

- Gradle builds with the exact release version and emits the expected plugin
  identity.
- The workflow fails when the plugin asset, checksum, or manifest is absent.
- The release asset names and manifest URLs resolve to the same GitHub Release
  tag as the application.
- The published plugin JAR is excluded from the application bundle only when
  the runtime download contract requires it; no Minecraft client JAR/resource
  pack is included.

### Real Paper/Tauri

- With the local Gradle output removed from the packaged-app environment, Map
  enable downloads the release asset and installs it before Paper startup.
- Paper initializes `MC-Vector-Core` and sends hello/heartbeat after restart.
- The PrismLauncher client JAR remains selected as a separate rendering asset.
- If the release is unavailable, the Map screen explains the artifact failure
  and never enters a terrain-generation loop.
- Stopping Paper releases port `25565` before the debug app is closed.

## Diff review checklist

- No production path references `../src/map/paper/mc-vector-core/build/libs` as a
  required source.
- No `enable_map` success is possible with no verified active artifact.
- No consent is persisted before verified installation.
- No arbitrary GitHub URL, release tag, or repository is accepted from React.
- No unknown same-named JAR is overwritten or deleted.
- No checksum, manifest, or plugin identity check is skipped.
- No token, full user path, or raw HTTP response is logged.
- Core plugin version and app release version cannot silently diverge.
- Asset selection state and Core plugin installation state remain independent.
- Failure leaves no partial JAR and does not start the tile scheduler.

## Phase gate

The phase is complete only when all of the following are recorded:

1. focused Rust, TypeScript, and Java checks pass;
2. a release-like workflow run produces the versioned Core JAR, checksum, and
   manifest from the same version as the app;
3. a production-mode fixture downloads and verifies the artifact without using
   local Gradle output;
4. missing/offline/checksum/conflict failures remain visible and do not mark
   Map enabled;
5. a real Paper 1.21.10 run loads the installed plugin and exchanges protocol
   v2 messages;
6. the Computer Use test stops Paper, confirms `25565` is free, and only then
   closes the debug app;
7. the Phase 17 zoom/pan test can proceed with a real bridge instead of a
   zero-plugin server.

## Known non-goals

- This phase does not implement all block models, textures, shaders, or
  Dynmap map types.
- It does not bundle Mojang/Microsoft Minecraft assets.
- It does not publish a release, push commits, dispatch remote CI, sign, or
  notarize anything without explicit authorization.
- It does not make a successful plugin download evidence of Dynmap renderer
  parity.

## Follow-up phases

Phase 18 continues with dimensions and map types after the artifact lifecycle
is reliable. Phase 25 repeats the release/distribution checks at the complete
feature gate, and Phase 27 remains the only final Map-complete decision.
