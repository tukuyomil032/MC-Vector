//! World tile rasterization owned by the Map renderer feature.

use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::Path;

use fastanvil::{Chunk as DimensionChunk, HeightMode, JavaChunk};
use flate2::{write::ZlibEncoder, Compression};

use crate::map::assets::{self as map_assets, MapAssets, RenderFace};
use crate::map::domain::{ChunkKey, ChunkView};
use crate::map::projection::{floor_div, floor_mod, MapTileGeometry, MapTilePlane};
use crate::map::render::{shade_surface, Face, SurfaceSample};
use crate::map::sources::{
    enumerate_region_files, is_air_state, present_chunks_for_bounds, read_java_chunk,
};
use crate::map::tile_buffer::{Rgba, RgbaTileBuffer};

use super::{
    render_iso_tile, IsoHDPerspective, LiveChunkMap, TileRenderResult, MAX_ZOOM, TILE_SIZE,
};

const RAY_CHUNK_PADDING_BLOCKS: i64 = 16;

fn render_chunk<'a>(
    world_root: &Path,
    chunk_x: i64,
    chunk_z: i64,
    chunks: &'a mut HashMap<(i64, i64), Result<Option<JavaChunk>, String>>,
    diagnostic: &mut Option<String>,
    decode_failed_chunk_count: &mut usize,
) -> Option<&'a JavaChunk> {
    if !chunks.contains_key(&(chunk_x, chunk_z)) {
        let key = ChunkKey::new("minecraft:overworld", chunk_x, chunk_z);
        let rendered = read_java_chunk(world_root, &key);
        if let Err(error) = &rendered {
            *decode_failed_chunk_count += 1;
            if diagnostic.is_none() {
                *diagnostic = Some(format!(
                    "Failed to read chunk ({chunk_x}, {chunk_z}): {error}"
                ));
            }
        }
        chunks.insert((chunk_x, chunk_z), rendered);
    }
    chunks
        .get(&(chunk_x, chunk_z))
        .and_then(|result| result.as_ref().ok())
        .and_then(Option::as_ref)
}

fn fallback_terrain_colour(_world_x: i64, _world_z: i64) -> Rgba {
    [0, 0, 0, 0]
}

fn chunk_surface_sample(
    chunk: &JavaChunk,
    local_x: usize,
    local_z: usize,
) -> Option<SurfaceSample> {
    let range = chunk.y_range();
    if range.start >= range.end {
        return None;
    }

    // `fastanvil::complete::Chunk::surface_height(..., Calculate)` is still a
    // `todo!()` in fastanvil 0.32. The real Paper 1.21 chunks can contain a
    // heightmap that is absent or outside the decoded section range, so never
    // call that implementation here. Trust a valid persisted heightmap and
    // otherwise scan the decoded section ourselves.
    let trusted_top = chunk.surface_height(local_x, local_z, HeightMode::Trust);
    let top = if trusted_top > range.start
        && trusted_top <= range.end
        && !(trusted_top == 0 && range.start < 0)
    {
        trusted_top
    } else {
        range.end
    };
    for y in (range.start..top).rev() {
        let Some(block) = chunk.block(local_x, y, local_z) else {
            continue;
        };
        if matches!(
            block.name(),
            "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
        ) {
            continue;
        }
        let biome = chunk
            .biome(local_x, y, local_z)
            .map(|biome| format!("{biome:?}").to_ascii_lowercase())
            .unwrap_or_default();
        return Some(SurfaceSample {
            state: block.encoded_description().to_string(),
            biome,
            y: y as i32,
            sky_light: 15,
            block_light: 0,
        });
    }
    None
}

fn complete_block_sample(
    chunk: &JavaChunk,
    local_x: usize,
    y: i32,
    local_z: usize,
) -> Option<SurfaceSample> {
    let y = y as isize;
    let block = chunk.block(local_x, y, local_z)?;
    if is_air_state(block.name()) {
        return None;
    }
    let biome = chunk
        .biome(local_x, y, local_z)
        .map(|biome| format!("{biome:?}").to_ascii_lowercase())
        .unwrap_or_else(|| "minecraft:plains".to_string());
    Some(SurfaceSample {
        state: block.encoded_description().to_string(),
        biome,
        y: y as i32,
        sky_light: 15,
        block_light: 0,
    })
}

fn chunk_max_surface_y(chunk: &JavaChunk) -> Option<i32> {
    let range = chunk.y_range();
    if range.start >= range.end {
        return None;
    }
    // Keep the JavaChunk representation so sparse/partial 1.21 saves do not
    // pass through the complete-chunk conversion's section unwrap. Scan the
    // decoded sections here and retain terrain even when the heightmap is
    // absent or stale.
    let mut maximum = None;
    for local_z in 0..16 {
        for local_x in 0..16 {
            let Some(y) = (range.start..range.end).rev().find(|y| {
                chunk
                    .block(local_x, *y, local_z)
                    .map(|block| !is_air_state(block.name()))
                    .unwrap_or(false)
            }) else {
                continue;
            };
            maximum = Some(maximum.map_or(y as i32, |current: i32| current.max(y as i32)));
        }
    }
    maximum
}

fn live_chunk_max_surface_y(snapshot: &ChunkView) -> Option<i32> {
    snapshot
        .columns
        .iter()
        .flat_map(|column| column.iter())
        .filter(|layer| !is_air_state(&layer.state))
        .map(|layer| layer.y)
        .max()
}

fn live_block_sample(
    snapshot: &ChunkView,
    local_x: usize,
    y: i32,
    local_z: usize,
) -> Option<SurfaceSample> {
    snapshot
        .column(local_x, local_z)?
        .iter()
        .find(|layer| layer.y == y && !is_air_state(&layer.state))
        .map(|layer| SurfaceSample {
            state: layer.state.clone(),
            biome: layer.biome.clone(),
            y: layer.y,
            sky_light: layer.sky_light,
            block_light: layer.block_light,
        })
}

fn live_surface_sample(
    snapshot: &ChunkView,
    local_x: usize,
    local_z: usize,
) -> Option<SurfaceSample> {
    snapshot
        .surface_layer(local_x, local_z)
        .map(|layer| SurfaceSample {
            state: layer.state.clone(),
            biome: layer.biome.clone(),
            y: layer.y,
            sky_light: layer.sky_light,
            block_light: layer.block_light,
        })
}

fn surface_base_colour(sample: &SurfaceSample, assets: Option<&MapAssets>, u: f32, v: f32) -> Rgba {
    surface_face_colour(sample, assets, Face::Up, u, v)
}

fn surface_face_colour(
    sample: &SurfaceSample,
    assets: Option<&MapAssets>,
    face: Face,
    u: f32,
    v: f32,
) -> Rgba {
    let face_name = match face {
        Face::Down => "down",
        Face::Up => "up",
        Face::North => "north",
        Face::South => "south",
        Face::West => "west",
        Face::East => "east",
    };
    assets
        .map(|assets| {
            assets.sample_state_face_at_with_biome(&sample.state, &sample.biome, face_name, u, v)
        })
        .unwrap_or_else(|| map_assets::fallback_block_colour(&sample.state))
}

fn shaded_surface_colour(
    sample: &SurfaceSample,
    assets: Option<&MapAssets>,
    u: f32,
    v: f32,
    face: Face,
) -> Rgba {
    shade_surface(
        surface_base_colour(sample, assets, u, v),
        sample.y,
        sample.sky_light,
        sample.block_light,
        face,
    )
}

fn surface_colour(
    chunk: &JavaChunk,
    local_x: usize,
    local_z: usize,
    assets: Option<&MapAssets>,
) -> Rgba {
    let Some(sample) = chunk_surface_sample(chunk, local_x, local_z) else {
        return fallback_terrain_colour(0, 0);
    };
    shaded_surface_colour(&sample, assets, 0.5, 0.5, Face::Up)
}

fn live_surface_colour(
    snapshot: &ChunkView,
    local_x: usize,
    local_z: usize,
    assets: Option<&MapAssets>,
) -> Rgba {
    let Some(sample) = live_surface_sample(snapshot, local_x, local_z) else {
        return fallback_terrain_colour(0, 0);
    };
    shaded_surface_colour(&sample, assets, 0.5, 0.5, Face::Up)
}

fn average_surface_colours(colours: impl IntoIterator<Item = Rgba>) -> Rgba {
    let mut sums = [0u64; 4];
    let mut count = 0u64;
    for colour in colours {
        if colour[3] == 0 {
            continue;
        }
        for (sum, value) in sums.iter_mut().zip(colour) {
            *sum += u64::from(value);
        }
        count += 1;
    }
    if count == 0 {
        return fallback_terrain_colour(0, 0);
    }
    [
        (sums[0] / count) as u8,
        (sums[1] / count) as u8,
        (sums[2] / count) as u8,
        (sums[3] / count) as u8,
    ]
}

fn chunk_representative_colour(chunk: &JavaChunk, assets: Option<&MapAssets>) -> Rgba {
    average_surface_colours((0..16).flat_map(|local_z| {
        (0..16).map(move |local_x| surface_colour(chunk, local_x, local_z, assets))
    }))
}

pub(crate) fn existing_chunk_coordinates_for_tile(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
) -> Result<Vec<(i64, i64)>, String> {
    let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    if geometry.plane == MapTilePlane::IsoProjected {
        return ray_chunk_coordinates_for_tile(world_root, zoom, tile_x, tile_y);
    }
    let bounds = geometry
        .world_bounds()
        .expect("WorldXZ geometry must have world bounds");
    let min_chunk_x = floor_div(bounds.origin_x, 16);
    let max_chunk_x = floor_div(bounds.max_x(), 16);
    let min_chunk_z = floor_div(bounds.origin_z, 16);
    let max_chunk_z = floor_div(bounds.max_z(), 16);
    present_chunks_for_bounds(
        world_root,
        min_chunk_x,
        max_chunk_x,
        min_chunk_z,
        max_chunk_z,
    )
}

pub(crate) fn ray_chunk_coordinates_for_tile(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
) -> Result<Vec<(i64, i64)>, String> {
    let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    if geometry.plane != MapTilePlane::IsoProjected {
        return existing_chunk_coordinates_for_tile(world_root, zoom, tile_x, tile_y);
    }
    let perspective = IsoHDPerspective::default();
    let (min_world_x, max_world_x, min_world_z, max_world_z) = perspective
        .world_xz_bounds_for_geometry(geometry, -64.0, 320.0)
        .expect("Iso geometry must have projected bounds");
    let min_chunk_x = floor_div(min_world_x - RAY_CHUNK_PADDING_BLOCKS, 16);
    let max_chunk_x = floor_div(max_world_x + RAY_CHUNK_PADDING_BLOCKS, 16);
    let min_chunk_z = floor_div(min_world_z - RAY_CHUNK_PADDING_BLOCKS, 16);
    let max_chunk_z = floor_div(max_world_z + RAY_CHUNK_PADDING_BLOCKS, 16);
    let candidates = present_chunks_for_bounds(
        world_root,
        min_chunk_x,
        max_chunk_x,
        min_chunk_z,
        max_chunk_z,
    )?;
    Ok(candidates
        .into_iter()
        .filter(|&(chunk_x, chunk_z)| {
            perspective
                .projected_geometry_intersects_chunk(geometry, -64.0, 320.0, chunk_x, chunk_z)
        })
        .collect())
}

pub(crate) fn render_overview_tile(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    assets: Option<&MapAssets>,
    live_chunks: Option<&LiveChunkMap>,
) -> Result<TileRenderResult, String> {
    let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    if geometry.plane != MapTilePlane::WorldXZ {
        return Err("Overview renderer received projected tile geometry".to_string());
    }
    let bounds = geometry
        .world_bounds()
        .expect("WorldXZ geometry must have world bounds");
    let mut chunks: HashMap<(i64, i64), Result<Option<JavaChunk>, String>> = HashMap::new();
    let mut diagnostic = None;
    let mut decode_failed_chunk_count = 0;
    let mut coordinates = existing_chunk_coordinates_for_tile(world_root, zoom, tile_x, tile_y)?;
    if let Some(live_chunks) = live_chunks {
        for snapshot in live_chunks.values() {
            if !coordinates.contains(&(snapshot.key.chunk_x, snapshot.key.chunk_z))
                && bounds.intersects_chunk(snapshot.key.chunk_x, snapshot.key.chunk_z)
            {
                coordinates.push((snapshot.key.chunk_x, snapshot.key.chunk_z));
            }
        }
    }

    let mut tile_buffer = RgbaTileBuffer::new(TILE_SIZE as usize, TILE_SIZE as usize);
    let mut rendered_chunk_count = 0;
    for (chunk_x, chunk_z) in coordinates {
        let colour = if let Some(snapshot) =
            live_chunks.and_then(|chunks| chunks.get(&(chunk_x, chunk_z)))
        {
            average_surface_colours((0..16).flat_map(|local_z| {
                (0..16).map(move |local_x| live_surface_colour(snapshot, local_x, local_z, assets))
            }))
        } else {
            render_chunk(
                world_root,
                chunk_x,
                chunk_z,
                &mut chunks,
                &mut diagnostic,
                &mut decode_failed_chunk_count,
            )
            .map(|chunk| chunk_representative_colour(chunk, assets))
            .unwrap_or_else(|| fallback_terrain_colour(0, 0))
        };
        if colour[3] == 0 {
            continue;
        }
        rendered_chunk_count += 1;

        // A chunk can cover less than one output pixel at overview zooms. The
        // old implementation wrote only the chunk centre, which made sparse
        // generated terrain disappear whenever the fixed sample missed it.
        // Rasterize the complete chunk footprint instead and aggregate all
        // present chunks landing in the same overview pixel.
        let Some((pixel_x, pixel_z)) = bounds.chunk_pixel_range(chunk_x, chunk_z) else {
            continue;
        };
        tile_buffer.add_rect(pixel_x, pixel_z, colour);
    }

    let has_terrain = tile_buffer.covered_pixels() > 0;
    let coverage_ratio = tile_buffer.coverage_ratio();
    let png = encode_png_rgba(TILE_SIZE, TILE_SIZE, &tile_buffer.into_scanlines())?;
    Ok(TileRenderResult {
        png,
        rendered_chunk_count,
        decode_failed_chunk_count,
        has_terrain,
        coverage_ratio,
        message: diagnostic,
    })
}

pub(crate) fn render_world_tile_detailed(
    world_root: &Path,
    zoom: u8,
    tile_x: i32,
    tile_y: i32,
    assets: Option<&MapAssets>,
    live_chunks: Option<&LiveChunkMap>,
) -> Result<TileRenderResult, String> {
    let geometry = MapTileGeometry::new(TILE_SIZE as usize, MAX_ZOOM, zoom, tile_x, tile_y)?;
    if geometry.plane == MapTilePlane::WorldXZ {
        return render_overview_tile(world_root, zoom, tile_x, tile_y, assets, live_chunks);
    }
    let saved_chunk_coordinates = ray_chunk_coordinates_for_tile(world_root, zoom, tile_x, tile_y)?;
    if live_chunks.is_none_or(HashMap::is_empty) && saved_chunk_coordinates.is_empty() {
        // Avoid walking tens of thousands of air voxels for a tile whose
        // region headers already prove that no saved chunk intersects it.
        return empty_tile_result();
    }

    let mut chunks: HashMap<(i64, i64), Result<Option<JavaChunk>, String>> = HashMap::new();
    let mut diagnostic = None;
    let mut decode_failed_chunk_count = 0;
    let mut rendered_chunks = HashSet::new();
    let live_chunks = live_chunks.cloned().unwrap_or_default();
    let all_saved_chunk_coordinates = enumerate_region_files(world_root)?
        .into_iter()
        .flat_map(|index| index.present_chunks().iter().copied().collect::<Vec<_>>())
        .collect::<HashSet<_>>();
    let mut max_surface_cache = HashMap::new();
    for &(chunk_x, chunk_z) in &saved_chunk_coordinates {
        let max_surface = render_chunk(
            world_root,
            chunk_x,
            chunk_z,
            &mut chunks,
            &mut diagnostic,
            &mut decode_failed_chunk_count,
        )
        .and_then(chunk_max_surface_y);
        max_surface_cache.insert((chunk_x, chunk_z), max_surface);
    }
    for ((chunk_x, chunk_z), snapshot) in &live_chunks {
        max_surface_cache.insert((*chunk_x, *chunk_z), live_chunk_max_surface_y(snapshot));
    }
    let mut model_cache: HashMap<(String, String), Option<Vec<RenderFace>>> = HashMap::new();
    let assets_for_models = assets;
    let min_y = live_chunks
        .values()
        .map(|snapshot| snapshot.min_y)
        .min()
        .unwrap_or(-64);
    let max_y = live_chunks
        .values()
        .map(|snapshot| snapshot.max_y)
        .max()
        .unwrap_or(320);
    let rendered = render_iso_tile(
        geometry,
        min_y,
        max_y,
        |world_x, y, world_z| {
            let chunk_x = floor_div(world_x, 16);
            let chunk_z = floor_div(world_z, 16);
            let local_x = floor_mod(world_x, 16) as usize;
            let local_z = floor_mod(world_z, 16) as usize;
            if let Some(snapshot) = live_chunks.get(&(chunk_x, chunk_z)) {
                let sample = live_block_sample(snapshot, local_x, y, local_z);
                if sample.is_some() {
                    rendered_chunks.insert((chunk_x, chunk_z));
                }
                return sample;
            }
            let sample = render_chunk(
                world_root,
                chunk_x,
                chunk_z,
                &mut chunks,
                &mut diagnostic,
                &mut decode_failed_chunk_count,
            )
            .and_then(|chunk| complete_block_sample(chunk, local_x, y, local_z));
            if sample.is_some() {
                rendered_chunks.insert((chunk_x, chunk_z));
            }
            sample
        },
        |world_x, world_z| {
            let key = (floor_div(world_x, 16), floor_div(world_z, 16));
            max_surface_cache.get(&key).copied().map_or_else(
                || (!all_saved_chunk_coordinates.contains(&key)).then_some(min_y - 1),
                |max_surface| max_surface.or(Some(min_y - 1)),
            )
        },
        |sample| {
            let Some(assets) = assets_for_models else {
                return None;
            };
            let key = (sample.state.clone(), sample.biome.clone());
            model_cache
                .entry(key)
                .or_insert_with(|| assets.model_faces(&sample.state))
                .clone()
        },
        |sample, face, u, v| {
            assets_for_models
                .map(|assets| assets.sample_model_face(&sample.state, &sample.biome, face, u, v))
                .unwrap_or_else(|| map_assets::fallback_block_colour(&sample.state))
        },
    )?;
    let pixels = rgba_pixels_to_scanlines(&rendered.pixels, TILE_SIZE as usize, TILE_SIZE as usize);
    let png = encode_png_rgba(TILE_SIZE, TILE_SIZE, &pixels)?;
    let has_terrain = rendered.coverage_ratio > 0.0;
    Ok(TileRenderResult {
        png,
        rendered_chunk_count: rendered_chunks.len(),
        decode_failed_chunk_count,
        has_terrain,
        coverage_ratio: rendered.coverage_ratio,
        message: diagnostic,
    })
}

fn empty_tile_result() -> Result<TileRenderResult, String> {
    let tile_buffer = RgbaTileBuffer::new(TILE_SIZE as usize, TILE_SIZE as usize);
    let png = encode_png_rgba(TILE_SIZE, TILE_SIZE, &tile_buffer.into_scanlines())?;
    Ok(TileRenderResult {
        png,
        rendered_chunk_count: 0,
        decode_failed_chunk_count: 0,
        has_terrain: false,
        coverage_ratio: 0.0,
        message: None,
    })
}

fn rgba_pixels_to_scanlines(pixels: &[u8], width: usize, height: usize) -> Vec<u8> {
    let mut scanlines = Vec::with_capacity(height * (1 + width * 4));
    for row in pixels.chunks_exact(width * 4).take(height) {
        scanlines.push(0);
        scanlines.extend_from_slice(row);
    }
    scanlines
}

fn encode_png_rgba(width: u32, height: u32, raw_scanlines: &[u8]) -> Result<Vec<u8>, String> {
    let expected = height as usize * (1 + width as usize * 4);
    if raw_scanlines.len() != expected {
        return Err("PNG scanline buffer has an invalid size".to_string());
    }
    let mut compressed = ZlibEncoder::new(Vec::new(), Compression::fast());
    compressed
        .write_all(raw_scanlines)
        .map_err(|error| format!("Failed to compress map tile: {error}"))?;
    let compressed = compressed
        .finish()
        .map_err(|error| format!("Failed to finish map tile compression: {error}"))?;

    let mut png = Vec::new();
    png.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    append_png_chunk(&mut png, *b"IHDR", &header);
    append_png_chunk(&mut png, *b"IDAT", &compressed);
    append_png_chunk(&mut png, *b"IEND", &[]);
    Ok(png)
}

fn append_png_chunk(png: &mut Vec<u8>, kind: [u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    png.extend_from_slice(&kind);
    png.extend_from_slice(data);
    let mut crc_input = Vec::with_capacity(kind.len() + data.len());
    crc_input.extend_from_slice(&kind);
    crc_input.extend_from_slice(data);
    png.extend_from_slice(&crc32(&crc_input).to_be_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}
