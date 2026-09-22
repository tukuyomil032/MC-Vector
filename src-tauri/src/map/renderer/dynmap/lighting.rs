//! Explicit sky/block-light handling derived from the Dynmap lighting hook.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lighting {
    brightness: [u8; 16],
    ambient: f32,
}

impl Lighting {
    pub const fn new(brightness: [u8; 16], ambient: f32) -> Self {
        Self {
            brightness,
            ambient,
        }
    }

    pub fn brightness_table(self) -> [u8; 16] {
        self.brightness
    }

    pub fn apply(self, color: [u8; 4], sky: u8, block: u8, shade: bool) -> [u8; 4] {
        self.apply_with_face(color, sky, block, shade, 1.0)
    }

    pub fn apply_with_face(
        self,
        color: [u8; 4],
        sky: u8,
        block: u8,
        shade: bool,
        face_factor: f32,
    ) -> [u8; 4] {
        let sky = self.brightness[usize::from(sky.min(15))] as f32 / 255.0;
        let block = self.brightness[usize::from(block.min(15))] as f32 / 255.0;
        let light = self.ambient.max(sky.max(block));
        let shade_factor = if shade { face_factor } else { 1.0 };
        [
            ((f32::from(color[0]) * light * shade_factor).round() as u8),
            ((f32::from(color[1]) * light * shade_factor).round() as u8),
            ((f32::from(color[2]) * light * shade_factor).round() as u8),
            color[3],
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::Lighting;

    #[test]
    fn sky_and_block_light_are_applied_without_touching_alpha() {
        let lighting = Lighting::new(
            [
                0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240,
            ],
            0.1,
        );
        let shaded = lighting.apply([200, 100, 50, 17], 8, 2, true);
        assert_eq!(shaded[3], 17);
        assert!(shaded[0] > shaded[1]);
        assert!(shaded[1] > shaded[2]);
    }
}
