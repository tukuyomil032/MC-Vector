# Dynmap Source Boundary

This directory contains the attributed Dynmap v3.0 renderer-closure source
boundary used by MC-Vector as a porting reference. It is not a Dynmap runtime
dependency, does not make MC-Vector Dynmap-compatible, and is not bundled into
the frontend or Paper plugin.

## Pinned source

- Repository: <https://github.com/webbukkit/dynmap>
- Branch context: `v3.0`
- Immutable ref: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- Source and hash inventory: [SOURCE-REF.md](SOURCE-REF.md) and
  [ORIGIN-MANIFEST.json](ORIGIN-MANIFEST.json)
- Source provenance: [ORIGIN-MANIFEST.md](ORIGIN-MANIFEST.md)
- License: [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0)
- Attribution and boundary notice: [NOTICE](NOTICE)

## Renderer closure source

The `upstream/` directory contains the pinned, source-only Java snapshots listed
in [`ORIGIN-MANIFEST.json`](ORIGIN-MANIFEST.json). The closure includes the
Dynmap renderer API, HD perspective/model/texture/shader/lighting code, built-in
renderer classes, color multipliers, and renderer-facing utility classes.

The original upstream contents are retained. These files are for source review
and selective translation only; they are not Java build inputs for MC-Vector.
The corresponding Rust implementation is tracked separately under
`src-tauri/crates/map-renderer-core/src` and remains incomplete until its
fixtures and parity gates pass.

## Intentionally excluded

The upstream snapshot is intentionally not the whole Dynmap repository. The
copied renderer files still have large dependency graphs, so copying them is
not treated as a completed port. Future selective translation must be backed
by geometry, block-model, texture, alpha, lighting, and golden-image fixtures
listed in the manifest and the Dynmap research corpus. Bukkit/platform
adapters, lifecycle, storage, web UI, commands, and user assets remain
excluded.

Dynmap platform adapters, lifecycle, storage, web UI, commands, server assets,
and Minecraft client assets are outside this source snapshot boundary. Their
renderer-facing contracts are specified in `spec/map/plan`. MC-Vector is an
independent project and is not affiliated with, endorsed by, or sponsored by
Dynmap or its contributors.
