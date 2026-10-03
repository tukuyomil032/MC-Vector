//! Stable RGBA PNG output for renderer tiles.

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum PngError {
    InvalidDimensions,
    PixelCountMismatch,
    Encode,
}

pub fn encode_rgba(width: u32, height: u32, pixels: &[[u8; 4]]) -> Result<Vec<u8>, PngError> {
    if width == 0 || height == 0 {
        return Err(PngError::InvalidDimensions);
    }
    let count = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or(PngError::InvalidDimensions)?;
    if pixels.len() != count {
        return Err(PngError::PixelCountMismatch);
    }

    let mut raw = Vec::with_capacity(count * 4);
    for pixel in pixels {
        raw.extend_from_slice(pixel);
    }
    let mut output = Vec::new();
    let mut encoder = png::Encoder::new(&mut output, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|_| PngError::Encode)?;
    writer
        .write_image_data(&raw)
        .map_err(|_| PngError::Encode)?;
    drop(writer);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::encode_rgba;

    #[test]
    fn identical_pixels_have_identical_png_bytes() {
        let pixels = vec![[10, 20, 30, 255]; 4];
        assert_eq!(
            encode_rgba(2, 2, &pixels).unwrap(),
            encode_rgba(2, 2, &pixels).unwrap()
        );
    }
}
