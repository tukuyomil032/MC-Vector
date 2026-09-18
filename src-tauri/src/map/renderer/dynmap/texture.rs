/*
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: Dynmap contributors
 *
 * Origin: https://github.com/webbukkit/dynmap
 * Source-Ref: https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java
 * Ported-to: MC-Vector Rust
 * Changes: Kept the model-face texture rotation contract as a small Rust
 *          translation boundary; texture loading and Dynmap runtime code are
 *          intentionally excluded.
 */

/// Apply the Minecraft model-face rotation to normalized hit coordinates.
///
/// The hit coordinates are intentionally rotated before the asset callback is
/// invoked. This keeps face orientation at the renderer boundary and lets the
/// callback sample a zero-rotation face exactly once.
pub(crate) fn rotate_face_uv(rotation: u32, u: f32, v: f32) -> (f32, f32) {
    match rotation % 360 {
        90 => (1.0 - v, u),
        180 => (1.0 - u, 1.0 - v),
        270 => (v, 1.0 - u),
        _ => (u, v),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotates_face_uv_clockwise_in_quarter_turns() {
        let uv = (0.25, 0.75);

        assert_eq!(rotate_face_uv(0, uv.0, uv.1), uv);
        assert_eq!(rotate_face_uv(90, uv.0, uv.1), (0.25, 0.25));
        assert_eq!(rotate_face_uv(180, uv.0, uv.1), (0.75, 0.25));
        assert_eq!(rotate_face_uv(270, uv.0, uv.1), (0.75, 0.75));
    }

    #[test]
    fn normalizes_rotation_values_outside_one_turn() {
        assert_eq!(rotate_face_uv(450, 0.25, 0.75), (0.25, 0.25));
        assert_eq!(rotate_face_uv(720, 0.25, 0.75), (0.25, 0.75));
    }
}
