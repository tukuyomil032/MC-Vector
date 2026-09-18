/// Dynmap's `ShadowHDLighting` uses a 16-entry table derived from a 20%
/// per-level dropoff. Keep the profile explicit instead of hiding it in a
/// height-based approximation: sky light and emitted/block light are inputs
/// to the same level selection, while the directional face multiplier lives
/// in `geometry::Face`.
const DEFAULT_SHADOW_WEIGHT: f32 = 1.0;

pub(crate) fn light_factor(sky_light: u8, block_light: u8) -> f32 {
    let light_level = sky_light.max(block_light).min(15);
    shadow_scale(light_level, DEFAULT_SHADOW_WEIGHT)
}

pub(crate) fn shadow_scale(light_level: u8, shadow_weight: f32) -> f32 {
    let level = light_level.min(15);
    let per_level = (1.0 - 0.2 * shadow_weight.clamp(0.0, 1.0)).clamp(0.0, 1.0);
    per_level.powi(i32::from(15 - level))
}

pub(crate) fn apply_light(mut color: [u8; 4], factor: f32) -> [u8; 4] {
    for channel in &mut color[..3] {
        *channel = (f32::from(*channel) * factor).round().clamp(0.0, 255.0) as u8;
    }
    color
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_sky_or_emitted_light_preserves_colour() {
        assert!((light_factor(15, 0) - 1.0).abs() < f32::EPSILON);
        assert!((light_factor(0, 15) - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn shadow_scale_is_monotonic_and_uses_the_stronger_light_source() {
        assert!(light_factor(8, 0) < light_factor(12, 0));
        assert!((light_factor(4, 10) - light_factor(10, 4)).abs() < f32::EPSILON);
    }

    #[test]
    fn zero_shadow_weight_is_a_flat_profile() {
        for level in 0..=15 {
            assert!((shadow_scale(level, 0.0) - 1.0).abs() < f32::EPSILON);
        }
    }
}
