# ADR-015: Map Verification and Release

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Builds, mock tests, real Paper, real Tauri, golden images, and license review
prove different claims and cannot be collapsed into one green check. The
product target is the complete in-app map capability, while Dynmap's embedded
web/API and unrelated server integrations are explicitly excluded.

The app's existing release workflow publishes application bundles, but the Map
Core plugin is currently discoverable from a developer-local Gradle output only.
That is not a valid production distribution boundary: an installed user can
enable Map without having the repository or `build/libs/mc-vector-core.jar`.

## Decision

Use Phase 0-27 plus Phase 18A gates, separate local/full/real evidence, and
never dispatch remote workflows or publish derived assets without explicit
authorization. Full review is performed at subsystem boundaries, not after
every small diff. The application release workflow must build the Core plugin
with the same `X.Y.Z` version as the app, attach a versioned JAR, SHA-256
sidecar, and machine-readable manifest to the same `vX.Y.Z` GitHub Release,
and fail if any of them is missing. A production Map enable downloads the
exact matching release asset on demand, verifies it, and only then installs the
managed server JAR. Release requires Paper 1.21.10, real Tauri, golden
fixtures, all declared map types, CI, attribution, and artifact-distribution
evidence, or an explicit open-gate report.

## Consequences

“Implemented” and “verified” stay distinct in phase reports. A selected asset
path, a transparent PNG, a passing Paper hello, or a successful local Gradle
build is not renderer parity or production distribution evidence. Future scope
must be added as a new phase/ADR.

## Artifact release contract

The release workflow uses the application version as the Core compatibility
anchor. For `vX.Y.Z`, it publishes:

```text
mc-vector-core-X.Y.Z.jar
mc-vector-core-X.Y.Z.jar.sha256
mc-vector-core-X.Y.Z.manifest.json
```

The manifest includes `releaseTag`, `appVersion`, `pluginVersion`,
`artifactName`, `sha256`, `byteLength`, `protocolVersion`,
`paperCompatibility`, and `sourceCommit`. The production client accepts only
the fixed MC-Vector repository, the exact app-matching tag, the expected asset
name, and a manifest/JAR identity that passes all checks. It stores the verified
bytes in an app-data cache and installs them atomically as
`plugins/mc-vector-core.jar`; it never overwrites an unknown same-named file.

The user-owned Minecraft client JAR or resource pack is a separate runtime
asset and is not included in the Core plugin release.
