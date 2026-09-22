# Dynmap Porting Notes

## Phase 9 boundary decision

The pinned Dynmap v3.0 ref is treated as an algorithm and data-model reference,
not as a runtime library. The repository is too large to copy safely as a
single source drop, and its Bukkit/platform adapters, lifecycle, storage, web
server, commands, and web assets do not belong in MC-Vector.

The selected snapshot is deliberately limited to renderer contracts and their
direct source references. It includes `HDPerspective.java`,
`IsoHDPerspective.java`, `Matrix3D.java`, `PatchDefinition.java`,
`HDBlockModels.java`, `TexturePack.java`, `HDShader.java`, `HDLighting.java`,
and `shaders.txt`. These files are kept under `upstream/` with their original
contents. They are not compiled by Vite, Rust, or the Paper Gradle project.
Their source headers were absent in the pinned upstream files, so attribution
is carried by the local license, NOTICE, source reference, and manifest
artifacts rather than by inventing a header that was not present upstream.

## Deliberate omissions

The rest of Dynmap was not copied. The selected renderer files still pull in a
wide graph of Dynmap renderer, model, asset, and platform types. Copying these
files alone would create the appearance of a usable port while leaving the
actual contracts unresolved. The manifest therefore distinguishes source
snapshots from translated Rust responsibilities and keeps full parity gates
open until the required fixtures pass.

## Translation boundary

The translated geometry boundary is implemented at
`src-tauri/src/map/renderer/dynmap/iso_hd.rs` and
`src-tauri/src/map/renderer/dynmap/patch.rs`. The first module translates the
pinned `IsoHDPerspective`/`Matrix3D` coordinate contract into Rust. The second
translates `PatchDefinition` and `IsoHDPerspective.handlePatch`: parametric
patch hits, determinant-based side visibility, clipped trapezoids, and UV flip
modes are routed through the existing `render_iso_tile` path. It still does
not claim complete Dynmap ray traversal or asset parity: scaled submodels,
custom renderers, shaders, lighting, and the full `TexturePack` contract remain
separate implementation work.

Future Rust work and every subsequent translation must:

1. keep the pinned ref and exact source path in the manifest;
2. preserve Apache-2.0 attribution and record concrete MC-Vector changes;
3. remove Bukkit/Dynmap runtime dependencies from the translated boundary;
4. add geometry, patch, asset, alpha, and golden-image evidence before marking
   a row approved;
5. keep Minecraft client assets as user-owned inputs rather than bundling them
   with this source snapshot.

## Renderer vertical slice

The first saved-world vertical slice is now covered by
`commands::map::tests::saved_anvil_fixture_renders_a_deterministic_nontransparent_iso_tile`.
It writes a 1.21.10-shaped Anvil fixture, resolves a client-asset fixture through
the Rust blockstate/model/texture resolver, renders an IsoProjected tile, and
asserts non-zero terrain coverage, a saved source, a non-zero rendered chunk
count, and byte-for-byte deterministic PNG output on a second render.

This is evidence that the Rust-owned Anvil-to-PNG path is live; it is not a
claim of complete Dynmap renderer parity. The fixture deliberately contains no
Minecraft user asset from the repository. Real client JAR/resource-pack input
remains an external acceptance prerequisite, and the full model registry,
custom renderers, and Dynmap golden-image parity remain open.

The translated modules carry SPDX, source path/ref, destination, and concrete
change metadata. Their focused tests are the geometry evidence for this slice;
golden terrain and full model/texture evidence are still required before any
Dynmap-parity claim.
