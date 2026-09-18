/*
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: Dynmap contributors
 *
 * Origin: https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java
 * Source-Ref: https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java
 * Ported-to: MC-Vector Rust
 * Changes: Translated PatchDefinition's parametric patch intersection and
 *          SideVisible UV rules to the Rust renderer's Ray representation.
 *          Dynmap's Java runtime, RenderPatch interfaces, and Bukkit types
 *          are intentionally excluded.
 */

use crate::map::render::ray::{Ray, Vec3};

const INTERSECTION_EPSILON: f32 = 0.000_001;

/// The visibility modes used by Dynmap's RenderPatchFactory.
///
/// `TOP` and `BOTTOM` select the determinant sign. The `FLIP` variants retain
/// the source renderer's texture-coordinate correction for patches whose
/// winding is reversed.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SideVisible {
    Top,
    TopFlip,
    TopFlipV,
    TopFlipHv,
    Bottom,
    Both,
    Flip,
}

/// A block-local parametric patch translated from Dynmap's PatchDefinition.
///
/// The origin and vectors are expressed in block units. `u` and `v` span the
/// full texture axes; the min/max fields select the visible portion. The
/// `*_at_umax` fields allow the visible region to be triangular or trapezoidal,
/// matching Dynmap's patch file format.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct PatchDefinition {
    pub(crate) origin: Vec3,
    pub(crate) u: Vec3,
    pub(crate) v: Vec3,
    pub(crate) umin: f32,
    pub(crate) umax: f32,
    pub(crate) vmin: f32,
    pub(crate) vmax: f32,
    pub(crate) vmax_at_umax: f32,
    pub(crate) vmin_at_umax: f32,
    pub(crate) side_visible: SideVisible,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct PatchHit {
    pub(crate) distance: f32,
    pub(crate) u: f32,
    pub(crate) v: f32,
}

impl PatchDefinition {
    /// Build a full parallelogram patch from the model face winding used by
    /// MC-Vector's block model resolver.
    pub(crate) fn from_quad(
        block_x: i64,
        block_y: i64,
        block_z: i64,
        vertices: [[f32; 3]; 4],
    ) -> Self {
        let origin = block_point(block_x, block_y, block_z, vertices[0]);
        let lower_right = block_point(block_x, block_y, block_z, vertices[1]);
        let upper_left = block_point(block_x, block_y, block_z, vertices[3]);

        Self {
            origin,
            u: lower_right.sub(origin),
            v: upper_left.sub(origin),
            umin: 0.0,
            umax: 1.0,
            vmin: 0.0,
            vmax: 1.0,
            vmax_at_umax: 1.0,
            vmin_at_umax: 0.0,
            side_visible: SideVisible::Both,
        }
    }

    /// Translate Dynmap's model-face UV orientation into its `SideVisible`
    /// mode. Minecraft's V axis is top-down, so the source first mirrors it
    /// before deciding whether U and/or V need a flip.
    pub(crate) fn side_visible_for_model_uv(uv: [f32; 4]) -> SideVisible {
        if uv.iter().any(|value| !value.is_finite()) {
            // Invalid model UV is not renderable. Keeping the source's
            // determinant-gated bottom mode here makes the malformed asset
            // path explicit instead of silently treating it as a two-sided
            // face; a later diagnostic layer can report the source details.
            return SideVisible::Bottom;
        }
        let mut umin = uv[0] / 16.0;
        let mut umax = uv[2] / 16.0;
        let mut vmin = 1.0 - uv[3] / 16.0;
        let mut vmax = 1.0 - uv[1] / 16.0;
        let flip_u = umin > umax;
        let flip_v = vmin > vmax;

        if flip_u {
            umin = 1.0 - umin;
            umax = 1.0 - umax;
        }
        if flip_v {
            vmin = 1.0 - vmin;
            vmax = 1.0 - vmax;
        }

        debug_assert!(umin <= umax && vmin <= vmax);
        match (flip_u, flip_v) {
            (false, false) => SideVisible::Top,
            (true, false) => SideVisible::TopFlip,
            (false, true) => SideVisible::TopFlipV,
            (true, true) => SideVisible::TopFlipHv,
        }
    }

    pub(crate) fn with_side_visible(mut self, side_visible: SideVisible) -> Self {
        self.side_visible = side_visible;
        self
    }

    /// Intersect a ray with the patch using Dynmap's parametric equations.
    ///
    /// This intentionally follows `IsoHDPerspective.handlePatch`: determinant
    /// sign selects the permitted side, the hit is tested in the clipped
    /// parametric range, and the flip modes adjust texture coordinates only
    /// after a valid intersection has been found.
    pub(crate) fn intersect(&self, ray: Ray) -> Option<PatchHit> {
        let direction_cross_v = ray.direction.cross(self.v);
        let determinant = self.u.dot(direction_cross_v);

        if !self.accepts_determinant(determinant) {
            return None;
        }

        let inverse_determinant = 1.0 / determinant;
        let offset = ray.origin.sub(self.origin);
        let mut u = inverse_determinant * offset.dot(direction_cross_v);
        if u <= self.umin + INTERSECTION_EPSILON || u >= self.umax - INTERSECTION_EPSILON {
            return None;
        }

        let offset_cross_u = offset.cross(self.u);
        let mut v = inverse_determinant * ray.direction.dot(offset_cross_u);
        let u_relative = ((u - self.umin) / (self.umax - self.umin)).clamp(0.0, 1.0);
        let vmax_at_u = self.vmax + (self.vmax_at_umax - self.vmax) * u_relative;
        let vmin_at_u = self.vmin + (self.vmin_at_umax - self.vmin) * u_relative;
        if v <= vmin_at_u + INTERSECTION_EPSILON || v >= vmax_at_u - INTERSECTION_EPSILON {
            return None;
        }

        let distance = inverse_determinant * self.v.dot(offset_cross_u);
        if distance <= INTERSECTION_EPSILON {
            return None;
        }

        if determinant > 0.0 {
            match self.side_visible {
                SideVisible::TopFlip => u = 1.0 - u,
                SideVisible::TopFlipV => v = 1.0 - v,
                SideVisible::TopFlipHv => {
                    u = 1.0 - u;
                    v = 1.0 - v;
                }
                SideVisible::Top | SideVisible::Bottom | SideVisible::Both | SideVisible::Flip => {}
            }
        } else if self.side_visible == SideVisible::Flip {
            u = 1.0 - u;
        }

        Some(PatchHit { distance, u, v })
    }

    fn accepts_determinant(&self, determinant: f32) -> bool {
        match self.side_visible {
            SideVisible::Top
            | SideVisible::TopFlip
            | SideVisible::TopFlipV
            | SideVisible::TopFlipHv => determinant >= INTERSECTION_EPSILON,
            SideVisible::Bottom => determinant <= -INTERSECTION_EPSILON,
            SideVisible::Both | SideVisible::Flip => determinant.abs() >= INTERSECTION_EPSILON,
        }
    }
}

fn block_point(block_x: i64, block_y: i64, block_z: i64, point: [f32; 3]) -> Vec3 {
    Vec3::new(
        block_x as f32 + point[0] / 16.0,
        block_y as f32 + point[1] / 16.0,
        block_z as f32 + point[2] / 16.0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn horizontal_patch(side_visible: SideVisible) -> PatchDefinition {
        PatchDefinition {
            origin: Vec3::new(0.0, 1.0, 0.0),
            u: Vec3::new(1.0, 0.0, 0.0),
            v: Vec3::new(0.0, 0.0, 1.0),
            umin: 0.0,
            umax: 1.0,
            vmin: 0.0,
            vmax: 1.0,
            vmax_at_umax: 1.0,
            vmin_at_umax: 0.0,
            side_visible,
        }
    }

    fn downward_ray() -> Ray {
        Ray {
            origin: Vec3::new(0.25, 2.0, 0.75),
            direction: Vec3::new(0.0, -1.0, 0.0),
        }
    }

    #[test]
    fn intersects_parametric_patch_and_returns_source_uv() {
        let hit = horizontal_patch(SideVisible::Both)
            .intersect(downward_ray())
            .expect("ray should hit horizontal patch");

        assert!((hit.distance - 1.0).abs() < 1.0e-6);
        assert!((hit.u - 0.25).abs() < 1.0e-6);
        assert!((hit.v - 0.75).abs() < 1.0e-6);
    }

    #[test]
    fn applies_top_flip_modes_only_after_a_valid_hit() {
        let ray = downward_ray();
        let normal = horizontal_patch(SideVisible::Top).intersect(ray);
        assert!(normal.is_none(), "top-facing mode rejects this winding");

        let mut patch = horizontal_patch(SideVisible::Bottom);
        let hit = patch.intersect(ray).expect("bottom side should be visible");
        assert!((hit.u - 0.25).abs() < 1.0e-6);

        patch.side_visible = SideVisible::TopFlipV;
        let reverse_ray = Ray {
            origin: Vec3::new(0.25, 0.0, 0.75),
            direction: Vec3::new(0.0, 1.0, 0.0),
        };
        let hit = patch
            .intersect(reverse_ray)
            .expect("top flip should accept the positive determinant");
        assert!((hit.v - 0.25).abs() < 1.0e-6);

        let top_flip = horizontal_patch(SideVisible::TopFlip)
            .intersect(reverse_ray)
            .expect("top flip should accept the positive determinant");
        assert!((top_flip.u - 0.75).abs() < 1.0e-6);

        let top_flip_hv = horizontal_patch(SideVisible::TopFlipHv)
            .intersect(reverse_ray)
            .expect("top horizontal/vertical flip should accept the positive determinant");
        assert!((top_flip_hv.u - 0.75).abs() < 1.0e-6);
        assert!((top_flip_hv.v - 0.25).abs() < 1.0e-6);
    }

    #[test]
    fn clips_trapezoid_at_u_max() {
        let mut patch = horizontal_patch(SideVisible::Both);
        patch.vmax_at_umax = 0.5;
        patch.vmin_at_umax = 0.5;

        let inside = Ray {
            origin: Vec3::new(0.25, 2.0, 0.75),
            direction: Vec3::new(0.0, -1.0, 0.0),
        };
        assert!(patch.intersect(inside).is_some());

        let outside = Ray {
            origin: Vec3::new(0.75, 2.0, 0.75),
            direction: Vec3::new(0.0, -1.0, 0.0),
        };
        assert!(patch.intersect(outside).is_none());
    }

    #[test]
    fn builds_block_local_patch_from_model_quad() {
        let patch = PatchDefinition::from_quad(
            -2,
            64,
            -3,
            [
                [0.0, 16.0, 0.0],
                [16.0, 16.0, 0.0],
                [16.0, 16.0, 16.0],
                [0.0, 16.0, 16.0],
            ],
        );
        let hit = patch
            .intersect(Ray {
                origin: Vec3::new(-1.5, 66.0, -2.5),
                direction: Vec3::new(0.0, -1.0, 0.0),
            })
            .expect("translated top face should be hit");

        assert!((hit.distance - 1.0).abs() < 1.0e-6);
        assert!((hit.u - 0.5).abs() < 1.0e-6);
        assert!((hit.v - 0.5).abs() < 1.0e-6);
    }

    #[test]
    fn maps_non_finite_model_uv_to_a_rejected_bottom_mode() {
        assert_eq!(
            PatchDefinition::side_visible_for_model_uv([f32::NAN, 0.0, 16.0, 16.0]),
            SideVisible::Bottom
        );
    }
}
