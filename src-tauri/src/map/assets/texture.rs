use std::cmp::{max, min};

pub(crate) const DEFAULT_UV: [f32; 4] = [0.0, 0.0, 16.0, 16.0];

#[derive(Clone, Debug)]
pub(crate) struct TextureImage {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) pixels: Vec<u8>,
    pub(crate) animated: bool,
}

impl TextureImage {
    pub(crate) fn from_png(bytes: &[u8], animated: bool) -> Result<Self, String> {
        let image = image::load_from_memory(bytes)
            .map_err(|error| format!("Invalid Minecraft texture PNG: {error}"))?
            .to_rgba8();
        let width = image.width();
        let height = image.height();
        if width == 0 || height == 0 || width > 4096 || height > 4096 {
            return Err("Minecraft texture dimensions are outside the supported range".to_string());
        }
        Ok(Self {
            width,
            height,
            pixels: image.into_raw(),
            animated,
        })
    }

    pub(crate) fn sample_uv(&self, uv: [f32; 4], rotation: u32, u: f32, v: f32) -> [u8; 4] {
        let (u, v) = match rotation % 360 {
            90 => (1.0 - v, u),
            180 => (1.0 - u, 1.0 - v),
            270 => (v, 1.0 - u),
            _ => (u, v),
        };
        let min_u = uv[0].min(uv[2]);
        let max_u = uv[0].max(uv[2]);
        let min_v = uv[1].min(uv[3]);
        let max_v = uv[1].max(uv[3]);
        let texture_u = min_u + (max_u - min_u) * u.clamp(0.0, 1.0);
        let texture_v = min_v + (max_v - min_v) * v.clamp(0.0, 1.0);
        let x = ((texture_u / 16.0) * self.width as f32).floor() as i32;
        let y = ((texture_v / 16.0) * self.height as f32).floor() as i32;
        self.pixel(x, y)
    }

    fn pixel(&self, x: i32, y: i32) -> [u8; 4] {
        let x = min(max(x, 0), self.width as i32 - 1) as usize;
        let y = min(max(y, 0), self.height as i32 - 1) as usize;
        let offset = (y * self.width as usize + x) * 4;
        [
            self.pixels[offset],
            self.pixels[offset + 1],
            self.pixels[offset + 2],
            self.pixels[offset + 3],
        ]
    }
}

pub(crate) fn sample(texture: &[u8], uv: [f32; 4], rotation: u32) -> Option<[u8; 4]> {
    if texture.len() < 16 * 16 * 4 {
        return None;
    }
    let image = TextureImage {
        width: 16,
        height: 16,
        pixels: texture.to_vec(),
        animated: false,
    };
    Some(image.sample_uv(uv, rotation, 0.5, 0.5))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_center_of_default_uv() {
        let mut texture = vec![0_u8; 16 * 16 * 4];
        let offset = (8 * 16 + 8) * 4;
        texture[offset..offset + 4].copy_from_slice(&[12, 34, 56, 78]);
        assert_eq!(sample(&texture, DEFAULT_UV, 0), Some([12, 34, 56, 78]));
    }

    #[test]
    fn rejects_short_texture_buffers() {
        assert_eq!(sample(&[0; 4], DEFAULT_UV, 0), None);
    }

    #[test]
    fn keeps_non_square_texture_dimensions_and_alpha() {
        let image = TextureImage {
            width: 32,
            height: 16,
            pixels: vec![255; 32 * 16 * 4],
            animated: true,
        };
        assert_eq!(image.sample_uv(DEFAULT_UV, 90, 0.25, 0.75), [255; 4]);
        assert!(image.animated);
    }
}
