mod compositing;
mod geometry;
mod iso;
mod lighting;
mod perspective;
mod png;
mod ray;
mod shader;
mod voxel_traversal;

use crate::map::assets::{RenderFace, RenderFaceDirection};

use self::compositing::alpha_over;
pub(crate) use self::geometry::Face;
use self::iso::IsoHDPerspective;
use self::perspective::PerspectiveRenderer;
use self::png::validate_rgba;
use self::ray::{Ray, Vec3};
pub(crate) use self::shader::shade_surface;
use self::voxel_traversal::{traverse, TraversalAction};
use super::projection::TileWorldBounds;

#[derive(Clone, Debug)]
pub(crate) struct SurfaceSample {
    pub(crate) state: String,
    pub(crate) biome: String,
    pub(crate) y: i32,
    pub(crate) sky_light: u8,
    pub(crate) block_light: u8,
}

#[derive(Clone, Debug)]
pub(crate) struct RenderedSurfaceTile {
    pub(crate) pixels: Vec<u8>,
    pub(crate) coverage_ratio: f32,
}

/// Render an orthographic isometric tile by tracing one camera ray per output
/// pixel. The source callback is deliberately block-oriented so Paper live
/// snapshots and Anvil data can share the renderer without leaking Bukkit or
/// NBT types into this module.
pub(crate) fn render_iso_tile<F, S, M, MC>(
    bounds: TileWorldBounds,
    min_y: i32,
    max_y: i32,
    mut block_at: F,
    mut max_surface_at: S,
    mut model_for: M,
    mut sample_model_color: MC,
) -> Result<RenderedSurfaceTile, String>
where
    F: FnMut(i64, i32, i64) -> Option<SurfaceSample>,
    S: FnMut(i64, i64) -> Option<i32>,
    M: FnMut(&SurfaceSample) -> Option<Vec<RenderFace>>,
    MC: FnMut(&SurfaceSample, &RenderFace, f32, f32) -> [u8; 4],
{
    if min_y >= max_y {
        return Err("Iso renderer received an invalid world height range".to_string());
    }
    let width = bounds.tile_size;
    let height = bounds.tile_size;
    let mut pixels = vec![[0_u8; 4]; width * height];
    let perspective = IsoHDPerspective::default();
    let blocks_per_pixel = bounds.blocks_per_pixel.max(1) as f64;
    let tile_world_size = bounds.tile_size as i64 * bounds.blocks_per_pixel.max(1);
    let center_x = bounds.origin_x as f64 + tile_world_size as f64 / 2.0;
    let center_z = bounds.origin_z as f64 + tile_world_size as f64 / 2.0;
    let vertical_span = i64::from(max_y - min_y).unsigned_abs() as usize;
    let max_distance = (vertical_span as f32 + tile_world_size as f32 * 1.5).max(512.0);
    let max_steps = vertical_span
        .saturating_mul(3)
        .saturating_add(tile_world_size.max(1) as usize * 3)
        .saturating_add(128)
        .min(32_768);
    let mut rendered_pixel_count = 0;

    for pixel_y in 0..height as u32 {
        for pixel_x in 0..width as u32 {
            let mut ray = perspective.ray_for_pixel(
                pixel_x,
                pixel_y,
                width as u32,
                center_x,
                center_z,
                blocks_per_pixel,
            );
            // The screen-space center is a world X/Z coordinate at a
            // reference surface, not at the camera's elevated origin. Keep
            // the center ray aligned with the tile center when it reaches
            // the Overworld surface plane; without this correction every ray
            // drifts diagonally by the camera height before it can hit terrain.
            let reference_y = 64.0_f32.clamp(min_y as f32, (max_y - 1) as f32);
            let reference_distance = (ray.origin.y - reference_y) / -ray.direction.y;
            if reference_distance.is_finite() && reference_distance > 0.0 {
                ray.origin.x -= ray.direction.x * reference_distance;
                ray.origin.z -= ray.direction.z * reference_distance;
            }
            let mut pixel = [0_u8; 4];
            let mut hit_count = 0usize;
            traverse(ray, max_distance, max_steps, |voxel, distance| {
                if voxel.y < i64::from(min_y) {
                    return TraversalAction::Stop;
                }
                if voxel.y >= i64::from(max_y) {
                    return TraversalAction::Continue;
                }
                if let Some(max_surface_y) = max_surface_at(voxel.x, voxel.z) {
                    if voxel.y > i64::from(max_surface_y) {
                        if let Some(skip_to) =
                            skip_above_surface(ray, voxel.x, voxel.z, distance, max_surface_y)
                        {
                            return TraversalAction::SkipTo(skip_to);
                        }
                    }
                }
                let Some(sample) = block_at(voxel.x, voxel.y as i32, voxel.z) else {
                    return TraversalAction::Continue;
                };
                let model_faces = model_for(&sample)
                    .filter(|faces| !faces.is_empty())
                    .unwrap_or_else(default_cube_faces);
                let mut hits = Vec::new();
                for face in &model_faces {
                    if let Some(hit) = intersect_model_face(ray, voxel.x, voxel.y, voxel.z, face) {
                        hits.push((hit, face));
                    }
                }
                hits.sort_by(|left, right| left.0.distance.total_cmp(&right.0.distance));
                for (hit, face) in hits {
                    let mut color = sample_model_color(&sample, face, hit.u, hit.v);
                    if face.shade {
                        color = shade_surface(
                            color,
                            sample.y,
                            sample.sky_light,
                            sample.block_light,
                            render_face_direction(face.direction),
                            1.0,
                        );
                    }
                    if color[3] == 0 {
                        continue;
                    }
                    pixel = alpha_over(pixel, color);
                    hit_count += 1;
                    if pixel[3] >= 250 || hit_count >= 8 {
                        return TraversalAction::Stop;
                    }
                }
                TraversalAction::Continue
            });
            if pixel[3] > 0 {
                rendered_pixel_count += 1;
                pixels[pixel_y as usize * width + pixel_x as usize] = pixel;
            }
        }
    }

    let pixels = pixels.into_iter().flatten().collect::<Vec<_>>();
    validate_rgba(width as u32, height as u32, &pixels)?;
    Ok(RenderedSurfaceTile {
        pixels,
        coverage_ratio: rendered_pixel_count as f32 / (width * height).max(1) as f32,
    })
}

fn skip_above_surface(
    ray: Ray,
    voxel_x: i64,
    voxel_z: i64,
    distance: f32,
    max_surface_y: i32,
) -> Option<f32> {
    let chunk_x = voxel_x.div_euclid(16);
    let chunk_z = voxel_z.div_euclid(16);
    let next_x_boundary = if ray.direction.x >= 0.0 {
        (chunk_x + 1) * 16
    } else {
        chunk_x * 16
    };
    let next_z_boundary = if ray.direction.z >= 0.0 {
        (chunk_z + 1) * 16
    } else {
        chunk_z * 16
    };
    let x_distance = distance_to_plane(ray.origin.x, ray.direction.x, next_x_boundary as f32);
    let z_distance = distance_to_plane(ray.origin.z, ray.direction.z, next_z_boundary as f32);
    let y_distance = distance_to_plane(ray.origin.y, ray.direction.y, max_surface_y as f32 + 0.999);
    [x_distance, z_distance, y_distance]
        .into_iter()
        .filter(|candidate| candidate.is_finite() && *candidate > distance + 0.0001)
        .min_by(|left, right| left.total_cmp(right))
}

fn distance_to_plane(origin: f32, direction: f32, plane: f32) -> f32 {
    if direction.abs() < f32::EPSILON {
        f32::INFINITY
    } else {
        (plane - origin) / direction
    }
}

#[derive(Clone, Copy, Debug)]
struct ModelFaceHit {
    distance: f32,
    u: f32,
    v: f32,
}

fn intersect_model_face(
    ray: Ray,
    block_x: i64,
    block_y: i64,
    block_z: i64,
    face: &RenderFace,
) -> Option<ModelFaceHit> {
    let vertices = face.vertices.map(|point| {
        Vec3::new(
            block_x as f32 + point[0] / 16.0,
            block_y as f32 + point[1] / 16.0,
            block_z as f32 + point[2] / 16.0,
        )
    });
    let uv = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
    let first = intersect_triangle(
        ray,
        vertices[0],
        vertices[1],
        vertices[2],
        uv[0],
        uv[1],
        uv[2],
    );
    let second = intersect_triangle(
        ray,
        vertices[0],
        vertices[2],
        vertices[3],
        uv[0],
        uv[2],
        uv[3],
    );
    match (first, second) {
        (Some(first), Some(second)) if first.distance <= second.distance => Some(first),
        (Some(_), Some(second)) => Some(second),
        (Some(first), None) => Some(first),
        (None, Some(second)) => Some(second),
        (None, None) => None,
    }
}

fn intersect_triangle(
    ray: Ray,
    first: Vec3,
    second: Vec3,
    third: Vec3,
    first_uv: [f32; 2],
    second_uv: [f32; 2],
    third_uv: [f32; 2],
) -> Option<ModelFaceHit> {
    let edge_one = second.sub(first);
    let edge_two = third.sub(first);
    let cross = ray.direction.cross(edge_two);
    let determinant = edge_one.dot(cross);
    if determinant.abs() < 0.000_001 {
        return None;
    }
    let inverse = 1.0 / determinant;
    let offset = ray.origin.sub(first);
    let barycentric_u = inverse * offset.dot(cross);
    if !(0.0..=1.0).contains(&barycentric_u) {
        return None;
    }
    let offset_cross = offset.cross(edge_one);
    let barycentric_v = inverse * ray.direction.dot(offset_cross);
    if barycentric_v < 0.0 || barycentric_u + barycentric_v > 1.0 {
        return None;
    }
    let distance = inverse * edge_two.dot(offset_cross);
    if distance <= 0.0001 {
        return None;
    }
    Some(ModelFaceHit {
        distance,
        u: first_uv[0]
            + barycentric_u * (second_uv[0] - first_uv[0])
            + barycentric_v * (third_uv[0] - first_uv[0]),
        v: first_uv[1]
            + barycentric_u * (second_uv[1] - first_uv[1])
            + barycentric_v * (third_uv[1] - first_uv[1]),
    })
}

pub(crate) fn default_cube_faces() -> Vec<RenderFace> {
    [
        RenderFaceDirection::Down,
        RenderFaceDirection::Up,
        RenderFaceDirection::North,
        RenderFaceDirection::South,
        RenderFaceDirection::West,
        RenderFaceDirection::East,
    ]
    .into_iter()
    .map(|direction| RenderFace {
        direction,
        vertices: cube_face_vertices(direction),
        texture: String::new(),
        uv: [0.0, 0.0, 16.0, 16.0],
        rotation: 0,
        tint_index: None,
        shade: true,
    })
    .collect()
}

fn cube_face_vertices(direction: RenderFaceDirection) -> [[f32; 3]; 4] {
    match direction {
        RenderFaceDirection::Up => [
            [0.0, 16.0, 0.0],
            [16.0, 16.0, 0.0],
            [16.0, 16.0, 16.0],
            [0.0, 16.0, 16.0],
        ],
        RenderFaceDirection::Down => [
            [0.0, 0.0, 16.0],
            [16.0, 0.0, 16.0],
            [16.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
        ],
        RenderFaceDirection::North => [
            [16.0, 0.0, 0.0],
            [0.0, 0.0, 0.0],
            [0.0, 16.0, 0.0],
            [16.0, 16.0, 0.0],
        ],
        RenderFaceDirection::South => [
            [0.0, 0.0, 16.0],
            [16.0, 0.0, 16.0],
            [16.0, 16.0, 16.0],
            [0.0, 16.0, 16.0],
        ],
        RenderFaceDirection::West => [
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 16.0],
            [0.0, 16.0, 16.0],
            [0.0, 16.0, 0.0],
        ],
        RenderFaceDirection::East => [
            [16.0, 0.0, 16.0],
            [16.0, 0.0, 0.0],
            [16.0, 16.0, 0.0],
            [16.0, 16.0, 16.0],
        ],
    }
}

fn render_face_direction(direction: RenderFaceDirection) -> Face {
    match direction {
        RenderFaceDirection::Down => Face::Down,
        RenderFaceDirection::Up => Face::Up,
        RenderFaceDirection::North => Face::North,
        RenderFaceDirection::South => Face::South,
        RenderFaceDirection::West => Face::West,
        RenderFaceDirection::East => Face::East,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traces_isometric_rays_through_block_faces() {
        let bounds = TileWorldBounds::new(16, 8, 8, 0, 0).expect("valid bounds");
        let rendered = render_iso_tile(
            bounds,
            -64,
            320,
            |_x, y, z| {
                if y == 64 && (-512..512).contains(&z) {
                    Some(SurfaceSample {
                        state: "minecraft:stone".to_string(),
                        biome: "minecraft:plains".to_string(),
                        y,
                        sky_light: 15,
                        block_light: 0,
                    })
                } else {
                    None
                }
            },
            |_x, _z| Some(64),
            |_sample| Some(default_cube_faces()),
            |_sample, _face, _u, _v| [120, 140, 180, 255],
        )
        .expect("ray tile should render");
        assert!(rendered.coverage_ratio > 0.0);
        assert!(rendered.pixels.chunks_exact(4).any(|pixel| pixel[3] > 0));
    }
}
