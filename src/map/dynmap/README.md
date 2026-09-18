# Dynmap Source Boundary

This directory contains the small, attributed Dynmap v3.0 source boundary used
by MC-Vector as a porting reference. It is not a Dynmap runtime dependency,
does not make MC-Vector Dynmap-compatible, and is not bundled into the frontend
or Paper plugin.

## Pinned source

- Repository: <https://github.com/webbukkit/dynmap>
- Branch context: `v3.0`
- Immutable ref: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- Source and hash inventory: [SOURCE-REF.md](SOURCE-REF.md)
- Porting decisions: [porting-manifest.md](porting-manifest.md) and
  [porting-notes.md](porting-notes.md)
- License: [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0)
- Attribution and boundary notice: [NOTICE](NOTICE)

## Selected source

The `upstream/` directory contains the pinned, source-only snapshots listed in
[`SOURCE-REF.md`](SOURCE-REF.md). They cover the perspective, matrix, patch,
block-model, texture-pack, shader, and lighting boundaries:

- `HDPerspective.java` and `IsoHDPerspective.java`;
- `Matrix3D.java` and `PatchDefinition.java`;
- `HDBlockModels.java`, `TexturePack.java`, `HDShader.java`, and
  `HDLighting.java`;
- `shaders.txt`.

The original upstream contents are retained. These files are for source review
and selective translation only; they are not Java build inputs for MC-Vector.
The corresponding Rust implementation is tracked separately under
`src-tauri/src/map/renderer/dynmap` and remains incomplete until its fixtures
and parity gates pass.

## Intentionally excluded

The upstream snapshot is intentionally not the whole Dynmap repository. The
copied renderer files still have large dependency graphs, so copying them is
not treated as a completed port. Future selective translation must be backed
by geometry, block-model, texture, alpha, lighting, and golden-image fixtures
listed in the manifest and the Dynmap research corpus. Bukkit/platform
adapters, lifecycle, storage, web UI, commands, and user assets remain
excluded.

Dynmap platform adapters, lifecycle, storage, web UI, commands, server assets,
and Minecraft client assets are outside this boundary. MC-Vector is an
independent project and is not affiliated with, endorsed by, or sponsored by
Dynmap or its contributors.
