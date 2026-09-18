# Phase 10: Iso Geometry

## Goal

Implement a real `IsoHDPerspective`-class projection, ray traversal, patch
intersection, UV geometry, and tile-boundary behavior.

## Scope

Coordinate transforms, floor semantics, ray generation, section/voxel traversal,
chunk boundaries, patch faces, side visibility, and rotated UVs.

## Owned files

Agent B: Rust renderer geometry. Agent A: geometry fixtures and UI projection
contract review.

## Dependencies

Phase 05 normalized chunk data, Phase 08 models, Phase 09 port manifest.

## Implementation tasks

- port/translate matrix and ray math from the pinned source;
- implement deterministic traversal and patch intersection;
- translate Dynmap `PatchDefinition`/`handlePatch` semantics for parametric
  U/V limits, determinant-based side visibility, trapezoid clipping, and
  `TOPFLIP`/`TOPFLIPV`/`TOPFLIPHV`/`FLIP` UV corrections;
- align the model-face winding for top and bottom faces with Dynmap's
  `PatchDefinition.updateModelFace` construction before applying visibility;
- support negative coordinates and boundary continuity;
- remove representative-colour-only success path;
- return render metadata alongside pixels.

The tile address passed to the Iso renderer is a Dynmap map-plane address, not
the minimum world X/Z coordinate of an axis-aligned rectangle. For a tile at
`(tileX, tileY)`, the ray origin for pixel `(px, py)` is derived from
`tileX * tileSize + (px + 0.5) * blocksPerPixel` and the corresponding map-plane
Y coordinate, then transformed back into world space. Keeping this contract at
the renderer boundary prevents a generated chunk from being projected outside
the tile that requested it.

## Focused tests

Exact transforms, axis-parallel rays, negative coordinates, chunk boundaries,
parametric and non-cube patches, trapezoid clipping, determinant visibility,
UV flips, rotations, and tile edge continuity.

## Diff review checklist

No off-by-one floor division, no world iteration on Paper thread, no skipped
transparent hit semantics, and no unexplained divergence from source math.

## Phase gate

Geometry produces recognizable oblique fixture output independent of UI, and
the patch intersection boundary is covered by focused tests. This is still a
partial geometry gate: complete Dynmap traversal and golden-world evidence are
not implied.

## Known non-goals

Full shader fidelity and custom renderers follow in Phase 11.

## Follow-up phases

Phase 11 adds texture sampling and lighting.
