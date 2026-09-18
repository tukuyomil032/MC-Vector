mod compositing;
mod geometry;
mod iso;
mod lighting;
mod perspective;
mod png;
mod ray;
mod shader;
mod voxel_traversal;

use std::collections::HashMap;

use crate::map::assets::{RenderFace, RenderFaceDirection};

use self::compositing::alpha_over;
pub(crate) use self::geometry::Face;
use self::iso::IsoHDPerspective;
use self::png::validate_rgba;
pub(crate) use self::shader::shade_surface;
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
    pub(crate) rendered_column_count: usize,
    pub(crate) coverage_ratio: f32,
}

pub(crate) fn render_surface_tile<F, C>(
    bounds: TileWorldBounds,
    sample_surface: F,
    sample_color: C,
) -> Result<RenderedSurfaceTile, String>
where
    F: FnMut(i64, i64) -> Option<SurfaceSample>,
    C: FnMut(&SurfaceSample, Face, f32, f32) -> [u8; 4],
{
    render_surface_tile_with_models(
        bounds,
        sample_surface,
        sample_color,
        |_sample| None,
        |_sample, _face, _u, _v| [0, 0, 0, 0],
    )
}

/// Render a surface tile using the same useful property as Dynmap's HD
/// perspective: a column is projected with a non-zero camera elevation, and
/// the visible top and side faces are composited from far to near. The input
/// source remains column-oriented so Anvil and Paper snapshots can share the
/// renderer without moving NBT or Bukkit work into this module.
pub(crate) fn render_surface_tile_with_models<F, C, M, MC>(
    bounds: TileWorldBounds,
    mut sample_surface: F,
    mut sample_color: C,
    mut model_for: M,
    mut sample_model_color: MC,
) -> Result<RenderedSurfaceTile, String>
where
    F: FnMut(i64, i64) -> Option<SurfaceSample>,
    C: FnMut(&SurfaceSample, Face, f32, f32) -> [u8; 4],
    M: FnMut(&SurfaceSample) -> Option<Vec<RenderFace>>,
    MC: FnMut(&SurfaceSample, &RenderFace, f32, f32) -> [u8; 4],
{
    let width = bounds.tile_size;
    let height = bounds.tile_size;
    let mut pixels = vec![[0_u8; 4]; width * height];
    let mut sample_cache: HashMap<(i64, i64), Option<SurfaceSample>> = HashMap::new();
    let step = bounds.blocks_per_pixel.max(1);
    let perspective = IsoHDPerspective::default();

    #[derive(Clone)]
    struct ProjectedColumn {
        depth: f64,
        x: i64,
        z: i64,
        sample: SurfaceSample,
        side_depth: i32,
        model_faces: Option<Vec<RenderFace>>,
    }

    let center_x = bounds.origin_x as f64 + (bounds.tile_size as f64 * step as f64) / 2.0;
    let center_z = bounds.origin_z as f64 + (bounds.tile_size as f64 * step as f64) / 2.0;
    let center_y = 64.0;
    // A square of blocks becomes a diamond under the 45 degree azimuth. The
    // sqrt(2) factor keeps one tile approximately within the 256px viewport.
    let scale = 1.0 / (step as f64 * 2.0_f64.sqrt());
    let mut columns = Vec::new();

    let mut cached_surface = |x: i64, z: i64| {
        if let Some(sample) = sample_cache.get(&(x, z)) {
            return sample.clone();
        }
        let sample = sample_surface(x, z);
        sample_cache.insert((x, z), sample.clone());
        sample
    };

    for z_index in 0..=((bounds.tile_size as i64 * step - 1) / step) {
        for x_index in 0..=((bounds.tile_size as i64 * step - 1) / step) {
            let world_x = bounds.origin_x + x_index * step;
            let world_z = bounds.origin_z + z_index * step;
            let Some(sample) = cached_surface(world_x, world_z) else {
                continue;
            };
            let west_height = cached_surface(world_x - step, world_z)
                .map(|value| sample.y.saturating_sub(value.y))
                .unwrap_or(4);
            let north_height = cached_surface(world_x, world_z - step)
                .map(|value| sample.y.saturating_sub(value.y))
                .unwrap_or(4);
            let side_depth = west_height.max(north_height).clamp(1, 24);
            let depth = (world_x - bounds.origin_x) as f64 * 0.70710678
                + (world_z - bounds.origin_z) as f64 * 0.70710678
                - sample.y as f64 * 0.35;
            let model_faces = model_for(&sample);
            columns.push(ProjectedColumn {
                depth,
                x: world_x,
                z: world_z,
                sample,
                side_depth,
                model_faces,
            });
        }
    }

    // Larger depth is farther from the camera for the default ray direction.
    // Painting it first lets nearer terrain and buildings cover it naturally.
    columns.sort_by(|left, right| right.depth.total_cmp(&left.depth));
    let mut rendered_column_count = 0;
    for column in columns {
        rendered_column_count += 1;
        let top_y = column.sample.y + 1;
        let bottom_y = top_y - column.side_depth;
        let x = column.x as f64;
        let z = column.z as f64;
        let x2 = x + step as f64;
        let z2 = z + step as f64;

        if let Some(model_faces) = column
            .model_faces
            .as_ref()
            .filter(|faces| !faces.is_empty())
        {
            let mut projected_faces = model_faces
                .iter()
                .map(|face| {
                    let points = face.vertices.map(|point| {
                        (
                            column.x as f64 + f64::from(point[0]) / 16.0,
                            column.sample.y as f64 + f64::from(point[1]) / 16.0,
                            column.z as f64 + f64::from(point[2]) / 16.0,
                        )
                    });
                    let depth = points
                        .iter()
                        .map(|(point_x, point_y, point_z)| {
                            (*point_x - bounds.origin_x as f64) * 0.70710678
                                + (*point_z - bounds.origin_z as f64) * 0.70710678
                                - *point_y * 0.35
                        })
                        .sum::<f64>()
                        / 4.0;
                    let polygon = project_quad(
                        &perspective,
                        points,
                        center_x,
                        center_y,
                        center_z,
                        scale,
                        width,
                        height,
                    );
                    (depth, face, polygon)
                })
                .collect::<Vec<_>>();
            projected_faces.sort_by(|left, right| right.0.total_cmp(&left.0));
            for (_, face, polygon) in projected_faces {
                let direction = render_face_direction(face.direction);
                raster_polygon_textured(&mut pixels, width, height, &polygon, |u, v| {
                    let color = sample_model_color(&column.sample, face, u, v);
                    if face.shade {
                        shade_surface(
                            color,
                            column.sample.y,
                            column.sample.sky_light,
                            column.sample.block_light,
                            direction,
                            1.0,
                        )
                    } else {
                        color
                    }
                });
            }
            continue;
        }

        let top_face = project_quad(
            &perspective,
            [
                (x, top_y as f64, z),
                (x2, top_y as f64, z),
                (x2, top_y as f64, z2),
                (x, top_y as f64, z2),
            ],
            center_x,
            center_y,
            center_z,
            scale,
            width,
            height,
        );
        let north_face = project_quad(
            &perspective,
            [
                (x, top_y as f64, z),
                (x2, top_y as f64, z),
                (x2, bottom_y as f64, z),
                (x, bottom_y as f64, z),
            ],
            center_x,
            center_y,
            center_z,
            scale,
            width,
            height,
        );
        let west_face = project_quad(
            &perspective,
            [
                (x, top_y as f64, z),
                (x, top_y as f64, z2),
                (x, bottom_y as f64, z2),
                (x, bottom_y as f64, z),
            ],
            center_x,
            center_y,
            center_z,
            scale,
            width,
            height,
        );
        raster_polygon_textured(&mut pixels, width, height, &north_face, |u, v| {
            shade_surface(
                sample_color(&column.sample, Face::North, u, v),
                column.sample.y,
                column.sample.sky_light,
                column.sample.block_light,
                Face::North,
                1.0,
            )
        });
        raster_polygon_textured(&mut pixels, width, height, &west_face, |u, v| {
            shade_surface(
                sample_color(&column.sample, Face::West, u, v),
                column.sample.y,
                column.sample.sky_light,
                column.sample.block_light,
                Face::West,
                1.0,
            )
        });
        raster_polygon_textured(&mut pixels, width, height, &top_face, |u, v| {
            shade_surface(
                sample_color(&column.sample, Face::Up, u, v),
                column.sample.y,
                column.sample.sky_light,
                column.sample.block_light,
                Face::Up,
                perspective.height_shade(
                    column.sample.y,
                    cached_surface(column.x + step, column.z).map(|value| value.y),
                ),
            )
        });
    }

    let covered_pixels = pixels.iter().filter(|pixel| pixel[3] > 0).count();
    let pixels = pixels.into_iter().flatten().collect::<Vec<_>>();
    validate_rgba(width as u32, height as u32, &pixels)?;
    Ok(RenderedSurfaceTile {
        pixels,
        rendered_column_count,
        coverage_ratio: covered_pixels as f32 / (width * height).max(1) as f32,
    })
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

fn project_quad(
    perspective: &IsoHDPerspective,
    points: [(f64, f64, f64); 4],
    center_x: f64,
    center_y: f64,
    center_z: f64,
    scale: f64,
    width: usize,
    height: usize,
) -> [(f32, f32); 4] {
    points.map(|(x, y, z)| {
        let (screen_x, screen_y) =
            perspective.project_point(x, y, z, center_x, center_y, center_z, scale);
        (
            screen_x + width as f32 / 2.0,
            screen_y + height as f32 / 2.0,
        )
    })
}

fn raster_polygon_textured<F>(
    pixels: &mut [[u8; 4]],
    width: usize,
    height: usize,
    polygon: &[(f32, f32); 4],
    mut colour_at: F,
) where
    F: FnMut(f32, f32) -> [u8; 4],
{
    let min_x = polygon
        .iter()
        .map(|point| point.0)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as usize;
    let max_x = polygon
        .iter()
        .map(|point| point.0)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(width as f32) as usize;
    let min_y = polygon
        .iter()
        .map(|point| point.1)
        .fold(f32::INFINITY, f32::min)
        .floor()
        .max(0.0) as usize;
    let max_y = polygon
        .iter()
        .map(|point| point.1)
        .fold(f32::NEG_INFINITY, f32::max)
        .ceil()
        .min(height as f32) as usize;
    if min_x >= max_x || min_y >= max_y {
        return;
    }
    let span_x = (max_x as f32 - min_x as f32).max(1.0);
    let span_y = (max_y as f32 - min_y as f32).max(1.0);
    for y in min_y..max_y {
        for x in min_x..max_x {
            if point_in_convex_quad((x as f32 + 0.5, y as f32 + 0.5), polygon) {
                let index = y * width + x;
                let colour = colour_at(
                    ((x as f32 + 0.5 - min_x as f32) / span_x).clamp(0.0, 1.0),
                    ((y as f32 + 0.5 - min_y as f32) / span_y).clamp(0.0, 1.0),
                );
                pixels[index] = alpha_over(pixels[index], colour);
            }
        }
    }
}

fn point_in_convex_quad(point: (f32, f32), polygon: &[(f32, f32); 4]) -> bool {
    let mut sign = 0.0;
    for index in 0..4 {
        let (x1, y1) = polygon[index];
        let (x2, y2) = polygon[(index + 1) % 4];
        let cross = (x2 - x1) * (point.1 - y1) - (y2 - y1) * (point.0 - x1);
        if cross.abs() <= f32::EPSILON {
            continue;
        }
        if sign == 0.0 {
            sign = cross.signum();
        } else if sign != cross.signum() {
            return false;
        }
    }
    sign != 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(x: i64, z: i64) -> Option<SurfaceSample> {
        if !(0..32).contains(&x) || !(0..32).contains(&z) {
            return None;
        }
        Some(SurfaceSample {
            state: if x > 20 {
                "minecraft:stone|".to_string()
            } else {
                "minecraft:grass_block|".to_string()
            },
            biome: "minecraft:plains".to_string(),
            y: 64 + (x / 8) as i32,
            sky_light: 15,
            block_light: 0,
        })
    }

    #[test]
    fn renders_nontransparent_isometric_surface_with_height_variation() {
        let bounds = TileWorldBounds::new(32, 8, 8, 0, 0).expect("valid bounds");
        let rendered = render_surface_tile(bounds, sample, |surface, face, _, _| {
            if face == Face::Up && surface.state.contains("grass") {
                [70, 150, 70, 255]
            } else {
                [120, 120, 120, 255]
            }
        })
        .expect("surface should render");
        assert_eq!(rendered.rendered_column_count, 1024);
        assert!(rendered.coverage_ratio > 0.1);
        assert!(rendered.pixels.chunks_exact(4).any(|pixel| pixel[3] > 0));
        assert!(rendered
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] != pixel[1]));
    }

    #[test]
    fn interpolates_texture_coordinates_across_projected_faces() {
        let bounds = TileWorldBounds::new(32, 8, 8, 0, 0).expect("valid bounds");
        let rendered = render_surface_tile(bounds, sample, |_surface, _face, u, v| {
            [(u * 255.0) as u8, (v * 255.0) as u8, 90, 255]
        })
        .expect("textured surface should render");
        let colours = rendered
            .pixels
            .chunks_exact(4)
            .filter(|pixel| pixel[3] > 0)
            .map(|pixel| [pixel[0], pixel[1], pixel[2]])
            .collect::<std::collections::HashSet<_>>();
        assert!(
            colours.len() > 4,
            "projected faces should sample more than one texel"
        );
    }

    #[test]
    fn rasterizes_resolved_model_face() {
        let bounds = TileWorldBounds::new(32, 8, 8, 0, 0).expect("valid bounds");
        let face = RenderFace {
            direction: RenderFaceDirection::Up,
            vertices: [
                [0.0, 16.0, 0.0],
                [16.0, 16.0, 0.0],
                [16.0, 16.0, 16.0],
                [0.0, 16.0, 16.0],
            ],
            texture: "minecraft:test".to_string(),
            uv: [0.0, 0.0, 16.0, 16.0],
            rotation: 0,
            tint_index: None,
            shade: false,
        };
        let rendered = render_surface_tile_with_models(
            bounds,
            sample,
            |_surface, _face, _u, _v| [0, 0, 0, 0],
            move |_surface| Some(vec![face.clone()]),
            |_surface, _face, _u, _v| [230, 80, 40, 255],
        )
        .expect("model face should render");

        assert!(rendered
            .pixels
            .chunks_exact(4)
            .any(|pixel| pixel[0] == 230 && pixel[1] == 80 && pixel[2] == 40));
    }
}
