#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Face {
    Down,
    Up,
    North,
    South,
    West,
    East,
}

impl Face {
    /// Directional multiplier used by Dynmap's texture-pack shader when a
    /// world brightness table is not available. `Up` is the face entered by
    /// `Y_MINUS` in Dynmap's ray traversal, while `Down` is `Y_PLUS`.
    ///
    /// Source: `TexturePackHDShader.processBlock` at the pinned Dynmap ref.
    pub(crate) const fn dynmap_shade(self, block_y: i32) -> f32 {
        match self {
            Self::Up => {
                if block_y & 1 == 0 {
                    0xD9 as f32 / 255.0
                } else {
                    0xE6 as f32 / 255.0
                }
            }
            Self::Down | Self::North | Self::South => 1.0,
            Self::West | Self::East => 0xA0 as f32 / 255.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_dynmap_texture_pack_face_coefficients() {
        assert!((Face::West.dynmap_shade(64) - 160.0 / 255.0).abs() < f32::EPSILON);
        assert!((Face::North.dynmap_shade(64) - 1.0).abs() < f32::EPSILON);
        assert!((Face::Down.dynmap_shade(64) - 1.0).abs() < f32::EPSILON);
        assert!((Face::Up.dynmap_shade(64) - 217.0 / 255.0).abs() < f32::EPSILON);
        assert!((Face::Up.dynmap_shade(65) - 230.0 / 255.0).abs() < f32::EPSILON);
    }
}
