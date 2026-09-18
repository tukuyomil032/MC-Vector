# Dynmap Source Reference

This directory is the checked-in provenance boundary for selected Dynmap v3.0
source snapshots. It is research input for the later Rust renderer and asset
port; it is not a runtime dependency and is not compiled into the frontend or
Paper plugin.

## Pinned source

- Repository: <https://github.com/webbukkit/dynmap>
- Branch used for browsing: `v3.0`
- Immutable source ref: `93b454efb8802dc7406d6873434f2aeec5c636f4`
- Ref URL: <https://github.com/webbukkit/dynmap/tree/93b454efb8802dc7406d6873434f2aeec5c636f4>
- Research date: 2026-09-18
- License text: [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0)
- License source URL: <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/LICENSE>
- License SHA-256: `50e6751797c50dedd75ef1b8a0d9e42f5f8472e9fbce91f34718e9f97b0c780a`
- Local attribution: [NOTICE](NOTICE)

The ref and source URLs are copied from the repository's checked-in Dynmap
research corpus. The commit is intentionally immutable; do not replace it with
the moving `v3.0` branch or a guessed successor.

## Selected upstream snapshots

| Local path | Upstream path | Source URL | SHA-256 | Selection reason |
| --- | --- | --- | --- | --- |
| `upstream/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | `DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java> | `1bd07eb34fbde3638c541807ed93c4545ae845e5f43364d4f82a0af9beee301f` | Small interface boundary for perspective requirements and tile invalidation. |
| `upstream/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | `DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java` | <https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java> | `3e1db6c77caeb84fe2bcbb7d70b5db0b57a204d5b8ff4f139bfda36a54f69dcd` | Directly relevant render-patch data model without copying the full renderer. |

The two selected Java files are verbatim source snapshots. Their upstream
contents did not include a copyright header, so no synthetic header was added;
the exact source path, ref, URL, hash, and Apache attribution are recorded here
and in the manifest.

## Translated geometry sources

The following sources were read at the same immutable ref and translated into
Rust rather than copied verbatim:

- `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java`
  supplies the azimuth/inclination normalization, world-to-map and map-to-world
  transform order, tile floor convention, and ray construction contract.
- `DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java` supplies the 3x3
  left-multiply, rotation, shear, scale, and vector transform operations.

The translated destination is
`src-tauri/src/map/renderer/dynmap/iso_hd.rs`. The module carries its own SPDX,
origin, source-ref, destination, and change metadata. It is a geometry slice,
not a complete port of Dynmap's voxel traversal or asset pipeline.

## Intentionally not copied

`IsoHDPerspective.java` and `TexturePack.java` remain upstream references rather
than verbatim source drops. `IsoHDPerspective` has a tracked geometry
translation, while its voxel/patch traversal and `TexturePack` remain
unported. Their exact paths and future port destinations remain registered in
[porting-manifest.md](porting-manifest.md). No source commit was changed to make
those omissions appear complete.

The pinned repository did not contain a root `NOTICE` file at this ref. The
local [NOTICE](NOTICE) is therefore an MC-Vector attribution artifact, not a
claim that an upstream NOTICE was copied.

The checked upstream NOTICE URL was
<https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/NOTICE>;
the pinned ref returned no such file.
