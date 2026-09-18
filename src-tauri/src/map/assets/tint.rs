/// Vanilla-inspired biome tint fallback. Exact colormap files can be added to
/// the asset resolver later; keeping tinting behind this interface means the
/// renderer never needs to know where the color came from.
pub(crate) fn tint_for(state: &str, biome: &str) -> Option<[u8; 3]> {
    let state = state.to_ascii_lowercase();
    let biome = biome.to_ascii_lowercase();
    if state.contains("water") {
        return Some(if biome.contains("swamp") {
            [61, 110, 80]
        } else {
            [63, 118, 228]
        });
    }
    if state.contains("grass") || state.contains("fern") || state.contains("vine") {
        return Some(if biome.contains("jungle") {
            [89, 187, 75]
        } else if biome.contains("swamp") {
            [106, 133, 67]
        } else if biome.contains("savanna") || biome.contains("desert") {
            [154, 174, 85]
        } else if biome.contains("taiga") || biome.contains("grove") {
            [102, 159, 80]
        } else {
            [126, 185, 88]
        });
    }
    if state.contains("leaves") || state.contains("azalea") {
        return Some(if biome.contains("jungle") {
            [58, 167, 74]
        } else if biome.contains("swamp") {
            [74, 117, 62]
        } else if biome.contains("birch") {
            [112, 172, 74]
        } else {
            [75, 145, 67]
        });
    }
    None
}

pub(crate) fn apply_tint(mut color: [u8; 4], tint: Option<[u8; 3]>) -> [u8; 4] {
    let Some(tint) = tint else {
        return color;
    };
    for (channel, tint_channel) in color[..3].iter_mut().zip(tint) {
        *channel = ((*channel as u16 * tint_channel as u16) / 255) as u8;
    }
    color
}
