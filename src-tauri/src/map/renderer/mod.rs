/*
 * SPDX-License-Identifier: Apache-2.0
 * SPDX-FileCopyrightText: Dynmap contributors
 *
 * Origin: https://github.com/webbukkit/dynmap
 * Source-Ref: https://github.com/webbukkit/dynmap/blob/93b454efb8802dc7406d6873434f2aeec5c636f4/DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java
 * Ported-to: src-tauri/src/map/renderer/mod.rs
 * Changes: Added a Rust-only renderer boundary and moved model-face UV
 *          rotation into the renderer; Dynmap runtime, Bukkit, and Java
 *          dependencies are intentionally excluded.
*/

use std::collections::HashMap;

use serde::Serialize;

pub(crate) mod dynmap;
pub(crate) mod world_tile;

use crate::map::assets::RenderFace;
use crate::map::domain::ChunkView;
use crate::map::projection::MapTileGeometry;
use crate::map::render::{
    render_iso_tile as render_iso_tile_core, RenderedSurfaceTile, SurfaceSample,
};

pub(crate) use dynmap::iso_hd::IsoHDPerspective;
pub(crate) use world_tile::render_world_tile_detailed;

pub(crate) const MAX_ZOOM: u8 = 8;
pub(crate) const TILE_SIZE: u32 = 256;

pub(crate) type LiveChunkMap = HashMap<(i64, i64), ChunkView>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TileRenderResult {
    pub(crate) png: Vec<u8>,
    pub(crate) rendered_chunk_count: usize,
    pub(crate) decode_failed_chunk_count: usize,
    pub(crate) has_terrain: bool,
    pub(crate) coverage_ratio: f32,
    pub(crate) message: Option<String>,
}

/// Render through the existing world-tile path while applying model-face UV
/// rotation at the source-derived renderer boundary.
pub(crate) fn render_iso_tile<F, S, M, MC>(
    geometry: MapTileGeometry,
    min_y: i32,
    max_y: i32,
    block_at: F,
    max_surface_at: S,
    model_for: M,
    mut sample_model_color: MC,
) -> Result<RenderedSurfaceTile, String>
where
    F: FnMut(i64, i32, i64) -> Option<SurfaceSample>,
    S: FnMut(i64, i64) -> Option<i32>,
    M: FnMut(&SurfaceSample) -> Option<Vec<RenderFace>>,
    MC: FnMut(&SurfaceSample, &RenderFace, f32, f32) -> [u8; 4],
{
    render_iso_tile_core(
        geometry,
        min_y,
        max_y,
        block_at,
        max_surface_at,
        model_for,
        |sample, face, u, v| {
            let (sampling_face, u, v) = prepare_face_sample(face, u, v);
            sample_model_color(sample, &sampling_face, u, v)
        },
    )
}

fn prepare_face_sample(face: &RenderFace, u: f32, v: f32) -> (RenderFace, f32, f32) {
    let (u, v) = dynmap::texture::rotate_face_uv(face.rotation, u, v);
    let mut sampling_face = face.clone();
    sampling_face.rotation = 0;
    (sampling_face, u, v)
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use super::*;

    #[test]
    fn renderer_boundary_applies_face_rotation_once_before_sampling() {
        let face = RenderFace {
            direction: crate::map::assets::RenderFaceDirection::Up,
            vertices: [[0.0; 3]; 4],
            texture: "minecraft:block/test".to_string(),
            uv: [0.0, 0.0, 16.0, 16.0],
            rotation: 90,
            tint_index: None,
            shade: false,
        };
        let (sampling_face, u, v) = prepare_face_sample(&face, 0.25, 0.75);

        assert_eq!((u, v), (0.25, 0.25));
        assert_eq!(sampling_face.rotation, 0);
    }

    #[test]
    fn render_path_forwards_zero_rotation_faces_to_the_asset_sampler() {
        let geometry = MapTileGeometry::new(8, 8, 8, 0, 0).expect("valid geometry");
        let observed_rotation = Rc::new(RefCell::new(None));
        let observed_rotation_for_sampler = Rc::clone(&observed_rotation);

        let rendered = render_iso_tile(
            geometry,
            -64,
            320,
            |_x, y, _z| {
                (y == 64).then_some(SurfaceSample {
                    state: "minecraft:test".to_string(),
                    biome: "minecraft:plains".to_string(),
                    y,
                    sky_light: 15,
                    block_light: 0,
                })
            },
            |_x, _z| Some(64),
            |_sample| {
                let mut faces = crate::map::render::default_cube_faces();
                for face in &mut faces {
                    face.rotation = 90;
                }
                Some(faces)
            },
            move |_sample, face, _u, _v| {
                *observed_rotation_for_sampler.borrow_mut() = Some(face.rotation);
                [255, 255, 255, 255]
            },
        )
        .expect("renderer should produce a tile");

        assert!(rendered.coverage_ratio > 0.0);
        assert_eq!(*observed_rotation.borrow(), Some(0));
    }
}
