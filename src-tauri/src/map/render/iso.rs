use super::perspective::PerspectiveRenderer;
use super::ray::{Ray, Vec3};
pub(crate) use crate::map::renderer::IsoHDPerspective;

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
        let ray = self.ray_for_world_tile_pixel(
            pixel_x,
            pixel_y,
            tile_size,
            center_x,
            center_z,
            blocks_per_pixel,
            0.0,
            0.0,
            384.0,
        );
        Ray {
            origin: Vec3::new(
                ray.origin[0] as f32,
                ray.origin[1] as f32,
                ray.origin[2] as f32,
            ),
            direction: Vec3::new(
                ray.direction[0] as f32,
                ray.direction[1] as f32,
                ray.direction[2] as f32,
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
