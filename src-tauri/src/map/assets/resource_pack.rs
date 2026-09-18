use std::collections::HashMap;

/// Overlay resource-pack entries in priority order. Later packs win, matching
/// Minecraft's resource-pack stack semantics.
pub(crate) fn overlay_entries(
    base: &mut HashMap<String, Vec<u8>>,
    overlay: HashMap<String, Vec<u8>>,
) {
    base.extend(overlay);
}

pub(crate) fn is_resource_pack_path(path: &str) -> bool {
    path.starts_with("assets/")
        && (path.contains("/blockstates/")
            || path.contains("/models/")
            || path.contains("/textures/"))
        && (path.ends_with(".json") || path.ends_with(".png"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn later_resource_pack_entries_override_base_entries() {
        let mut base = HashMap::from([("assets/minecraft/test.txt".to_string(), vec![1])]);
        overlay_entries(
            &mut base,
            HashMap::from([("assets/minecraft/test.txt".to_string(), vec![2])]),
        );
        assert_eq!(base["assets/minecraft/test.txt"], vec![2]);
    }
}
