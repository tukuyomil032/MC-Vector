use super::perspective::{world_center_ray, PerspectiveRenderer};
use super::ray::{Ray, Vec3};

/// The camera constants mirror Dynmap's default HD isometric orientation:
/// the world is viewed from above with a fixed azimuth and a non-zero
/// elevation. The surface renderer uses its vertical component for lighting
/// and can use the full ray for block-model rendering.
#[derive(Clone, Copy, Debug)]
pub(crate) struct IsoHDPerspective {
    pub(crate) azimuth_degrees: f64,
    pub(crate) elevation_degrees: f64,
}

impl Default for IsoHDPerspective {
    fn default() -> Self {
        Self {
            azimuth_degrees: 45.0,
            elevation_degrees: 55.0,
        }
    }
}

impl IsoHDPerspective {
    pub(crate) fn height_shade(self, height: i32, neighbour_height: Option<i32>) -> f32 {
        let height_delta = neighbour_height
            .map(|neighbour| (height - neighbour) as f32)
            .unwrap_or(0.0);
        let elevation = self.elevation_degrees.to_radians().sin() as f32;
        (1.0 + (height_delta * 0.025 * elevation)).clamp(0.65, 1.35)
    }

    pub(crate) fn project_point(
        self,
        world_x: f64,
        world_y: f64,
        world_z: f64,
        center_x: f64,
        center_y: f64,
        center_z: f64,
        scale: f64,
    ) -> (f32, f32) {
        let azimuth = self.azimuth_degrees.to_radians();
        let elevation = self.elevation_degrees.to_radians();
        let dx = world_x - center_x;
        let dz = world_z - center_z;
        let screen_x = (dx * azimuth.cos() - dz * azimuth.sin()) * scale;
        let screen_y = (dx * azimuth.sin() + dz * azimuth.cos()) * scale
            - ((world_y - center_y) * elevation.sin() * scale);
        (screen_x as f32, screen_y as f32)
    }

    pub(crate) fn project_block(
        self,
        world_x: f64,
        world_y: f64,
        world_z: f64,
        center_x: f64,
        center_z: f64,
        scale: f64,
    ) -> (f32, f32) {
        self.project_point(world_x, world_y, world_z, center_x, 0.0, center_z, scale)
    }
}

impl PerspectiveRenderer for IsoHDPerspective {
    fn ray_for_pixel(
        &self,
        pixel_x: u32,
        pixel_y: u32,
        tile_size: u32,
        center_x: f64,
        center_z: f64,
        blocks_per_pixel: f64,
    ) -> Ray {
        let local_x = f64::from(pixel_x) + 0.5 - f64::from(tile_size) / 2.0;
        let local_z = f64::from(pixel_y) + 0.5 - f64::from(tile_size) / 2.0;
        let azimuth = self.azimuth_degrees.to_radians();
        let x = center_x + (local_x * azimuth.cos() + local_z * azimuth.sin()) * blocks_per_pixel;
        let z = center_z + (-local_x * azimuth.sin() + local_z * azimuth.cos()) * blocks_per_pixel;
        let elevation = self.elevation_degrees.to_radians();
        let origin = Vec3::new(x as f32, 384.0, z as f32);
        Ray {
            origin,
            direction: Vec3::new(
                (elevation.cos() * azimuth.sin()) as f32,
                (-elevation.sin()) as f32,
                (elevation.cos() * azimuth.cos()) as f32,
            ),
        }
    }
}

pub(crate) fn top_down_ray(x: f64, z: f64) -> Ray {
    world_center_ray(x, z, 384.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::map::render::perspective::PerspectiveRenderer;

    #[test]
    fn creates_a_non_vertical_isometric_ray() {
        let ray = IsoHDPerspective::default().ray_for_pixel(128, 128, 256, 0.0, 0.0, 1.0);
        assert!(ray.direction.y < 0.0);
        assert!(ray.direction.x.abs() > 0.0);
        assert!(ray.direction.z.abs() > 0.0);
    }
}
