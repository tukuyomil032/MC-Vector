use super::ray::{Aabb, Ray, Vec3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Face {
    Down,
    Up,
    North,
    South,
    West,
    East,
}

impl Face {
    pub(crate) const fn shade(self) -> f32 {
        match self {
            Self::Up => 1.0,
            Self::Down => 0.5,
            Self::North | Self::South => 0.78,
            Self::West | Self::East => 0.88,
        }
    }
}

pub(crate) fn cube_face(face: Face, min: Vec3, max: Vec3) -> [Vec3; 4] {
    match face {
        Face::Up => [
            Vec3::new(min.x, max.y, min.z),
            Vec3::new(max.x, max.y, min.z),
            Vec3::new(max.x, max.y, max.z),
            Vec3::new(min.x, max.y, max.z),
        ],
        Face::Down => [
            Vec3::new(min.x, min.y, max.z),
            Vec3::new(max.x, min.y, max.z),
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(min.x, min.y, min.z),
        ],
        Face::North => [
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(min.x, min.y, min.z),
            Vec3::new(min.x, max.y, min.z),
            Vec3::new(max.x, max.y, min.z),
        ],
        Face::South => [
            Vec3::new(min.x, min.y, max.z),
            Vec3::new(max.x, min.y, max.z),
            Vec3::new(max.x, max.y, max.z),
            Vec3::new(min.x, max.y, max.z),
        ],
        Face::West => [
            Vec3::new(min.x, min.y, min.z),
            Vec3::new(min.x, min.y, max.z),
            Vec3::new(min.x, max.y, max.z),
            Vec3::new(min.x, max.y, min.z),
        ],
        Face::East => [
            Vec3::new(max.x, min.y, max.z),
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(max.x, max.y, min.z),
            Vec3::new(max.x, max.y, max.z),
        ],
    }
}

pub(crate) fn ray_hits_cube(ray: Ray, min: Vec3, max: Vec3) -> bool {
    Aabb { min, max }.intersect(ray).is_some()
}
