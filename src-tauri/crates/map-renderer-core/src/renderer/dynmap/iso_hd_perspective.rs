//! Isometric projection derived from Dynmap's `IsoHDPerspective` coordinate
//! contract.

use super::patch::Ray;
use super::transform::Matrix3D;
use super::types::Vec3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IsoProjection {
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub origin_x: f64,
    pub origin_y: f64,
    pub world_y: f64,
    world_to_map: Matrix3D,
    map_to_world: Matrix3D,
}

impl IsoProjection {
    pub fn new(width: u32, height: u32, scale: f64, world_y: f64) -> Self {
        Self::with_dynmap_defaults(width, height, scale, world_y)
    }

    pub fn with_dynmap_defaults(width: u32, height: u32, scale: f64, world_y: f64) -> Self {
        let azimuth = 90.0 + 135.0;
        let inclination = 60.0;
        let mut world_to_map =
            Matrix3D::from_rows([[0.0, 0.0, -1.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]);
        world_to_map = world_to_map
            .rotate_xy(180.0 - azimuth)
            .rotate_yz(90.0 - inclination)
            .sheared_z(0.0, (90.0 - inclination).to_radians().tan())
            .scaled(1.0, 1.0, inclination.to_radians().sin());
        let map_to_world = world_to_map
            .inverse()
            .expect("Dynmap default perspective transform must be invertible");
        Self {
            width,
            height,
            scale,
            origin_x: f64::from(width) * 0.5,
            origin_y: f64::from(height) * 0.5,
            world_y,
            world_to_map,
            map_to_world,
        }
    }

    pub fn world_to_map(self, world: Vec3) -> (f64, f64) {
        let mapped = self.world_to_map.transform(world);
        (mapped.x, mapped.y)
    }

    pub fn map_to_world(self, map_x: f64, map_y: f64) -> Vec3 {
        self.unproject_at_world_y(map_x, map_y, self.world_y)
    }

    pub fn project(self, world: Vec3) -> (f64, f64) {
        let (map_x, map_z) = self.world_to_map(world);
        (
            self.origin_x + map_x * self.scale,
            self.origin_y - map_z * self.scale,
        )
    }

    pub fn unproject(self, screen_x: f64, screen_y: f64) -> Vec3 {
        let map_x = (screen_x - self.origin_x) / self.scale;
        let map_y = (self.origin_y - screen_y) / self.scale;
        self.map_to_world(map_x, map_y)
    }

    pub fn ray_for_boundary(
        self,
        screen_x: f64,
        screen_y: f64,
        min_y: i32,
        max_y_exclusive: i32,
    ) -> Ray {
        let top = self.unproject_at_world_y(
            (screen_x - self.origin_x) / self.scale,
            (self.origin_y - screen_y) / self.scale,
            f64::from(max_y_exclusive) + 0.5,
        );
        let bottom = self.unproject_at_world_y(
            (screen_x - self.origin_x) / self.scale,
            (self.origin_y - screen_y) / self.scale,
            f64::from(min_y) - 0.5,
        );
        Ray::new(top, bottom - top)
    }

    fn unproject_at_world_y(self, map_x: f64, map_y: f64, world_y: f64) -> Vec3 {
        let rows = self.map_to_world.rows();
        let map_z = (world_y - rows[1][0] * map_x - rows[1][1] * map_y) / rows[1][2];
        self.map_to_world.transform(Vec3::new(map_x, map_y, map_z))
    }
}

#[cfg(test)]
mod tests {
    use super::IsoProjection;
    use crate::renderer::dynmap::types::Vec3;

    #[test]
    fn world_map_round_trip_preserves_horizontal_coordinates() {
        let projection = IsoProjection::new(256, 256, 4.0, 37.0);
        let point = Vec3::new(-17.25, 37.0, 2048.125);
        let (map_x, map_z) = projection.world_to_map(point);
        let restored = projection.map_to_world(map_x, map_z);
        assert!((restored.x - point.x).abs() < 1e-9);
        assert!((restored.z - point.z).abs() < 1e-9);
    }

    #[test]
    fn screen_round_trip_preserves_cursor_anchor() {
        let projection = IsoProjection::new(512, 384, 2.5, 16.0);
        let point = Vec3::new(7.25, 16.0, -3.5);
        let screen = projection.project(point);
        let restored = projection.unproject(screen.0, screen.1);
        assert!((restored.x - point.x).abs() < 1e-9);
        assert!((restored.z - point.z).abs() < 1e-9);
    }
}
