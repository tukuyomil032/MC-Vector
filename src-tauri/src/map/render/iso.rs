use super::perspective::PerspectiveRenderer;
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
