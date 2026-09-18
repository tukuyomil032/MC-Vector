pub(crate) fn light_factor(sky_light: u8, block_light: u8, height: i32) -> f32 {
    let light = f32::from(sky_light.max(block_light)) / 15.0;
    let height_factor = ((height - 64) as f32 * 0.0025).clamp(-0.14, 0.22);
    (0.58 + light * 0.42 + height_factor).clamp(0.35, 1.25)
}

pub(crate) fn apply_light(mut color: [u8; 4], factor: f32) -> [u8; 4] {
    for channel in &mut color[..3] {
        *channel = (f32::from(*channel) * factor).round().clamp(0.0, 255.0) as u8;
    }
    color
}
