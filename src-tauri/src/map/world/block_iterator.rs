use super::chunk_view::ChunkLayer;

pub fn is_air_state(state: &str) -> bool {
    let block = state.split('|').next().unwrap_or(state);
    matches!(
        block,
        "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

pub fn surface_layer(layers: &[ChunkLayer], min_y: i32, max_y: i32) -> Option<&ChunkLayer> {
    layers
        .iter()
        .filter(|layer| layer.y >= min_y && layer.y < max_y && !is_air_state(&layer.state))
        .max_by_key(|layer| layer.y)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layer(y: i32, state: &str) -> ChunkLayer {
        ChunkLayer {
            y,
            state: state.to_string(),
            biome: "minecraft:plains".to_string(),
            sky_light: 15,
            block_light: 0,
        }
    }

    #[test]
    fn chooses_highest_non_air_layer_within_range() {
        let layers = vec![
            layer(64, "minecraft:stone"),
            layer(65, "minecraft:air"),
            layer(66, "minecraft:grass_block"),
            layer(400, "minecraft:diamond_block"),
        ];
        assert_eq!(surface_layer(&layers, -64, 320).expect("surface").y, 66);
    }
}
