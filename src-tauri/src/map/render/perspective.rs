use super::ray::Ray;

pub(crate) trait PerspectiveRenderer {
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
    ) -> Ray;
}
