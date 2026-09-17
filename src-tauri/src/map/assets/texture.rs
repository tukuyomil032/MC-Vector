pub(crate) const DEFAULT_UV: [f32; 4] = [0.0, 0.0, 16.0, 16.0];

pub(crate) fn sample(texture: &[u8], uv: [f32; 4], rotation: u32) -> Option<[u8; 4]> {
    let width = 16_usize;
    let height = 16_usize;
    if texture.len() < width * height * 4 {
        return None;
    }
    let u = ((uv[0] + uv[2]) * 0.5).clamp(0.0, 16.0);
    let v = ((uv[1] + uv[3]) * 0.5).clamp(0.0, 16.0);
    let mut x = u.floor() as usize;
    let mut y = v.floor() as usize;
    if rotation % 360 == 90 {
        (x, y) = (15 - y, x);
    } else if rotation % 360 == 180 {
        (x, y) = (15 - x, 15 - y);
    } else if rotation % 360 == 270 {
        (x, y) = (y, 15 - x);
    }
    x = x.min(width - 1);
    y = y.min(height - 1);
    let offset = (y * width + x) * 4;
    Some([
        texture[offset],
        texture[offset + 1],
        texture[offset + 2],
        texture[offset + 3],
    ])
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
}
