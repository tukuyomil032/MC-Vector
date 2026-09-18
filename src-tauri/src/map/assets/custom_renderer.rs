#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MaterialKind {
    Opaque,
    Cutout,
    Translucent,
}

const CUTOUT_ALPHA_THRESHOLD: u8 = 128;

pub(crate) fn material_kind(state: &str) -> MaterialKind {
    let state = state.to_ascii_lowercase();
    if contains_any(
        &state,
        [
            "glass",
            "water",
            "lava",
            "ice",
            "slime",
            "honey",
            "powder_snow",
            "bubble_column",
        ],
    ) {
        MaterialKind::Translucent
    } else if contains_any(
        &state,
        [
            "leaves", "plant", "flower", "grass", "fern", "vine", "fence", "door", "pane", "bars",
            "chain", "rail", "torch", "lantern", "sign", "banner", "tripwire",
        ],
    ) {
        MaterialKind::Cutout
    } else {
        MaterialKind::Opaque
    }
}

fn contains_any<const N: usize>(state: &str, names: [&str; N]) -> bool {
    names.into_iter().any(|name| state.contains(name))
}

/// Apply the material alpha contract after a resolved model face has been
/// sampled. Cutout materials use alpha testing rather than blending, while
/// translucent materials keep the texture's original alpha for compositing.
pub(crate) fn apply_material_alpha(kind: MaterialKind, mut color: [u8; 4]) -> [u8; 4] {
    if matches!(kind, MaterialKind::Cutout) {
        color[3] = if color[3] < CUTOUT_ALPHA_THRESHOLD {
            0
        } else {
            255
        };
    }
    color
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
        assert_eq!(
            material_kind("minecraft:water[level=3]"),
            MaterialKind::Translucent
        );
        assert_eq!(material_kind("minecraft:oak_leaves"), MaterialKind::Cutout);
        assert_eq!(material_kind("minecraft:iron_bars"), MaterialKind::Cutout);
        assert_eq!(material_kind("minecraft:oak_sign"), MaterialKind::Cutout);
        assert_eq!(material_kind("minecraft:rail"), MaterialKind::Cutout);
        assert_eq!(material_kind("minecraft:stone"), MaterialKind::Opaque);
        assert!(is_air("minecraft:air[facing=north]"));
    }

    #[test]
    fn applies_cutout_alpha_test_without_changing_rgb() {
        assert_eq!(
            apply_material_alpha(MaterialKind::Cutout, [31, 47, 59, 127]),
            [31, 47, 59, 0]
        );
        assert_eq!(
            apply_material_alpha(MaterialKind::Cutout, [31, 47, 59, 128]),
            [31, 47, 59, 255]
        );
    }

    #[test]
    fn preserves_translucent_texture_alpha() {
        assert_eq!(
            apply_material_alpha(MaterialKind::Translucent, [31, 47, 59, 96]),
            [31, 47, 59, 96]
        );
    }
}
