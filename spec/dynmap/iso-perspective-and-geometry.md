# Iso Perspective and Geometry

## Observed coordinate model

`IsoHDPerspective` projects Minecraft world coordinates onto a tile plane. Its
comments define a right-handed tile coordinate system, a world-to-map matrix,
an inverse map-to-world matrix, configurable azimuth/inclination, and a ray
segment for each output pixel. The renderer traverses sections and voxels,
then intersects model patches rather than assuming every block is a full cube.

The source includes fast floor handling, ray step increments, section-boundary
traversal, sub-block models, face visibility, UV coordinates, and water patch
handling. These details are the reason that a CSS grid or top-surface colour
sample is not an Iso HD renderer.

Tile coordinates are coordinates on the projected map plane. They are not a
world-X/world-Z bounding-box origin. A tile pixel is first expressed as a map
plane coordinate using the tile index, tile size, and map-units-per-pixel, then
the inverse transform creates the world-space ray. A renderer that centers an
Iso tile on `(tileX * tileWorldSize, tileY * tileWorldSize)` in world X/Z space
will move terrain into neighboring tiles or make a generated chunk appear
empty.

## Porting boundary

Port to Rust only the platform-neutral mathematics and data contracts:

- azimuth/inclination transform;
- ray start/end and incremental pixel stepping;
- chunk/section/voxel traversal;
- ray-plane/patch intersection;
- side visibility and UV flips;
- negative-coordinate floor semantics;
- tile-edge continuity.

Do not port Bukkit objects, `MapIterator` implementation, Dynmap global state,
or Java thread/lifecycle code.

## Rust module contract

```rust
pub trait PerspectiveRenderer {
    fn render_tile(
        &self,
        request: TileRenderRequest,
        source: &dyn ChunkSource,
        assets: &dyn AssetResolver,
    ) -> Result<RenderedTile, RenderError>;
}
```

Geometry tests must use exact fixtures for the following: positive and
negative world coordinates, ray directions parallel to each axis, chunk and
section boundaries, diagonal rays, non-cubic patches, and rotated faces.

## Source references

- `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java`
- `DynmapCore/src/main/java/org/dynmap/utils/Matrix3D.java`
- `DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java`
- `DynmapCore/src/main/java/org/dynmap/renderer/RenderPatch.java`

The immutable source reference is recorded in `source-scope-and-version.md`
and every translated implementation file must be listed in the porting
manifest.
