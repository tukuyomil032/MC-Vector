//! World-coordinate tile boundaries used by Dynmap-style projections.

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct TileCoordinate {
    pub x: i64,
    pub z: i64,
}

impl TileCoordinate {
    pub const fn new(x: i64, z: i64) -> Self {
        Self { x, z }
    }

    pub fn from_world(world_x: i64, world_z: i64, tile_extent: i64) -> Option<Self> {
        if tile_extent <= 0 {
            return None;
        }
        Some(Self::new(
            world_x.div_euclid(tile_extent),
            world_z.div_euclid(tile_extent),
        ))
    }

    pub fn min_world(self, tile_extent: i64) -> Option<(i64, i64)> {
        if tile_extent <= 0 {
            return None;
        }
        Some((
            self.x.checked_mul(tile_extent)?,
            self.z.checked_mul(tile_extent)?,
        ))
    }

    pub fn max_world_exclusive(self, tile_extent: i64) -> Option<(i64, i64)> {
        let (min_x, min_z) = self.min_world(tile_extent)?;
        Some((
            min_x.checked_add(tile_extent)?,
            min_z.checked_add(tile_extent)?,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::TileCoordinate;

    #[test]
    fn negative_world_coordinates_use_floor_tile_division() {
        assert_eq!(
            TileCoordinate::from_world(-1, -257, 256),
            Some(TileCoordinate::new(-1, -2))
        );
    }

    #[test]
    fn tile_bounds_are_half_open_and_overflow_checked() {
        let tile = TileCoordinate::new(-2, 3);
        assert_eq!(tile.min_world(16), Some((-32, 48)));
        assert_eq!(tile.max_world_exclusive(16), Some((-16, 64)));
        assert_eq!(TileCoordinate::new(i64::MAX, 0).min_world(2), None);
    }
}
