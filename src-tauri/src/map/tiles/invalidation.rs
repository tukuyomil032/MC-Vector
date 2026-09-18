use super::tile_key::TileKey;
use crate::map::projection::TileWorldBounds;

pub(crate) fn tile_intersects_chunk(key: &TileKey, chunk_x: i64, chunk_z: i64) -> bool {
    TileWorldBounds::new(256, 8, key.zoom, key.tile_x, key.tile_y)
        .map(|bounds| bounds.intersects_chunk(chunk_x, chunk_z))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn invalidation_uses_floor_safe_tile_bounds() {
        assert!(tile_intersects_chunk(&key(-1, -1), -16, -16));
        assert!(!tile_intersects_chunk(&key(-1, -1), 0, 0));
    }
}
