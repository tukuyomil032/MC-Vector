/// Vanilla-inspired biome tint fallback used when the selected asset source
/// does not contain a Minecraft colormap. The resolver prefers the actual
/// `colormap/grass.png` and `colormap/foliage.png` textures when available.
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

/// Return the approximate temperature/downfall coordinates used by the
/// vanilla grass and foliage colormaps. The server bridge currently sends the
/// biome key rather than the full biome registry entry, so uncommon custom
/// biomes intentionally use the plains-like fallback until biome climate
/// metadata is added to the protocol.
pub(crate) fn colormap_coordinates(biome: &str) -> (f32, f32) {
    let biome = biome.to_ascii_lowercase();
    if biome.contains("desert") || biome.contains("badlands") || biome.contains("savanna") {
        (1.0, 0.0)
    } else if biome.contains("snow")
        || biome.contains("ice")
        || biome.contains("frozen")
        || biome.contains("grove")
    {
        (0.0, 0.5)
    } else if biome.contains("jungle") || biome.contains("bamboo") {
        (0.95, 0.9)
    } else if biome.contains("swamp") || biome.contains("mangrove") {
        (0.8, 0.9)
    } else if biome.contains("taiga") {
        (0.25, 0.8)
    } else {
        (0.8, 0.4)
    }
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
