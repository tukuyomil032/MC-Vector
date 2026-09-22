//! Isometric projection derived from Dynmap's `IsoHDPerspective` coordinate
//! contract.

use super::types::Vec3;

fn world_x_scale() -> f64 {
    1.0 / 2.0_f64.sqrt()
}

fn world_z_scale() -> f64 {
    3.0_f64.sqrt() / 8.0_f64.sqrt()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct IsoProjection {
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub origin_x: f64,
    pub origin_y: f64,
    pub world_y: f64,
}

impl IsoProjection {
    pub fn new(width: u32, height: u32, scale: f64, world_y: f64) -> Self {
        Self {
            width,
            height,
            scale,
            origin_x: f64::from(width) * 0.5,
            origin_y: f64::from(height) * 0.5,
            world_y,
        }
    }

    pub fn world_to_map(self, world: Vec3) -> (f64, f64) {
        (
            (world.x - world.z) * world_x_scale(),
            world.y * 0.5 - (world.x + world.z) * world_z_scale(),
        )
    }

    pub fn map_to_world(self, map_x: f64, map_z: f64) -> Vec3 {
        let sum = (self.world_y * 0.5 - map_z) / world_z_scale();
        let diff = map_x / world_x_scale();
        Vec3::new((sum + diff) * 0.5, self.world_y, (sum - diff) * 0.5)
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
        let map_z = (self.origin_y - screen_y) / self.scale;
        self.map_to_world(map_x, map_z)
    }
}

#[cfg(test)]
mod tests {
    use super::IsoProjection;
    use crate::map::renderer::dynmap::types::Vec3;

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
