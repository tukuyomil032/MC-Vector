use super::ray::Ray;

pub(crate) trait PerspectiveRenderer {
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
    ) -> Ray;
}
