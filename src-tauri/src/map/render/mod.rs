mod compositing;
mod geometry;
mod iso;
mod lighting;
mod perspective;
mod png;
pub(crate) mod ray;
mod shader;
mod voxel_traversal;

use crate::map::assets::{apply_material_alpha, material_kind, RenderFace, RenderFaceDirection};

use self::compositing::alpha_over;
pub(crate) use self::geometry::Face;
use self::iso::IsoHDPerspective;
use self::perspective::PerspectiveRenderer;
use self::png::validate_rgba;
use self::ray::Ray;
pub(crate) use self::shader::shade_surface;
use self::voxel_traversal::{traverse, TraversalAction};
use super::projection::MapTileGeometry;
use crate::map::renderer::dynmap::patch::{PatchDefinition, PatchHit as ModelFaceHit};

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
    geometry: MapTileGeometry,
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
    let width = geometry.tile_size;
    let height = geometry.tile_size;
    let mut pixels = vec![[0_u8; 4]; width * height];
    let perspective = IsoHDPerspective::default();
    let blocks_per_pixel = geometry.blocks_per_pixel.max(1) as f64;
    let tile_world_size = geometry.tile_size as i64 * geometry.blocks_per_pixel.max(1);
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
            let ray = PerspectiveRenderer::ray_for_tile_pixel(
                &perspective,
                pixel_x,
                pixel_y,
                width as u32,
                geometry.tile_x as i64,
                geometry.tile_y as i64,
                blocks_per_pixel,
                min_y as f64,
                max_y as f64,
            );
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
                    // The asset callback supplies texture sampling and the
                    // existing biome tint. Apply material alpha afterwards so
                    // cutout/transparent semantics do not alter tinted RGB.
                    let mut color = prepare_sampled_face_color(
                        &sample,
                        sample_model_color(&sample, face, hit.u, hit.v),
                    );
                    if face.shade {
                        color = shade_surface(
                            color,
                            sample.y,
                            sample.sky_light,
                            sample.block_light,
                            render_face_direction(face.direction),
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

fn prepare_sampled_face_color(sample: &SurfaceSample, color: [u8; 4]) -> [u8; 4] {
    apply_material_alpha(material_kind(&sample.state), color)
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

fn intersect_model_face(
    ray: Ray,
    block_x: i64,
    block_y: i64,
    block_z: i64,
    face: &RenderFace,
) -> Option<ModelFaceHit> {
    PatchDefinition::from_quad(block_x, block_y, block_z, face.vertices)
        .with_side_visible(PatchDefinition::side_visible_for_model_uv(face.uv))
        .intersect(ray)
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
            [0.0, 16.0, 16.0],
            [16.0, 16.0, 16.0],
            [16.0, 16.0, 0.0],
            [0.0, 16.0, 0.0],
        ],
        RenderFaceDirection::Down => [
            [0.0, 0.0, 0.0],
            [16.0, 0.0, 0.0],
            [16.0, 0.0, 16.0],
            [0.0, 0.0, 16.0],
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
        let geometry = MapTileGeometry::new(16, 8, 8, 0, 0).expect("valid geometry");
        let rendered = render_iso_tile(
            geometry,
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

    #[test]
    fn resolved_face_material_policy_preserves_tinted_rgb_and_alpha_modes() {
        let mut sample = SurfaceSample {
            state: "minecraft:oak_fence".to_string(),
            biome: "minecraft:plains".to_string(),
            y: 64,
            sky_light: 15,
            block_light: 0,
        };

        assert_eq!(
            prepare_sampled_face_color(&sample, [44, 88, 132, 127]),
            [44, 88, 132, 0]
        );
        assert_eq!(
            prepare_sampled_face_color(&sample, [44, 88, 132, 200]),
            [44, 88, 132, 255]
        );

        sample.state = "minecraft:glass".to_string();
        assert_eq!(
            prepare_sampled_face_color(&sample, [44, 88, 132, 96]),
            [44, 88, 132, 96]
        );
    }
}
