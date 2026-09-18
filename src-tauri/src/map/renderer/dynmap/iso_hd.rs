/*
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: Dynmap contributors
 *
 * Origin: https://github.com/webbukkit/dynmap
 * Source-Ref: https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java
 * Ported-to: MC-Vector Rust
 * Destination: src-tauri/src/map/renderer/dynmap/iso_hd.rs
 * Changes: Reimplemented the IsoHDPerspective matrix, floor/tile, and ray
 *          contract in Rust without importing Dynmap runtime or Bukkit code.
 */

const MIN_INCLINATION_DEGREES: f64 = 20.0;
const MAX_INCLINATION_DEGREES: f64 = 90.0;
const MIN_SCALE: f64 = 1.0;
const MAX_SCALE: f64 = 64.0;

#[derive(Clone, Copy, Debug, PartialEq)]
struct Matrix3 {
    values: [[f64; 3]; 3],
}

impl Matrix3 {
    const fn identity() -> Self {
        Self {
            values: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        }
    }

    const fn new(values: [[f64; 3]; 3]) -> Self {
        Self { values }
    }

    fn multiply_left(&mut self, left: Self) {
        let mut result = [[0.0; 3]; 3];
        for (row, result_row) in result.iter_mut().enumerate() {
            for (column, result_cell) in result_row.iter_mut().enumerate() {
                *result_cell = (0..3)
                    .map(|index| left.values[row][index] * self.values[index][column])
                    .sum();
            }
        }
        self.values = result;
    }

    fn scale(&mut self, x: f64, y: f64, z: f64) {
        self.multiply_left(Self::new([[x, 0.0, 0.0], [0.0, y, 0.0], [0.0, 0.0, z]]));
    }

    fn rotate_xy(&mut self, degrees: f64) {
        let radians = degrees.to_radians();
        let (sin, cos) = radians.sin_cos();
        self.multiply_left(Self::new([
            [cos, sin, 0.0],
            [-sin, cos, 0.0],
            [0.0, 0.0, 1.0],
        ]));
    }

    fn rotate_yz(&mut self, degrees: f64) {
        let radians = degrees.to_radians();
        let (sin, cos) = radians.sin_cos();
        self.multiply_left(Self::new([
            [1.0, 0.0, 0.0],
            [0.0, cos, sin],
            [0.0, -sin, cos],
        ]));
    }

    fn shear_z(&mut self, x_factor: f64, y_factor: f64) {
        self.multiply_left(Self::new([
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [x_factor, y_factor, 1.0],
        ]));
    }

    fn transform(self, point: [f64; 3]) -> [f64; 3] {
        [
            self.values[0][0] * point[0]
                + self.values[0][1] * point[1]
                + self.values[0][2] * point[2],
            self.values[1][0] * point[0]
                + self.values[1][1] * point[1]
                + self.values[1][2] * point[2],
            self.values[2][0] * point[0]
                + self.values[2][1] * point[1]
                + self.values[2][2] * point[2],
        ]
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct WorldRay {
    pub(crate) origin: [f64; 3],
    pub(crate) direction: [f64; 3],
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct IsoHDPerspective {
    world_to_map_matrix: Matrix3,
    map_to_world_matrix: Matrix3,
    scale: f64,
}

impl Default for IsoHDPerspective {
    fn default() -> Self {
        Self::new(135.0, 60.0, 1.0)
    }
}

impl IsoHDPerspective {
    /// Construct the source perspective from Dynmap configuration values.
    ///
    /// Dynmap stores azimuth as degrees from north and applies a +90 degree
    /// coordinate adjustment before building its matrix. Scale is rounded up
    /// and clamped to the same bounds as the pinned implementation.
    pub(crate) fn new(azimuth_degrees: f64, inclination_degrees: f64, scale: f64) -> Self {
        let (azimuth, inclination, scale) =
            normalize_configuration(azimuth_degrees, inclination_degrees, scale);

        let inclination_radians = inclination.to_radians();
        let sin_inclination = inclination_radians.sin();
        let mut world_to_map = Matrix3::new([[0.0, 0.0, -1.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]);
        world_to_map.rotate_xy(180.0 - azimuth);
        world_to_map.rotate_yz(90.0 - inclination);
        world_to_map.shear_z(0.0, (90.0 - inclination).to_radians().tan());
        world_to_map.scale(scale, scale, sin_inclination);

        let mut map_to_world = Matrix3::identity();
        map_to_world.scale(1.0 / scale, 1.0 / scale, 1.0 / sin_inclination);
        map_to_world.shear_z(0.0, -(90.0 - inclination).to_radians().tan());
        map_to_world.rotate_yz(-(90.0 - inclination));
        map_to_world.rotate_xy(-180.0 + azimuth);
        map_to_world.multiply_left(Matrix3::new([
            [0.0, -1.0, 0.0],
            [0.0, 0.0, 1.0],
            [-1.0, 0.0, 0.0],
        ]));

        Self {
            world_to_map_matrix: world_to_map,
            map_to_world_matrix: map_to_world,
            scale,
        }
    }

    pub(crate) fn world_to_map(&self, world: [f64; 3]) -> [f64; 3] {
        self.world_to_map_matrix.transform(world)
    }

    pub(crate) fn map_to_world(&self, map: [f64; 3]) -> [f64; 3] {
        self.map_to_world_matrix.transform(map)
    }

    #[cfg(test)]
    fn map_tile_for_world(&self, world: [f64; 3], tile_size: f64) -> (i64, i64) {
        self.map_tile_for_map(self.world_to_map(world), tile_size)
    }

    #[cfg(test)]
    fn map_tile_for_map(&self, map: [f64; 3], tile_size: f64) -> (i64, i64) {
        debug_assert!(tile_size > 0.0);
        (
            (map[0] / tile_size).floor() as i64,
            (map[1] / tile_size).floor() as i64,
        )
    }

    /// Build the same map-coordinate ray used by Dynmap's tile loop.
    /// `blocks_per_pixel` is the world-space resolution of the requested tile.
    /// Dynmap's matrix scales world coordinates before projecting them, so the
    /// corresponding map-plane distance is multiplied by `self.scale`.
    pub(crate) fn ray_for_map_tile_pixel(
        &self,
        pixel_x: u32,
        pixel_y: u32,
        tile_size: u32,
        tile_x: i64,
        tile_y: i64,
        min_height: f64,
        max_height: f64,
        blocks_per_pixel: f64,
    ) -> WorldRay {
        let map_units_per_pixel = blocks_per_pixel * self.scale;
        let x =
            tile_x as f64 * f64::from(tile_size) + (f64::from(pixel_x) + 0.5) * map_units_per_pixel;
        let y =
            tile_y as f64 * f64::from(tile_size) + (f64::from(pixel_y) + 0.5) * map_units_per_pixel;
        self.ray_for_map_pixel(x, y, min_height, max_height)
    }

    /// Return a conservative world-space X/Z bound for one projected tile.
    ///
    /// `IsoHDPerspective` tiles live on the projected map plane, not on a
    /// world X/Z rectangle. Dynmap derives required chunks by transforming
    /// the projected tile volume back into world space and then clipping the
    /// candidate chunks against that volume. This helper intentionally keeps
    /// the first step conservative: all eight inverse-transformed volume
    /// corners are included, so no chunk that can intersect a ray is lost.
    pub(crate) fn world_xz_bounds_for_map_tile(
        &self,
        tile_x: i64,
        tile_y: i64,
        tile_size: u32,
        blocks_per_pixel: f64,
        min_height: f64,
        max_height: f64,
    ) -> (i64, i64, i64, i64) {
        let map_units_per_pixel = blocks_per_pixel * self.scale;
        let tile_map_size = f64::from(tile_size) * map_units_per_pixel;
        let min_map_x = tile_x as f64 * tile_map_size - self.scale;
        let max_map_x = (tile_x as f64 + 1.0) * tile_map_size + self.scale;
        let min_map_y = tile_y as f64 * tile_map_size - self.scale;
        let max_map_y = (tile_y as f64 + 1.0) * tile_map_size + self.scale;
        let (min_height, max_height) = (min_height.min(max_height), min_height.max(max_height));
        let mut min_world_x = f64::INFINITY;
        let mut max_world_x = f64::NEG_INFINITY;
        let mut min_world_z = f64::INFINITY;
        let mut max_world_z = f64::NEG_INFINITY;

        for map_x in [min_map_x, max_map_x] {
            for map_y in [min_map_y, max_map_y] {
                for world_height in [min_height, max_height] {
                    let world = self.map_to_world([map_x, map_y, world_height]);
                    min_world_x = min_world_x.min(world[0]);
                    max_world_x = max_world_x.max(world[0]);
                    min_world_z = min_world_z.min(world[2]);
                    max_world_z = max_world_z.max(world[2]);
                }
            }
        }

        // Include the boundary block on both sides. The extra block also
        // keeps floor-division from dropping a chunk when the inverse
        // transform lands exactly on a chunk edge.
        (
            min_world_x.floor() as i64 - 1,
            max_world_x.ceil() as i64 + 1,
            min_world_z.floor() as i64 - 1,
            max_world_z.ceil() as i64 + 1,
        )
    }

    /// Check the projected map-plane overlap between a world chunk volume and
    /// one tile. The required-chunk scan first uses the conservative X/Z bound
    /// above, then applies this inexpensive projection filter before reading a
    /// chunk payload. This mirrors Dynmap's later polygon clipping step while
    /// keeping the first Rust port independent of its polygon classes.
    pub(crate) fn projected_tile_intersects_chunk(
        &self,
        tile_x: i64,
        tile_y: i64,
        tile_size: u32,
        blocks_per_pixel: f64,
        min_height: f64,
        max_height: f64,
        chunk_x: i64,
        chunk_z: i64,
    ) -> bool {
        let map_units_per_pixel = blocks_per_pixel * self.scale;
        let tile_map_size = f64::from(tile_size) * map_units_per_pixel;
        let tile_min_x = tile_x as f64 * tile_map_size - self.scale;
        let tile_max_x = (tile_x as f64 + 1.0) * tile_map_size + self.scale;
        let tile_min_y = tile_y as f64 * tile_map_size - self.scale;
        let tile_max_y = (tile_y as f64 + 1.0) * tile_map_size + self.scale;
        let (min_height, max_height) = (min_height.min(max_height), min_height.max(max_height));
        let world_min_x = chunk_x as f64 * 16.0;
        let world_max_x = world_min_x + 16.0;
        let world_min_z = chunk_z as f64 * 16.0;
        let world_max_z = world_min_z + 16.0;
        let mut min_map_x = f64::INFINITY;
        let mut max_map_x = f64::NEG_INFINITY;
        let mut min_map_y = f64::INFINITY;
        let mut max_map_y = f64::NEG_INFINITY;

        for world_x in [world_min_x, world_max_x] {
            for world_z in [world_min_z, world_max_z] {
                for world_height in [min_height, max_height] {
                    let map = self.world_to_map([world_x, world_height, world_z]);
                    min_map_x = min_map_x.min(map[0]);
                    max_map_x = max_map_x.max(map[0]);
                    min_map_y = min_map_y.min(map[1]);
                    max_map_y = max_map_y.max(map[1]);
                }
            }
        }

        min_map_x <= tile_max_x
            && max_map_x >= tile_min_x
            && min_map_y <= tile_max_y
            && max_map_y >= tile_min_y
    }

    fn ray_for_map_pixel(
        &self,
        map_x: f64,
        map_y: f64,
        min_height: f64,
        max_height: f64,
    ) -> WorldRay {
        WorldRay {
            origin: self.map_to_world([map_x, map_y, max_height + 0.5]),
            direction: self.map_to_world([0.0, 0.0, (min_height - 0.5) - (max_height + 0.5)]),
        }
    }
}

fn normalize_configuration(
    azimuth_degrees: f64,
    inclination_degrees: f64,
    scale: f64,
) -> (f64, f64, f64) {
    let raw_azimuth = if azimuth_degrees.is_finite() {
        azimuth_degrees
    } else {
        135.0
    };
    let azimuth = (90.0 + raw_azimuth).rem_euclid(360.0);
    let inclination = if inclination_degrees.is_finite() {
        inclination_degrees.clamp(MIN_INCLINATION_DEGREES, MAX_INCLINATION_DEGREES)
    } else {
        60.0
    };
    let scale = if scale.is_finite() {
        scale.ceil().clamp(MIN_SCALE, MAX_SCALE)
    } else {
        MIN_SCALE
    };
    (azimuth, inclination, scale)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(left: [f64; 3], right: [f64; 3]) {
        for (left, right) in left.into_iter().zip(right) {
            assert!((left - right).abs() < 1.0e-9, "{left} != {right}");
        }
    }

    #[test]
    fn constructor_matches_dynmap_config_normalization() {
        let (azimuth, inclination, scale) = normalize_configuration(135.0, 10.0, 1.2);

        assert!((azimuth - 225.0).abs() < 1.0e-9);
        assert!((inclination - 20.0).abs() < 1.0e-9);
        assert!((scale - 2.0).abs() < 1.0e-9);
    }

    #[test]
    fn world_and_map_coordinates_round_trip_for_negative_world_coordinates() {
        let perspective = IsoHDPerspective::default();
        let world = [-17.25, -64.0, -31.5];

        assert_close(
            perspective.map_to_world(perspective.world_to_map(world)),
            world,
        );
    }

    #[test]
    fn negative_map_coordinates_use_floor_for_tile_selection() {
        let perspective = IsoHDPerspective::default();
        let world = [-1.0, -64.0, -1.0];
        let map = perspective.world_to_map(world);

        assert!(map[1] < 0.0);
        assert_eq!(perspective.map_tile_for_world(world, 128.0), (0, -1));
    }

    #[test]
    fn tile_pixel_ray_is_fixed_by_the_source_map_to_world_contract() {
        let perspective = IsoHDPerspective::new(135.0, 60.0, 1.0);
        let ray = perspective.ray_for_map_tile_pixel(0, 0, 128, -1, -2, -64.0, 320.0, 1.0);

        assert_close(
            ray.origin,
            perspective.map_to_world([-127.5, -255.5, 320.5]),
        );
        assert_close(ray.direction, perspective.map_to_world([0.0, 0.0, -385.0]));
        assert!(ray.direction[1] < 0.0);
    }

    #[test]
    fn tile_boundaries_floor_on_the_negative_side_without_truncation() {
        let perspective = IsoHDPerspective::default();
        let tile_size = 128.0;

        assert_eq!(
            perspective.map_tile_for_map([0.0, 0.0, 0.0], tile_size),
            (0, 0)
        );
        assert_eq!(
            perspective.map_tile_for_map([-1.0e-9, -1.0e-9, 0.0], tile_size),
            (-1, -1)
        );
        assert_eq!(
            perspective.map_tile_for_map([-128.0, 128.0, 0.0], tile_size),
            (-1, 1)
        );
        assert_eq!(
            perspective.map_tile_for_map([-128.0 - 1.0e-9, 128.0 + 1.0e-9, 0.0], tile_size),
            (-2, 1)
        );
    }

    #[test]
    fn map_tile_ray_has_a_fixed_direction_and_downward_y() {
        let perspective = IsoHDPerspective::default();
        let center = perspective.ray_for_map_tile_pixel(128, 128, 256, 0, 0, -64.0, 320.0, 1.0);
        let corner = perspective.ray_for_map_tile_pixel(0, 0, 256, 0, 0, -64.0, 320.0, 1.0);

        assert_close(center.direction, corner.direction);
        assert!(center.direction[1] < 0.0);
        assert!(center.direction[0].abs() > 0.0);
        assert!(center.direction[2].abs() > 0.0);
    }

    #[test]
    fn projected_tile_world_bounds_cover_origin_chunk() {
        let perspective = IsoHDPerspective::default();
        let (min_x, max_x, min_z, max_z) =
            perspective.world_xz_bounds_for_map_tile(0, 0, 256, 1.0, -64.0, 320.0);

        assert!(min_x <= 0 && max_x >= 15, "{min_x}..{max_x}");
        assert!(min_z <= 0 && max_z >= 15, "{min_z}..{max_z}");
        assert!(min_x < max_x);
        assert!(min_z < max_z);
    }

    #[test]
    fn projected_tile_world_bounds_are_ordered_for_negative_tiles() {
        let perspective = IsoHDPerspective::new(135.0, 60.0, 2.0);
        let (min_x, max_x, min_z, max_z) =
            perspective.world_xz_bounds_for_map_tile(-3, -2, 256, 8.0, 320.0, -64.0);

        assert!(min_x < max_x);
        assert!(min_z < max_z);
        assert!(min_x < 0 || max_x < 0);
        assert!(min_z != 0 || max_z != 0);
    }

    #[test]
    fn projected_tile_chunk_filter_accepts_chunk_under_map_plane_center() {
        let perspective = IsoHDPerspective::default();
        let world = perspective.map_to_world([128.0, 128.0, 0.0]);
        let chunk_x = (world[0].floor() as i64).div_euclid(16);
        let chunk_z = (world[2].floor() as i64).div_euclid(16);

        assert!(perspective
            .projected_tile_intersects_chunk(0, 0, 256, 1.0, -64.0, 320.0, chunk_x, chunk_z));
    }
}
