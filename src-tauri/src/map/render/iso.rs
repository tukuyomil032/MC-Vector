use super::perspective::PerspectiveRenderer;
use super::ray::{Ray, Vec3};
pub(crate) use crate::map::renderer::IsoHDPerspective;

impl PerspectiveRenderer for IsoHDPerspective {
    fn ray_for_tile_pixel(
        &self,
        pixel_x: u32,
        pixel_y: u32,
        tile_size: u32,
        tile_x: i64,
        tile_y: i64,
        blocks_per_pixel: f64,
        min_height: f64,
        max_height: f64,
    ) -> Ray {
        let ray = self.ray_for_map_tile_pixel(
            pixel_x,
            pixel_y,
            tile_size,
            tile_x,
            tile_y,
            min_height,
            max_height,
            blocks_per_pixel,
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
        let ray =
            IsoHDPerspective::default().ray_for_tile_pixel(128, 128, 256, 0, 0, 1.0, -64.0, 320.0);
        assert!(ray.direction.y < 0.0);
        assert!(ray.direction.x.abs() > 0.0);
        assert!(ray.direction.z.abs() > 0.0);
    }

    #[test]
    fn production_adapter_matches_source_map_tile_ray_for_tile_center() {
        let perspective = IsoHDPerspective::default();
        let actual = PerspectiveRenderer::ray_for_tile_pixel(
            &perspective,
            8,
            8,
            16,
            -1,
            -1,
            1.0,
            -64.0,
            320.0,
        );
        let expected = perspective.ray_for_map_tile_pixel(8, 8, 16, -1, -1, -64.0, 320.0, 1.0);

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
        let ray = PerspectiveRenderer::ray_for_tile_pixel(
            &perspective,
            0,
            0,
            16,
            -1,
            -1,
            1.0,
            -64.0,
            320.0,
        );

        assert!(ray.origin.x.is_finite());
        assert!(ray.origin.z.is_finite());
        assert!(ray.direction.y < 0.0);
    }

    #[test]
    fn production_tile_rays_keep_a_fixed_direction() {
        let perspective = IsoHDPerspective::default();
        let center = PerspectiveRenderer::ray_for_tile_pixel(
            &perspective,
            128,
            128,
            256,
            0,
            0,
            1.0,
            -64.0,
            320.0,
        );
        let corner = PerspectiveRenderer::ray_for_tile_pixel(
            &perspective,
            0,
            0,
            256,
            0,
            0,
            1.0,
            -64.0,
            320.0,
        );

        assert!((center.direction.x - corner.direction.x).abs() < 1.0e-5);
        assert!((center.direction.y - corner.direction.y).abs() < 1.0e-5);
        assert!((center.direction.z - corner.direction.z).abs() < 1.0e-5);
        assert!(center.direction.y < 0.0);
    }
}
