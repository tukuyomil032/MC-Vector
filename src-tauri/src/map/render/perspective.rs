use super::ray::{Ray, Vec3};

pub(crate) trait PerspectiveRenderer {
    fn ray_for_pixel(
        &self,
        pixel_x: u32,
        pixel_y: u32,
        tile_size: u32,
        center_x: f64,
        center_z: f64,
        blocks_per_pixel: f64,
    ) -> Ray;
}

pub(crate) fn clamp_pixel(value: f32, size: u32) -> f32 {
    value.clamp(0.0, size.saturating_sub(1) as f32)
}

pub(crate) fn world_center_ray(x: f64, z: f64, y: f64) -> Ray {
    Ray {
        origin: Vec3::new(x as f32, y as f32, z as f32),
        direction: Vec3::new(0.0, -1.0, 0.0),
    }
}
