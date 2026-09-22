//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/utils/PatchDefinition.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Preserves patch vectors, clipped UV limits, face tests, and bounds without Dynmap runtime types.

use super::types::{BlockStep, SideVisible, Vec3};

const EPSILON: f64 = 1e-10;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ray {
    pub origin: Vec3,
    pub direction: Vec3,
}

impl Ray {
    pub const fn new(origin: Vec3, direction: Vec3) -> Self {
        Self { origin, direction }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PatchBounds {
    pub min: Vec3,
    pub max: Vec3,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PatchHit {
    pub distance: f64,
    pub point: Vec3,
    pub u: f64,
    pub v: f64,
    pub step: BlockStep,
    pub texture_index: i32,
    pub shade: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TextureUv {
    pub min_u: f64,
    pub max_u: f64,
    pub min_v: f64,
    pub max_v: f64,
    pub rotation: u16,
}

impl Default for TextureUv {
    fn default() -> Self {
        Self {
            min_u: 0.0,
            max_u: 1.0,
            min_v: 0.0,
            max_v: 1.0,
            rotation: 0,
        }
    }
}

impl TextureUv {
    pub fn sample(self, u: f64, v: f64) -> (f64, f64) {
        let (u, v) = match self.rotation {
            0 => (u, v),
            90 => (1.0 - v, u),
            180 => (1.0 - u, 1.0 - v),
            270 => (v, 1.0 - u),
            _ => (u, v),
        };
        (
            self.min_u + (self.max_u - self.min_u) * u,
            self.min_v + (self.max_v - self.min_v) * v,
        )
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum PatchError {
    NonFiniteCoordinate,
    DegenerateSurface,
    InvalidUClip,
    InvalidVClip,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PatchDefinition {
    pub origin: Vec3,
    /// Endpoint of the full U vector, corresponding to u=1.
    pub u_end: Vec3,
    /// Endpoint of the full V vector, corresponding to v=1.
    pub v_end: Vec3,
    pub umin: f64,
    pub umax: f64,
    pub vmin: f64,
    pub vmax: f64,
    /// V limits at umax. At umin, vmin/vmax are used.
    pub vmin_at_umax: f64,
    pub vmax_at_umax: f64,
    pub side_visible: SideVisible,
    pub texture_index: i32,
    pub texture_uv: TextureUv,
    pub cullface: Option<BlockStep>,
    pub shade: bool,
    pub step: BlockStep,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct PatchDefinitionFactory;

impl PatchDefinitionFactory {
    pub fn create(
        origin: Vec3,
        u_end: Vec3,
        v_end: Vec3,
        side_visible: SideVisible,
        texture_index: i32,
        shade: bool,
    ) -> Result<PatchDefinition, PatchError> {
        PatchDefinition::new(
            origin,
            u_end,
            v_end,
            0.0,
            1.0,
            0.0,
            1.0,
            0.0,
            1.0,
            side_visible,
            texture_index,
            shade,
        )
    }
}

impl PatchDefinition {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        origin: Vec3,
        u_end: Vec3,
        v_end: Vec3,
        umin: f64,
        umax: f64,
        vmin: f64,
        vmax: f64,
        vmin_at_umax: f64,
        vmax_at_umax: f64,
        side_visible: SideVisible,
        texture_index: i32,
        shade: bool,
    ) -> Result<Self, PatchError> {
        if [
            origin.x, origin.y, origin.z, u_end.x, u_end.y, u_end.z, v_end.x, v_end.y, v_end.z,
        ]
        .into_iter()
        .chain([umin, umax, vmin, vmax, vmin_at_umax, vmax_at_umax])
        .any(|value| !value.is_finite())
        {
            return Err(PatchError::NonFiniteCoordinate);
        }
        if umax <= umin {
            return Err(PatchError::InvalidUClip);
        }
        if vmax <= vmin || vmax_at_umax < vmin_at_umax {
            return Err(PatchError::InvalidVClip);
        }
        let normal = (u_end - origin).cross(v_end - origin);
        if normal.length_squared() <= EPSILON * EPSILON {
            return Err(PatchError::DegenerateSurface);
        }

        Ok(Self {
            origin,
            u_end,
            v_end,
            umin,
            umax,
            vmin,
            vmax,
            vmin_at_umax,
            vmax_at_umax,
            side_visible,
            texture_index,
            texture_uv: TextureUv::default(),
            cullface: None,
            shade,
            step: dominant_step(normal),
        })
    }

    pub fn with_texture_uv(mut self, texture_uv: TextureUv) -> Self {
        self.texture_uv = texture_uv;
        self
    }

    pub fn with_cullface(mut self, cullface: Option<BlockStep>) -> Self {
        self.cullface = cullface;
        self
    }

    pub fn u_vector(self) -> Vec3 {
        self.u_end - self.origin
    }

    pub fn v_vector(self) -> Vec3 {
        self.v_end - self.origin
    }

    pub fn normal(self) -> Vec3 {
        self.u_vector().cross(self.v_vector())
    }

    pub fn point_at(self, u: f64, v: f64) -> Vec3 {
        self.origin + self.u_vector() * u + self.v_vector() * v
    }

    pub fn v_bounds_at(self, u: f64) -> (f64, f64) {
        let span = self.umax - self.umin;
        let amount = ((u - self.umin) / span).clamp(0.0, 1.0);
        (
            self.vmin + (self.vmin_at_umax - self.vmin) * amount,
            self.vmax + (self.vmax_at_umax - self.vmax) * amount,
        )
    }

    pub fn contains_uv(self, u: f64, v: f64) -> bool {
        if u < self.umin - EPSILON || u > self.umax + EPSILON {
            return false;
        }
        let (vmin, vmax) = self.v_bounds_at(u);
        v >= vmin - EPSILON && v <= vmax + EPSILON
    }

    pub fn bounds(self) -> PatchBounds {
        let (vmin_at_umin, vmax_at_umin) = (self.vmin, self.vmax);
        let corners = [
            self.point_at(self.umin, vmin_at_umin),
            self.point_at(self.umin, vmax_at_umin),
            self.point_at(self.umax, self.vmin_at_umax),
            self.point_at(self.umax, self.vmax_at_umax),
        ];
        let mut min = corners[0];
        let mut max = corners[0];
        for corner in corners.into_iter().skip(1) {
            min.x = min.x.min(corner.x);
            min.y = min.y.min(corner.y);
            min.z = min.z.min(corner.z);
            max.x = max.x.max(corner.x);
            max.y = max.y.max(corner.y);
            max.z = max.z.max(corner.z);
        }
        PatchBounds { min, max }
    }

    pub fn intersect(self, ray: Ray) -> Option<PatchHit> {
        let normal = self.normal();
        let denominator = normal.dot(ray.direction);
        let front_facing = denominator < -EPSILON;
        let back_facing = denominator > EPSILON;
        let visible = match self.side_visible {
            SideVisible::Front => front_facing,
            SideVisible::Back => back_facing,
            SideVisible::Both => front_facing || back_facing,
        };
        if !visible {
            return None;
        }
        let distance = normal.dot(self.origin - ray.origin) / denominator;
        if distance < -EPSILON {
            return None;
        }
        let point = ray.origin + ray.direction * distance.max(0.0);
        let (u, v) = solve_patch_coordinates(point, self.origin, self.u_vector(), self.v_vector())?;
        if !self.contains_uv(u, v) {
            return None;
        }
        Some(PatchHit {
            distance: distance.max(0.0),
            point,
            u,
            v,
            step: self.step,
            texture_index: self.texture_index,
            shade: self.shade,
        })
    }
}

fn solve_patch_coordinates(
    point: Vec3,
    origin: Vec3,
    u_vector: Vec3,
    v_vector: Vec3,
) -> Option<(f64, f64)> {
    let relative = point - origin;
    let uu = u_vector.dot(u_vector);
    let uv = u_vector.dot(v_vector);
    let vv = v_vector.dot(v_vector);
    let determinant = uu * vv - uv * uv;
    if determinant.abs() <= EPSILON {
        return None;
    }
    Some((
        (relative.dot(u_vector) * vv - relative.dot(v_vector) * uv) / determinant,
        (relative.dot(v_vector) * uu - relative.dot(u_vector) * uv) / determinant,
    ))
}

fn dominant_step(normal: Vec3) -> BlockStep {
    if normal.x.abs() > normal.y.abs() * 0.9 {
        if normal.x.abs() > normal.z.abs() {
            if normal.x > 0.0 {
                BlockStep::XPlus
            } else {
                BlockStep::XMinus
            }
        } else if normal.z > 0.0 {
            BlockStep::ZPlus
        } else {
            BlockStep::ZMinus
        }
    } else if normal.y.abs() * 0.9 > normal.z.abs() {
        if normal.y > 0.0 {
            BlockStep::YPlus
        } else {
            BlockStep::YMinus
        }
    } else if normal.z > 0.0 {
        BlockStep::ZPlus
    } else {
        BlockStep::ZMinus
    }
}

#[cfg(test)]
mod tests {
    use super::{PatchDefinition, PatchDefinitionFactory, PatchError, Ray, TextureUv};
    use crate::renderer::dynmap::types::{SideVisible, Vec3};

    fn square_patch() -> PatchDefinition {
        PatchDefinition::new(
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            0.25,
            0.75,
            0.25,
            0.75,
            0.25,
            0.75,
            SideVisible::Front,
            3,
            true,
        )
        .unwrap()
    }

    #[test]
    fn patch_bounds_follow_clipped_uv_corners() {
        let bounds = square_patch().bounds();
        assert_eq!(bounds.min, Vec3::new(0.25, 0.25, 0.0));
        assert_eq!(bounds.max, Vec3::new(0.75, 0.75, 0.0));
    }

    #[test]
    fn patch_hit_returns_surface_coordinates_and_rejects_misses() {
        let patch = square_patch();
        let hit = patch
            .intersect(Ray::new(
                Vec3::new(0.5, 0.5, 1.0),
                Vec3::new(0.0, 0.0, -1.0),
            ))
            .unwrap();
        assert!((hit.distance - 1.0).abs() < 1e-9);
        assert!((hit.u - 0.5).abs() < 1e-9);
        assert!((hit.v - 0.5).abs() < 1e-9);
        assert!(patch
            .intersect(Ray::new(
                Vec3::new(0.1, 0.5, 1.0),
                Vec3::new(0.0, 0.0, -1.0)
            ))
            .is_none());
    }

    #[test]
    fn trapezoid_uv_boundary_is_interpolated_at_umax() {
        let patch = PatchDefinition::new(
            Vec3::ZERO,
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            0.0,
            1.0,
            0.0,
            1.0,
            0.4,
            0.6,
            SideVisible::Front,
            0,
            true,
        )
        .unwrap();
        assert!(patch.contains_uv(1.0, 0.5));
        assert!(!patch.contains_uv(1.0, 0.2));
    }

    #[test]
    fn factory_creates_a_full_unit_patch_with_explicit_metadata() {
        let patch = PatchDefinitionFactory::create(
            Vec3::ZERO,
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            SideVisible::Both,
            7,
            false,
        )
        .unwrap();
        let hit = patch
            .intersect(Ray::new(
                Vec3::new(0.5, 0.5, 1.0),
                Vec3::new(0.0, 0.0, -1.0),
            ))
            .unwrap();
        assert_eq!(hit.texture_index, 7);
        assert!(!hit.shade);
    }

    #[test]
    fn parallel_and_backface_rays_are_rejected_by_visibility_contract() {
        let patch = square_patch();
        assert!(patch
            .intersect(Ray::new(Vec3::new(0.5, 0.5, 1.0), Vec3::new(1.0, 0.0, 0.0)))
            .is_none());
        assert!(patch
            .intersect(Ray::new(
                Vec3::new(0.5, 0.5, -1.0),
                Vec3::new(0.0, 0.0, -1.0),
            ))
            .is_none());
    }

    #[test]
    fn degenerate_and_reversed_clips_are_rejected() {
        assert_eq!(
            PatchDefinitionFactory::create(
                Vec3::ZERO,
                Vec3::ZERO,
                Vec3::new(0.0, 1.0, 0.0),
                SideVisible::Both,
                0,
                true,
            ),
            Err(PatchError::DegenerateSurface)
        );
        assert_eq!(
            PatchDefinition::new(
                Vec3::ZERO,
                Vec3::new(1.0, 0.0, 0.0),
                Vec3::new(0.0, 1.0, 0.0),
                1.0,
                0.0,
                0.0,
                1.0,
                0.0,
                1.0,
                SideVisible::Both,
                0,
                true,
            ),
            Err(PatchError::InvalidUClip)
        );
    }

    #[test]
    fn texture_uv_rotation_is_separate_from_surface_coordinates() {
        let uv = TextureUv {
            min_u: 0.25,
            max_u: 0.75,
            min_v: 0.0,
            max_v: 1.0,
            rotation: 90,
        };
        assert_eq!(uv.sample(0.0, 0.0), (0.75, 0.0));
        assert_eq!(uv.sample(1.0, 1.0), (0.25, 1.0));
    }
}
