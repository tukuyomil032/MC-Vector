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
        reference_y: f64,
        min_height: f64,
        max_height: f64,
    ) -> Ray {
        let ray = self.ray_for_world_tile_pixel(
            pixel_x,
            pixel_y,
            tile_size,
            center_x,
            center_z,
            blocks_per_pixel,
            reference_y,
            min_height,
            max_height,
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
        let ray = IsoHDPerspective::default()
            .ray_for_pixel(128, 128, 256, 0.0, 0.0, 1.0, 64.0, -64.0, 320.0);
        assert!(ray.direction.y < 0.0);
        assert!(ray.direction.x.abs() > 0.0);
        assert!(ray.direction.z.abs() > 0.0);
    }

    #[test]
    fn production_adapter_matches_source_world_tile_ray_for_tile_center() {
        let perspective = IsoHDPerspective::default();
        let actual = perspective.ray_for_pixel(8, 8, 16, -8.0, -8.0, 1.0, 64.0, -64.0, 320.0);
        let expected =
            perspective.ray_for_world_tile_pixel(8, 8, 16, -8.0, -8.0, 1.0, 64.0, -64.0, 320.0);

        assert!((f64::from(actual.origin.x) - expected.origin[0]).abs() < 1.0e-5);
        assert!((f64::from(actual.origin.y) - expected.origin[1]).abs() < 1.0e-5);
        assert!((f64::from(actual.origin.z) - expected.origin[2]).abs() < 1.0e-5);
        assert!((f64::from(actual.direction.x) - expected.direction[0]).abs() < 1.0e-5);
        assert!((f64::from(actual.direction.y) - expected.direction[1]).abs() < 1.0e-5);
        assert!((f64::from(actual.direction.z) - expected.direction[2]).abs() < 1.0e-5);
    }

    #[test]
    fn production_adapter_preserves_negative_tile_coordinates() {
        let perspective = IsoHDPerspective::default();
        let ray = perspective.ray_for_pixel(0, 0, 16, -8.0, -8.0, 1.0, 64.0, -64.0, 320.0);

        assert!(ray.origin.x.is_finite());
        assert!(ray.origin.z.is_finite());
        assert!(ray.direction.y < 0.0);
    }

    #[test]
    fn production_center_ray_hits_the_configured_reference_surface() {
        let perspective = IsoHDPerspective::default();
        let center_x = -8.0;
        let center_z = 24.0;
        let reference_y = 64.0;
        let ray =
            perspective.ray_for_pixel(0, 0, 1, center_x, center_z, 1.0, reference_y, -64.0, 320.0);
        let distance = (ray.origin.y - reference_y as f32) / -ray.direction.y;
        let at_reference = (
            f64::from(ray.origin.x + ray.direction.x * distance),
            f64::from(ray.origin.z + ray.direction.z * distance),
        );

        assert!((at_reference.0 - center_x).abs() < 1.0e-4);
        assert!((at_reference.1 - center_z).abs() < 1.0e-4);
    }
}
