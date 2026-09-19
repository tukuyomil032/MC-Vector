use std::ops::RangeInclusive;

/// The last zoom rendered on the world X/Z plane. Detailed tiles use the
/// source-derived Dynmap Iso projection from zoom 5 onwards.
pub const WORLD_XZ_MAX_ZOOM: u8 = 4;
pub const MAP_GEOMETRY_EPSILON: f64 = 1.0e-9;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MapTilePlane {
    WorldXZ,
    IsoProjected,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ProjectedTileBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

/// Canonical identity and plane geometry for one map tile.
///
/// Overview tiles expose `world_bounds`; detailed tiles deliberately do not.
/// Callers that need detailed world candidates must inverse-project the
/// projected bounds through the Dynmap perspective rather than treating a
/// tile coordinate as world X/Z.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MapTileGeometry {
    pub tile_size: usize,
    pub zoom: u8,
    pub max_zoom: u8,
    pub tile_x: i32,
    pub tile_y: i32,
    pub blocks_per_pixel: i64,
    pub plane: MapTilePlane,
}

impl MapTileGeometry {
    pub fn new(
        tile_size: usize,
        max_zoom: u8,
        zoom: u8,
        tile_x: i32,
        tile_y: i32,
    ) -> Result<Self, String> {
        if zoom > max_zoom {
            return Err(format!("Map zoom {zoom} exceeds maximum {max_zoom}"));
        }
        Ok(Self {
            tile_size,
            zoom,
            max_zoom,
            tile_x,
            tile_y,
            blocks_per_pixel: 1_i64 << (max_zoom - zoom),
            plane: if zoom <= WORLD_XZ_MAX_ZOOM {
                MapTilePlane::WorldXZ
            } else {
                MapTilePlane::IsoProjected
            },
        })
    }

    pub fn world_bounds(self) -> Option<TileWorldBounds> {
        (self.plane == MapTilePlane::WorldXZ).then(|| TileWorldBounds {
            tile_size: self.tile_size,
            zoom: self.zoom,
            max_zoom: self.max_zoom,
            tile_x: self.tile_x,
            tile_y: self.tile_y,
            blocks_per_pixel: self.blocks_per_pixel,
            origin_x: i64::from(self.tile_x) * self.tile_size as i64 * self.blocks_per_pixel,
            origin_z: i64::from(self.tile_y) * self.tile_size as i64 * self.blocks_per_pixel,
        })
    }

    pub fn projected_bounds(self, perspective_scale: f64) -> Option<ProjectedTileBounds> {
        if self.plane != MapTilePlane::IsoProjected || !perspective_scale.is_finite() {
            return None;
        }
        let tile_span = self.tile_size as f64 * self.blocks_per_pixel as f64 * perspective_scale;
        Some(ProjectedTileBounds {
            min_x: self.tile_x as f64 * tile_span,
            max_x: (self.tile_x as f64 + 1.0) * tile_span,
            min_y: self.tile_y as f64 * tile_span,
            max_y: (self.tile_y as f64 + 1.0) * tile_span,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TileWorldBounds {
    pub tile_size: usize,
    pub zoom: u8,
    pub max_zoom: u8,
    pub tile_x: i32,
    pub tile_y: i32,
    pub blocks_per_pixel: i64,
    pub origin_x: i64,
    pub origin_z: i64,
}

impl TileWorldBounds {
    #[cfg(test)]
    pub fn new(
        tile_size: usize,
        max_zoom: u8,
        zoom: u8,
        tile_x: i32,
        tile_y: i32,
    ) -> Result<Self, String> {
        let geometry = MapTileGeometry::new(tile_size, max_zoom, zoom, tile_x, tile_y)?;
        Ok(geometry.world_bounds().unwrap_or(Self {
            tile_size,
            zoom,
            max_zoom,
            tile_x,
            tile_y,
            blocks_per_pixel: geometry.blocks_per_pixel,
            origin_x: i64::from(tile_x) * tile_size as i64 * geometry.blocks_per_pixel,
            origin_z: i64::from(tile_y) * tile_size as i64 * geometry.blocks_per_pixel,
        }))
    }

    pub fn max_x(self) -> i64 {
        self.origin_x + self.tile_size as i64 * self.blocks_per_pixel - 1
    }

    pub fn max_z(self) -> i64 {
        self.origin_z + self.tile_size as i64 * self.blocks_per_pixel - 1
    }

    pub fn intersects_chunk(self, chunk_x: i64, chunk_z: i64) -> bool {
        let chunk_min_x = chunk_x * 16;
        let chunk_min_z = chunk_z * 16;
        self.origin_x <= chunk_min_x + 15
            && self.max_x() >= chunk_min_x
            && self.origin_z <= chunk_min_z + 15
            && self.max_z() >= chunk_min_z
    }

    pub fn chunk_pixel_range(
        self,
        chunk_x: i64,
        chunk_z: i64,
    ) -> Option<(RangeInclusive<usize>, RangeInclusive<usize>)> {
        if !self.intersects_chunk(chunk_x, chunk_z) {
            return None;
        }
        let chunk_min_x = chunk_x * 16;
        let chunk_max_x = chunk_min_x + 15;
        let chunk_min_z = chunk_z * 16;
        let chunk_max_z = chunk_min_z + 15;
        let min_x = floor_div(chunk_min_x - self.origin_x, self.blocks_per_pixel)
            .clamp(0, self.tile_size as i64 - 1) as usize;
        let max_x = floor_div(chunk_max_x - self.origin_x, self.blocks_per_pixel)
            .clamp(0, self.tile_size as i64 - 1) as usize;
        let min_z = floor_div(chunk_min_z - self.origin_z, self.blocks_per_pixel)
            .clamp(0, self.tile_size as i64 - 1) as usize;
        let max_z = floor_div(chunk_max_z - self.origin_z, self.blocks_per_pixel)
            .clamp(0, self.tile_size as i64 - 1) as usize;
        Some((min_x..=max_x, min_z..=max_z))
    }
}

pub fn floor_div(value: i64, divisor: i64) -> i64 {
    debug_assert!(divisor > 0);
    let quotient = value / divisor;
    let remainder = value % divisor;
    if remainder < 0 {
        quotient - 1
    } else {
        quotient
    }
}

pub fn floor_mod(value: i64, divisor: i64) -> i64 {
    let remainder = value % divisor;
    if remainder < 0 {
        remainder + divisor
    } else {
        remainder
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn negative_coordinates_use_mathematical_floor() {
        assert_eq!(floor_div(-1, 16), -1);
        assert_eq!(floor_div(-16, 16), -1);
        assert_eq!(floor_div(-17, 16), -2);
        assert_eq!(floor_mod(-1, 16), 15);
        assert_eq!(floor_mod(-16, 16), 0);
    }

    #[test]
    fn chunk_range_covers_sparse_chunk_at_overview_zoom() {
        let bounds = TileWorldBounds::new(256, 8, 0, 0, 0).expect("valid bounds");
        let (x, z) = bounds
            .chunk_pixel_range(0, 0)
            .expect("origin chunk intersects the tile");
        assert_eq!(x, 0..=0);
        assert_eq!(z, 0..=0);
    }

    #[test]
    fn negative_tile_range_does_not_wrap() {
        let bounds = TileWorldBounds::new(256, 8, 8, -1, -1).expect("valid bounds");
        assert!(
            (-1 >= bounds.origin_x && -1 <= bounds.max_x())
                && (-1 >= bounds.origin_z && -1 <= bounds.max_z())
        );
        assert_eq!(bounds.origin_x, -256);
        assert_eq!(bounds.origin_z, -256);
        assert!(bounds.chunk_pixel_range(-1, -1).is_some());
        assert!(bounds.chunk_pixel_range(0, 0).is_none());
    }

    #[test]
    fn out_of_range_zoom_is_rejected() {
        assert!(TileWorldBounds::new(256, 8, 9, 0, 0).is_err());
    }

    #[test]
    fn canonical_plane_switches_only_at_zoom_five() {
        assert_eq!(
            MapTileGeometry::new(256, 8, 4, 0, 0)
                .expect("zoom four should be valid")
                .plane,
            MapTilePlane::WorldXZ
        );
        assert_eq!(
            MapTileGeometry::new(256, 8, 5, 0, 0)
                .expect("zoom five should be valid")
                .plane,
            MapTilePlane::IsoProjected
        );
    }

    #[test]
    fn detailed_geometry_has_projected_bounds_but_no_world_bounds() {
        let geometry = MapTileGeometry::new(256, 8, 8, -1, 2).expect("valid geometry");
        assert!(geometry.world_bounds().is_none());
        assert_eq!(
            geometry.projected_bounds(1.0),
            Some(ProjectedTileBounds {
                min_x: -256.0,
                max_x: 0.0,
                min_y: 512.0,
                max_y: 768.0,
            })
        );
    }
}
