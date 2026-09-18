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

The `upstream/` directory contains only two small, verbatim snapshots:

- `HDPerspective.java`, for the perspective and chunk/tile data boundary;
- `PatchDefinition.java`, for render-patch geometry and visibility data.

The original upstream contents are retained. These files are for source review
and future translation only; they are not Java build inputs for MC-Vector.

## Intentionally excluded

The full `IsoHDPerspective.java` and `TexturePack.java` sources remain linked in
the manifest but are not copied because their size and dependency graphs make a
standalone snapshot misleading. Future selective translation must be backed by
the geometry, block-model, texture, alpha, lighting, and golden-image fixtures
listed in the manifest and existing Dynmap research corpus.

Dynmap platform adapters, lifecycle, storage, web UI, commands, server assets,
and Minecraft client assets are outside this boundary. MC-Vector is an
independent project and is not affiliated with, endorsed by, or sponsored by
Dynmap or its contributors.
