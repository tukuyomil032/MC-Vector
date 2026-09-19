use super::tile_key::TileKey;
use crate::map::projection::{MapTileGeometry, MapTilePlane};
use crate::map::renderer::IsoHDPerspective;

pub(crate) fn tile_intersects_chunk(key: &TileKey, chunk_x: i64, chunk_z: i64) -> bool {
    let Ok(geometry) = MapTileGeometry::new(256, 8, key.zoom, key.tile_x, key.tile_y) else {
        return false;
    };
    match geometry.plane {
        MapTilePlane::WorldXZ => geometry
            .world_bounds()
            .is_some_and(|bounds| bounds.intersects_chunk(chunk_x, chunk_z)),
        MapTilePlane::IsoProjected => IsoHDPerspective::default()
            .projected_geometry_intersects_chunk(geometry, -64.0, 320.0, chunk_x, chunk_z),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::map::projection::floor_div;
    use crate::map::tiles::tile_key::DEFAULT_PERSPECTIVE;

    fn key(tile_x: i32, tile_y: i32) -> TileKey {
        TileKey::new(
            "server",
            "overworld",
            "1.21.10",
            "pack",
            "manifest",
            "renderer",
            DEFAULT_PERSPECTIVE,
            8,
            tile_x,
            tile_y,
        )
    }

    #[test]
    fn invalidation_uses_projected_bounds_for_detailed_tiles() {
        let perspective = IsoHDPerspective::default();
        let world = perspective.map_to_world([-128.0, -128.0, 0.0]);
        let chunk_x = floor_div(world[0].floor() as i64, 16);
        let chunk_z = floor_div(world[2].floor() as i64, 16);
        assert!(tile_intersects_chunk(&key(-1, -1), chunk_x, chunk_z));
    }
}
