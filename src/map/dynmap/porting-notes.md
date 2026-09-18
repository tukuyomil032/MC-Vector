# Dynmap Porting Notes

## Phase 9 boundary decision

The pinned Dynmap v3.0 ref is treated as an algorithm and data-model reference,
not as a runtime library. The repository is too large to copy safely as a
single source drop, and its Bukkit/platform adapters, lifecycle, storage, web
server, commands, and web assets do not belong in MC-Vector.

The selected snapshot is deliberately small:

- `HDPerspective.java` records the perspective boundary: required chunks,
  invalidated tiles, render entry points, and data requirements.
- `PatchDefinition.java` records the patch geometry, UV clipping, visibility,
  orientation, and shading fields needed when translating render-patch data.

Both files are kept under `upstream/` with their original contents. They are
not compiled by Vite, Rust, or the Paper Gradle project. Their source headers
were absent in the pinned upstream files, so attribution is carried by the
local license, NOTICE, source reference, and manifest artifacts rather than by
inventing a header that was not present upstream.

## Deliberate omissions

`IsoHDPerspective.java` and `TexturePack.java` were not copied. Each is large
and pulls in a wide graph of Dynmap renderer, model, asset, and platform types.
Copying either file alone would create the appearance of a usable port while
leaving the actual contracts unresolved. The manifest keeps both rows as
`planned`, with their future Rust destinations and required fixtures.

## Translation boundary

Future Rust work may translate selected math and data-model behavior from this
ref, but must:

1. keep the pinned ref and exact source path in the manifest;
2. preserve Apache-2.0 attribution and record concrete MC-Vector changes;
3. remove Bukkit/Dynmap runtime dependencies from the translated boundary;
4. add geometry, patch, asset, alpha, and golden-image evidence before marking
   a row approved;
5. keep Minecraft client assets as user-owned inputs rather than bundling them
   with this source snapshot.

No Rust or shared-file change is part of Phase 9 source-boundary setup.
