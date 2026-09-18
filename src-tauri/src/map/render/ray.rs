#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Vec3 {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) z: f32,
}

impl Vec3 {
    pub(crate) const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    pub(crate) fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y, self.z + other.z)
    }

    pub(crate) fn sub(self, other: Self) -> Self {
        Self::new(self.x - other.x, self.y - other.y, self.z - other.z)
    }

    pub(crate) fn scale(self, value: f32) -> Self {
        Self::new(self.x * value, self.y * value, self.z * value)
    }

    pub(crate) fn dot(self, other: Self) -> f32 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub(crate) fn cross(self, other: Self) -> Self {
        Self::new(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Ray {
    pub(crate) origin: Vec3,
    pub(crate) direction: Vec3,
}

impl Ray {
    pub(crate) fn at(self, distance: f32) -> Vec3 {
        self.origin.add(self.direction.scale(distance))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct RayHit {
    pub(crate) near: f32,
    pub(crate) far: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Aabb {
    pub(crate) min: Vec3,
    pub(crate) max: Vec3,
}

impl Aabb {
    pub(crate) fn intersect(self, ray: Ray) -> Option<RayHit> {
        let mut near = f32::NEG_INFINITY;
        let mut far = f32::INFINITY;
        for (origin, direction, min, max) in [
            (ray.origin.x, ray.direction.x, self.min.x, self.max.x),
            (ray.origin.y, ray.direction.y, self.min.y, self.max.y),
            (ray.origin.z, ray.direction.z, self.min.z, self.max.z),
        ] {
            if direction.abs() < f32::EPSILON {
                if origin < min || origin > max {
                    return None;
                }
                continue;
            }
            let mut axis_near = (min - origin) / direction;
            let mut axis_far = (max - origin) / direction;
            if axis_near > axis_far {
                std::mem::swap(&mut axis_near, &mut axis_far);
            }
            near = near.max(axis_near);
            far = far.min(axis_far);
            if near > far {
                return None;
            }
        }
        Some(RayHit { near, far })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intersects_a_voxel_from_above() {
        let ray = Ray {
            origin: Vec3::new(0.5, 4.0, 0.5),
            direction: Vec3::new(0.0, -1.0, 0.0),
        };
        let hit = Aabb {
            min: Vec3::new(0.0, 0.0, 0.0),
            max: Vec3::new(1.0, 1.0, 1.0),
        }
        .intersect(ray)
        .expect("ray should hit");
        assert_eq!(hit.near, 3.0);
        assert_eq!(hit.far, 4.0);
        assert_eq!(ray.at(hit.near), Vec3::new(0.5, 1.0, 0.5));
    }
}
