#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MaterialKind {
    Opaque,
    Cutout,
    Translucent,
}

pub(crate) fn material_kind(state: &str) -> MaterialKind {
    let state = state.to_ascii_lowercase();
    if state.contains("glass")
        || state.contains("water")
        || state.contains("ice")
        || state.contains("slime")
    {
        MaterialKind::Translucent
    } else if state.contains("leaves")
        || state.contains("plant")
        || state.contains("flower")
        || state.contains("grass")
        || state.contains("vine")
        || state.contains("fence")
        || state.contains("door")
    {
        MaterialKind::Cutout
    } else {
        MaterialKind::Opaque
    }
}

pub(crate) fn is_air(state: &str) -> bool {
    matches!(
        state.split(['[', '|']).next(),
        Some("minecraft:air") | Some("minecraft:cave_air") | Some("minecraft:void_air")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_transparent_and_cutout_materials() {
        assert_eq!(material_kind("minecraft:glass"), MaterialKind::Translucent);
        assert_eq!(material_kind("minecraft:oak_leaves"), MaterialKind::Cutout);
        assert_eq!(material_kind("minecraft:stone"), MaterialKind::Opaque);
        assert!(is_air("minecraft:air[facing=north]"));
    }
}
