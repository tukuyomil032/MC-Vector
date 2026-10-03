//! Differential checks against fixed traces captured from the pinned Dynmap Java harness.

use std::collections::BTreeMap;

use map_renderer_core::assets::model_view::AssetResolutionState;
use map_renderer_core::builtins::simple::{
    BoxRenderer, CuboidRenderer, PaneRenderer, PlantRenderer,
};
use map_renderer_core::renderer::dynmap::custom::{
    CustomRenderer, DynmapBlockState, MapDataContext, RenderPatchFactory,
};
use map_renderer_core::renderer::dynmap::patch::PatchDefinition;
use map_renderer_core::renderer::dynmap::types::SideVisible;
use map_renderer_core::world::chunk_view::{
    BiomeData, BlockCoord, BlockStateId, ChunkCoord, ChunkLoadState, HeightData, MapChunkCache,
    TileBoundaryState,
};
use serde_json::{json, Value};

fn fixture_chunk() -> MapChunkCache {
    MapChunkCache::new(
        ChunkCoord::new(0, 0),
        ChunkLoadState::Loaded,
        BTreeMap::new(),
        BiomeData::Missing,
        HeightData::Missing,
        TileBoundaryState::Missing,
        AssetResolutionState::Available,
    )
}

fn fixture_state() -> DynmapBlockState {
    DynmapBlockState {
        id: BlockStateId(1).0,
        name: "minecraft:fixture".to_owned(),
        properties: BTreeMap::new(),
    }
}

fn patch_json(patch: &PatchDefinition) -> Value {
    json!({
        "geometry": [
            patch.origin.x, patch.origin.y, patch.origin.z,
            patch.u_end.x, patch.u_end.y, patch.u_end.z,
            patch.v_end.x, patch.v_end.y, patch.v_end.z,
        ],
        "uv": [
            patch.umin, patch.umax, patch.vmin, patch.vmax,
            patch.vmin_at_umax, patch.vmax_at_umax,
        ],
        "side": patch.side_visible.reference_name(),
        "textureIndex": patch.texture_index,
    })
}

fn render_trace(name: &str, renderer: &dyn CustomRenderer) -> Value {
    let chunk = fixture_chunk();
    let context = MapDataContext::new(&chunk, BlockCoord::new(0, 0, 0));
    let patches = renderer
        .render(&fixture_state(), &context, &RenderPatchFactory)
        .unwrap_or_else(|error| panic!("{name} renderer failed: {error:?}"));
    json!({
        "renderer": name,
        "patches": patches.iter().map(patch_json).collect::<Vec<_>>(),
    })
}

fn assert_fixture(name: &str, renderer: &dyn CustomRenderer, expected: &str) {
    let actual = render_trace(name, renderer);
    let expected: Value = serde_json::from_str(expected).expect("valid fixed reference trace");
    assert_eq!(actual, expected, "Rust trace diverged for {name}");
}

#[test]
fn simple_builtin_traces_match_pinned_dynmap_reference() {
    assert_fixture(
        "box",
        &BoxRenderer::default(),
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../tests/fixtures/map/dynmap-reference/r29/box.json"
        )),
    );
    assert_fixture(
        "cuboid",
        &CuboidRenderer::empty(),
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../tests/fixtures/map/dynmap-reference/r29/cuboid.json"
        )),
    );
    assert_fixture(
        "pane",
        &PaneRenderer::default(),
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../tests/fixtures/map/dynmap-reference/r29/pane.json"
        )),
    );
    assert_fixture(
        "plant",
        &PlantRenderer::default(),
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../tests/fixtures/map/dynmap-reference/r29/plant.json"
        )),
    );
}

#[test]
fn reference_side_labels_cover_the_dynmap_visibility_contract() {
    assert_eq!(SideVisible::Top.reference_name(), "TOP");
    assert_eq!(SideVisible::Both.reference_name(), "BOTH");
    assert_eq!(SideVisible::Flip.reference_name(), "FLIP");
}
