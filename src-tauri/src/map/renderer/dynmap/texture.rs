//! Texture atlas contract for the Dynmap renderer.
//!
//! The atlas accepts decoded resource-pack pixels.  It does not synthesize a
//! colour when an asset is absent; callers receive a typed error instead.

use std::collections::BTreeMap;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct TextureImage {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<[u8; 4]>,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TextureError {
    InvalidDimensions,
    PixelCountMismatch,
    MissingTexture,
    NonFiniteUv,
}

impl TextureImage {
    pub fn new(width: u32, height: u32, pixels: Vec<[u8; 4]>) -> Result<Self, TextureError> {
        if width == 0 || height == 0 {
            return Err(TextureError::InvalidDimensions);
        }
        let expected = usize::try_from(width)
            .ok()
            .and_then(|width| {
                usize::try_from(height)
                    .ok()
                    .and_then(|height| width.checked_mul(height))
            })
            .ok_or(TextureError::InvalidDimensions)?;
        if pixels.len() != expected {
            return Err(TextureError::PixelCountMismatch);
        }
        Ok(Self {
            width,
            height,
            pixels,
        })
    }

    pub fn sample(&self, u: f64, v: f64) -> [u8; 4] {
        let u = u.rem_euclid(1.0);
        let v = v.rem_euclid(1.0);
        let x = ((u * f64::from(self.width)).floor() as u32).min(self.width - 1);
        let y = ((v * f64::from(self.height)).floor() as u32).min(self.height - 1);
        self.pixels[(y * self.width + x) as usize]
    }
}

#[derive(Debug, Clone, Default)]
pub struct TextureAtlas {
    textures: BTreeMap<i32, TextureImage>,
}

impl TextureAtlas {
    pub fn insert(&mut self, texture_index: i32, image: TextureImage) {
        self.textures.insert(texture_index, image);
    }

    pub fn sample(&self, texture_index: i32, u: f64, v: f64) -> Result<[u8; 4], TextureError> {
        if !u.is_finite() || !v.is_finite() {
            return Err(TextureError::NonFiniteUv);
        }
        self.textures
            .get(&texture_index)
            .ok_or(TextureError::MissingTexture)
            .map(|texture| texture.sample(u, v))
    }
}

#[cfg(test)]
mod tests {
    use super::{TextureAtlas, TextureError, TextureImage};

    #[test]
    fn uv_sampling_preserves_resource_pack_alpha() {
        let image = TextureImage::new(2, 1, vec![[255, 0, 0, 255], [0, 255, 0, 17]]).unwrap();
        let mut atlas = TextureAtlas::default();
        atlas.insert(7, image);
        assert_eq!(atlas.sample(7, 0.75, 0.5).unwrap(), [0, 255, 0, 17]);
    }

    #[test]
    fn missing_texture_is_an_error_not_a_guessed_colour() {
        assert_eq!(
            TextureAtlas::default().sample(99, 0.5, 0.5),
            Err(TextureError::MissingTexture)
        );
    }
}
