//! World-coordinate tile boundaries used by Dynmap-style projections.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize, Deserialize)]
pub struct TileCoordinate {
    pub x: i64,
    pub z: i64,
}

pub const MIN_ZOOM: u8 = 0;
pub const MAX_ZOOM: u8 = 8;
pub const DEFAULT_TILE_EXTENT_AT_ZOOM_ZERO: i64 = 2_048;
pub const MAX_REQUIRED_CHUNKS: usize = 64;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub enum TileProjection {
    WorldXZ,
    IsoProjected,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TileDirection {
    North,
    East,
    South,
    West,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TileGeometryError {
    InvalidZoom,
    InvalidBaseExtent,
    Overflow,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct TileBounds {
    pub coordinate: TileCoordinate,
    pub zoom: u8,
    pub extent: i64,
    pub min_x: i64,
    pub min_z: i64,
    pub max_x_exclusive: i64,
    pub max_z_exclusive: i64,
}

impl TileBounds {
    pub fn adjacent(self, direction: TileDirection) -> Result<Self, TileGeometryError> {
        let coordinate = match direction {
            TileDirection::North => TileCoordinate::new(
                self.coordinate.x,
                self.coordinate
                    .z
                    .checked_sub(1)
                    .ok_or(TileGeometryError::Overflow)?,
            ),
            TileDirection::East => TileCoordinate::new(
                self.coordinate
                    .x
                    .checked_add(1)
                    .ok_or(TileGeometryError::Overflow)?,
                self.coordinate.z,
            ),
            TileDirection::South => TileCoordinate::new(
                self.coordinate.x,
                self.coordinate
                    .z
                    .checked_add(1)
                    .ok_or(TileGeometryError::Overflow)?,
            ),
            TileDirection::West => TileCoordinate::new(
                self.coordinate
                    .x
                    .checked_sub(1)
                    .ok_or(TileGeometryError::Overflow)?,
                self.coordinate.z,
            ),
        };
        Self::from_coordinate(coordinate, self.zoom, self.extent)
    }

    fn from_coordinate(
        coordinate: TileCoordinate,
        zoom: u8,
        extent: i64,
    ) -> Result<Self, TileGeometryError> {
        let (min_x, min_z) = coordinate
            .min_world(extent)
            .ok_or(TileGeometryError::Overflow)?;
        let max_x_exclusive = min_x
            .checked_add(extent)
            .ok_or(TileGeometryError::Overflow)?;
        let max_z_exclusive = min_z
            .checked_add(extent)
            .ok_or(TileGeometryError::Overflow)?;
        Ok(Self {
            coordinate,
            zoom,
            extent,
            min_x,
            min_z,
            max_x_exclusive,
            max_z_exclusive,
        })
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct TilePyramid {
    pub base_extent_at_zoom_zero: i64,
}

impl Default for TilePyramid {
    fn default() -> Self {
        Self::new(DEFAULT_TILE_EXTENT_AT_ZOOM_ZERO).expect("default tile extent is valid")
    }
}

impl TilePyramid {
    pub fn new(base_extent_at_zoom_zero: i64) -> Result<Self, TileGeometryError> {
        if base_extent_at_zoom_zero <= 0
            || (base_extent_at_zoom_zero & (base_extent_at_zoom_zero - 1)) != 0
        {
            return Err(TileGeometryError::InvalidBaseExtent);
        }
        if base_extent_at_zoom_zero < (1_i64 << MAX_ZOOM) {
            return Err(TileGeometryError::InvalidBaseExtent);
        }
        Ok(Self {
            base_extent_at_zoom_zero,
        })
    }

    pub fn extent_at(self, zoom: u8) -> Result<i64, TileGeometryError> {
        if !(MIN_ZOOM..=MAX_ZOOM).contains(&zoom) {
            return Err(TileGeometryError::InvalidZoom);
        }
        Ok(self.base_extent_at_zoom_zero >> zoom)
    }

    pub fn bounds_for_center(
        self,
        world_x: i64,
        world_z: i64,
        zoom: u8,
    ) -> Result<TileBounds, TileGeometryError> {
        let extent = self.extent_at(zoom)?;
        let coordinate = TileCoordinate::from_world(world_x, world_z, extent)
            .ok_or(TileGeometryError::Overflow)?;
        TileBounds::from_coordinate(coordinate, zoom, extent)
    }

    pub fn bounds_for_tile(
        self,
        coordinate: TileCoordinate,
        zoom: u8,
    ) -> Result<TileBounds, TileGeometryError> {
        TileBounds::from_coordinate(coordinate, zoom, self.extent_at(zoom)?)
    }

    pub fn required_chunks(
        self,
        bounds: TileBounds,
        projection: TileProjection,
        world_center_x: i64,
        world_center_z: i64,
        limit: usize,
    ) -> Result<Vec<crate::world::chunk_view::ChunkCoord>, TileGeometryError> {
        let limit = limit.min(MAX_REQUIRED_CHUNKS);
        if limit == 0 {
            return Ok(Vec::new());
        }
        let padding = match projection {
            TileProjection::WorldXZ => 0_i64,
            // Iso projection rays can enter from an adjacent chunk at a tile
            // edge. Keep the conservative one-chunk border explicit.
            TileProjection::IsoProjected => 1_i64,
        };
        let min_x = bounds.min_x.saturating_sub(padding * 16);
        let min_z = bounds.min_z.saturating_sub(padding * 16);
        let max_x = bounds.max_x_exclusive.saturating_add(padding * 16);
        let max_z = bounds.max_z_exclusive.saturating_add(padding * 16);
        let (min_chunk, _) = crate::world::chunk_view::ChunkCoord::from_block(min_x, min_z);
        let (max_chunk, _) = crate::world::chunk_view::ChunkCoord::from_block(
            max_x.saturating_sub(1),
            max_z.saturating_sub(1),
        );
        let mut candidates = Vec::new();
        for chunk_z in min_chunk.z..=max_chunk.z {
            for chunk_x in min_chunk.x..=max_chunk.x {
                let center_x = chunk_x.saturating_mul(16).saturating_add(8);
                let center_z = chunk_z.saturating_mul(16).saturating_add(8);
                let dx = i128::from(center_x) - i128::from(world_center_x);
                let dz = i128::from(center_z) - i128::from(world_center_z);
                let distance = dx * dx + dz * dz;
                candidates.push((distance, chunk_x, chunk_z));
            }
        }
        candidates.sort_unstable_by_key(|(distance, x, z)| (*distance, *x, *z));
        Ok(candidates
            .into_iter()
            .take(limit)
            .map(|(_, x, z)| crate::world::chunk_view::ChunkCoord::new(x, z))
            .collect())
    }
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
    use super::{
        TileCoordinate, TileDirection, TileProjection, TilePyramid, MAX_REQUIRED_CHUNKS, MAX_ZOOM,
    };
    use crate::world::chunk_view::ChunkCoord;

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

    #[test]
    fn pyramid_has_monotonic_extents_for_zoom_zero_through_eight() {
        let pyramid = TilePyramid::default();
        let extents = (0..=MAX_ZOOM)
            .map(|zoom| pyramid.extent_at(zoom).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(extents.first(), Some(&2048));
        assert_eq!(extents.last(), Some(&8));
        assert!(extents.windows(2).all(|pair| pair[0] > pair[1]));
    }

    #[test]
    fn negative_center_uses_floor_tile_and_chunk_division() {
        let pyramid = TilePyramid::default();
        let bounds = pyramid.bounds_for_center(-1, -1, 0).unwrap();
        assert_eq!(bounds.coordinate, TileCoordinate::new(-1, -1));
        let chunks = pyramid
            .required_chunks(bounds, TileProjection::WorldXZ, -1, -1, 1)
            .unwrap();
        assert_eq!(chunks, vec![ChunkCoord::new(-1, -1)]);
    }

    #[test]
    fn display_center_wins_over_geometric_tile_center() {
        let pyramid = TilePyramid::default();
        let bounds = pyramid
            .bounds_for_tile(TileCoordinate::new(0, 0), 0)
            .unwrap();
        let chunks = pyramid
            .required_chunks(bounds, TileProjection::WorldXZ, 8, 8, 4)
            .unwrap();
        assert_eq!(chunks[0], ChunkCoord::new(0, 0));
    }

    #[test]
    fn required_chunks_are_bounded_and_iso_keeps_edge_padding() {
        let pyramid = TilePyramid::default();
        let bounds = pyramid
            .bounds_for_tile(TileCoordinate::new(0, 0), 0)
            .unwrap();
        let chunks = pyramid
            .required_chunks(bounds, TileProjection::IsoProjected, 8, 8, 500)
            .unwrap();
        assert_eq!(chunks.len(), MAX_REQUIRED_CHUNKS);
        assert!(chunks.contains(&ChunkCoord::new(-1, -1)));
    }

    #[test]
    fn adjacent_tiles_share_exact_boundaries() {
        let pyramid = TilePyramid::default();
        let bounds = pyramid.bounds_for_center(17, 17, 5).unwrap();
        let east = bounds.adjacent(TileDirection::East).unwrap();
        assert_eq!(east.min_x, bounds.max_x_exclusive);
        assert_eq!(east.min_z, bounds.min_z);
        let north = bounds.adjacent(TileDirection::North).unwrap();
        assert_eq!(north.max_z_exclusive, bounds.min_z);
    }

    #[test]
    fn zoom_out_does_not_change_the_world_anchor() {
        let pyramid = TilePyramid::default();
        let center = (123_i64, -456_i64);
        let tiles = (0..=MAX_ZOOM)
            .map(|zoom| pyramid.bounds_for_center(center.0, center.1, zoom).unwrap())
            .collect::<Vec<_>>();
        assert!(tiles
            .iter()
            .all(|tile| center.0 >= tile.min_x && center.0 < tile.max_x_exclusive));
        assert!(tiles
            .iter()
            .all(|tile| center.1 >= tile.min_z && center.1 < tile.max_z_exclusive));
    }
}
