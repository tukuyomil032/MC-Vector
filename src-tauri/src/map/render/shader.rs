use super::geometry::Face;
use super::lighting::{apply_light, light_factor};

pub(crate) fn shade_surface(
    color: [u8; 4],
    block_y: i32,
    sky_light: u8,
    block_light: u8,
    face: Face,
) -> [u8; 4] {
    let lighting = light_factor(sky_light, block_light);
    apply_light(color, lighting * face.dynmap_shade(block_y))
}
