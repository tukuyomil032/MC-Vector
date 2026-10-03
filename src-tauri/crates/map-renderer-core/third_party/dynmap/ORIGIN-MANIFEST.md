# Dynmap Origin Manifest

The complete machine-readable source manifest is
[`ORIGIN-MANIFEST.json`](ORIGIN-MANIFEST.json). It records every vendored
renderer-closure Java file, its pinned upstream path, SHA-256, license, and
Rust destination.

- Repository: <https://github.com/webbukkit/dynmap>
- Revision: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- License: Apache-2.0; see [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0)
- Source boundary: source-only and not a runtime dependency
- Rust implementation: independent translation, tracked outside this snapshot

The manifest deliberately includes source closure rather than only the first
few perspective classes. A cataloged source file is not an implemented or
verified Rust symbol; implementation and differential evidence are tracked in
`spec/map/coverage/` and must be promoted independently.

The snapshot excludes Dynmap lifecycle, Bukkit integration, web UI, storage,
commands, and third-party runtime assets. Those boundaries are recorded in the
Map ADRs and resource catalog.
