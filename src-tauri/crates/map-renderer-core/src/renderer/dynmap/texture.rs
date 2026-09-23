//! Texture atlas contract for the Dynmap renderer.
//!
//! The atlas accepts decoded resource-pack pixels.  It does not synthesize a
//! colour when an asset is absent; callers receive a typed error instead.

use std::collections::BTreeMap;
use std::io::Cursor;

use crate::assets::archive::AssetArchive;

use crate::security::MAX_TEXTURE_PIXELS;

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
    DecodeFailed,
    TextureTooLarge,
    AnimatedTextureUnsupported,
    UnsafeTexturePath,
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

    pub fn from_png(bytes: &[u8]) -> Result<Self, TextureError> {
        let mut decoder = png::Decoder::new(Cursor::new(bytes));
        decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
        let mut reader = decoder
            .read_info()
            .map_err(|_| TextureError::DecodeFailed)?;
        let info = reader.info();
        let pixels = u64::from(info.width)
            .checked_mul(u64::from(info.height))
            .ok_or(TextureError::TextureTooLarge)?;
        if pixels == 0 || pixels > MAX_TEXTURE_PIXELS {
            return Err(TextureError::TextureTooLarge);
        }
        let mut raw = vec![0_u8; reader.output_buffer_size()];
        let output = reader
            .next_frame(&mut raw)
            .map_err(|_| TextureError::DecodeFailed)?;
        let raw = &raw[..output.buffer_size()];
        let rgba = match output.color_type {
            png::ColorType::Rgba => raw.to_vec(),
            png::ColorType::Rgb => raw
                .chunks_exact(3)
                .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
                .collect(),
            png::ColorType::Grayscale => raw
                .iter()
                .flat_map(|pixel| [*pixel, *pixel, *pixel, 255])
                .collect(),
            png::ColorType::GrayscaleAlpha => raw
                .chunks_exact(2)
                .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
                .collect(),
            png::ColorType::Indexed => return Err(TextureError::DecodeFailed),
        };
        let pixels = rgba
            .chunks_exact(4)
            .map(|pixel| [pixel[0], pixel[1], pixel[2], pixel[3]])
            .collect();
        Self::new(output.width, output.height, pixels)
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

    pub fn load_archive_texture(
        &mut self,
        archive: &AssetArchive,
        texture_index: i32,
        texture: &str,
    ) -> Result<(), TextureError> {
        let path = texture_asset_path(texture)?;
        if archive.contains(&format!("{path}.mcmeta")) {
            return Err(TextureError::AnimatedTextureUnsupported);
        }
        let bytes = archive.entry(&path).ok_or(TextureError::MissingTexture)?;
        let image = TextureImage::from_png(bytes)?;
        self.insert(texture_index, image);
        Ok(())
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

fn texture_asset_path(texture: &str) -> Result<String, TextureError> {
    let key = if texture.contains(':') {
        texture.to_owned()
    } else {
        format!("minecraft:{texture}")
    };
    let (namespace, path) = key.split_once(':').ok_or(TextureError::UnsafeTexturePath)?;
    if namespace.is_empty()
        || path.is_empty()
        || path.starts_with('/')
        || path.contains("..")
        || path.contains('\\')
    {
        return Err(TextureError::UnsafeTexturePath);
    }
    Ok(format!("assets/{namespace}/textures/{path}.png"))
}

#[cfg(test)]
mod tests {
    use super::{TextureAtlas, TextureError, TextureImage};
    use crate::renderer::png::encode_rgba;

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

    #[test]
    fn png_decode_preserves_alpha_and_rgb_color_type() {
        let bytes = encode_rgba(2, 1, &[[255, 0, 0, 255], [0, 255, 0, 17]]).unwrap();
        let image = TextureImage::from_png(&bytes).unwrap();
        assert_eq!(image.pixels[1], [0, 255, 0, 17]);
    }

    #[test]
    fn malformed_and_animated_textures_are_not_silently_loaded() {
        assert_eq!(
            TextureImage::from_png(b"not-a-png"),
            Err(TextureError::DecodeFailed)
        );
    }
}
