pub(crate) fn alpha_over(background: [u8; 4], foreground: [u8; 4]) -> [u8; 4] {
    let source_alpha = f32::from(foreground[3]) / 255.0;
    let destination_alpha = f32::from(background[3]) / 255.0;
    let alpha = source_alpha + destination_alpha * (1.0 - source_alpha);
    if alpha <= f32::EPSILON {
        return [0, 0, 0, 0];
    }
    let mut output = [0; 4];
    for channel in 0..3 {
        let premultiplied = f32::from(foreground[channel]) * source_alpha
            + f32::from(background[channel]) * destination_alpha * (1.0 - source_alpha);
        output[channel] = (premultiplied / alpha).round().clamp(0.0, 255.0) as u8;
    }
    output[3] = (alpha * 255.0).round().clamp(0.0, 255.0) as u8;
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blends_translucent_foreground_over_opaque_background() {
        assert_eq!(alpha_over([0, 0, 255, 255], [255, 0, 0, 128])[3], 255);
        assert!(alpha_over([0, 0, 255, 255], [255, 0, 0, 128])[0] > 100);
    }
}
