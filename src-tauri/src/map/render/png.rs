pub(crate) fn validate_rgba(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    let expected = width as usize * height as usize * 4;
    if pixels.len() != expected {
        return Err("Rendered tile RGBA buffer has an invalid size".to_string());
    }
    Ok(())
}
