use super::ray::{Ray, Vec3};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Voxel {
    pub(crate) x: i64,
    pub(crate) y: i64,
    pub(crate) z: i64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum TraversalAction {
    Continue,
    Stop,
    SkipTo(f32),
}

/// Amanatides-Woo style traversal for the ray path used by the Iso renderer.
/// The callback may stop traversal by returning false.
pub(crate) fn traverse<F>(ray: Ray, max_distance: f32, max_steps: usize, mut visit: F)
where
    F: FnMut(Voxel, f32) -> TraversalAction,
{
    let mut voxel = Voxel {
        x: ray.origin.x.floor() as i64,
        y: ray.origin.y.floor() as i64,
        z: ray.origin.z.floor() as i64,
    };
    let step = Vec3::new(
        if ray.direction.x < 0.0 { -1.0 } else { 1.0 },
        if ray.direction.y < 0.0 { -1.0 } else { 1.0 },
        if ray.direction.z < 0.0 { -1.0 } else { 1.0 },
    );
    let delta = Vec3::new(
        inverse_abs(ray.direction.x),
        inverse_abs(ray.direction.y),
        inverse_abs(ray.direction.z),
    );
    let mut next = Vec3::new(
        boundary_distance(ray.origin.x, voxel.x, step.x, ray.direction.x),
        boundary_distance(ray.origin.y, voxel.y, step.y, ray.direction.y),
        boundary_distance(ray.origin.z, voxel.z, step.z, ray.direction.z),
    );
    let mut distance = 0.0;

    for _ in 0..max_steps {
        if distance > max_distance {
            break;
        }
        match visit(voxel, distance) {
            TraversalAction::Stop => break,
            TraversalAction::SkipTo(target) if target > distance + 0.0001 => {
                distance = target;
                voxel = Voxel {
                    x: (ray.origin.x + ray.direction.x * distance).floor() as i64,
                    y: (ray.origin.y + ray.direction.y * distance).floor() as i64,
                    z: (ray.origin.z + ray.direction.z * distance).floor() as i64,
                };
                next = Vec3::new(
                    boundary_distance(ray.origin.x, voxel.x, step.x, ray.direction.x),
                    boundary_distance(ray.origin.y, voxel.y, step.y, ray.direction.y),
                    boundary_distance(ray.origin.z, voxel.z, step.z, ray.direction.z),
                );
                continue;
            }
            TraversalAction::Continue | TraversalAction::SkipTo(_) => {}
        }
        if next.x <= next.y && next.x <= next.z {
            distance = next.x;
            voxel.x += step.x as i64;
            next.x += delta.x;
        } else if next.y <= next.z {
            distance = next.y;
            voxel.y += step.y as i64;
            next.y += delta.y;
        } else {
            distance = next.z;
            voxel.z += step.z as i64;
            next.z += delta.z;
        }
    }
}

fn inverse_abs(value: f32) -> f32 {
    if value.abs() < f32::EPSILON {
        f32::INFINITY
    } else {
        1.0 / value.abs()
    }
}

fn boundary_distance(origin: f32, voxel: i64, step: f32, direction: f32) -> f32 {
    if direction.abs() < f32::EPSILON {
        return f32::INFINITY;
    }
    let boundary = if step > 0.0 {
        voxel as f32 + 1.0
    } else {
        voxel as f32
    };
    ((boundary - origin) / direction).max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visits_vertical_voxels_in_near_to_far_order() {
        let mut visited = Vec::new();
        traverse(
            Ray {
                origin: Vec3::new(0.5, 3.5, 0.5),
                direction: Vec3::new(0.0, -1.0, 0.0),
            },
            4.0,
            8,
            |voxel, distance| {
                visited.push((voxel.y, distance));
                TraversalAction::Continue
            },
        );
        assert_eq!(visited[0].0, 3);
        assert_eq!(visited[1].0, 2);
        assert!(visited[1].1 > visited[0].1);
    }
}
