pub fn is_air_state(state: &str) -> bool {
    let block = state.split('|').next().unwrap_or(state);
    matches!(
        block,
        "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_air_states_with_properties() {
        assert!(is_air_state("minecraft:air|"));
        assert!(is_air_state("minecraft:void_air|foo=bar"));
        assert!(!is_air_state("minecraft:stone|"));
    }
}
