//! Fixed renderer vectors and fixture inventory for the Dynmap differential gate.
//!
//! The expected values in this module are committed evidence.  Tests must not
//! write a new expected PNG or digest during execution.  Full reference
//! captures from a runnable Dynmap Java harness remain a separate R05 gate and
//! are intentionally reported as pending until that harness is available.

use std::collections::BTreeMap;

use sha2::{Digest, Sha256};

use super::hd_perspective::render_chunk;
use super::iso_hd_perspective::IsoProjection;
use super::lighting::Lighting;
use super::patch::{PatchDefinition, Ray};
use super::texture::{TextureAtlas, TextureImage};
use super::types::{SideVisible, Vec3};
use crate::map::assets::model_view::{AssetKey, AssetResolutionState, ModelDefinition, ModelView};
use crate::map::renderer::RendererDomain;
use crate::map::world::chunk_view::{
    BiomeData, BlockCoord, BlockState, BlockStateData, BlockStateId, ChunkCoord, ChunkLoadState,
    ChunkSection, HeightData, LightData, MapChunkCache, SectionPalette, TileBoundary,
    TileBoundaryState, CHUNK_COLUMN_COUNT, SECTION_BLOCK_COUNT,
};

const FIXTURE_MANIFEST: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../tests/fixtures/dynmap/manifest.json"
));

fn flat_fixture_domain() -> (MapChunkCache, ModelView) {
    let section = ChunkSection {
        section_y: 0,
        block_states: BlockStateData::complete(
            SectionPalette::complete(vec![BlockState {
                id: BlockStateId(0),
                name: "minecraft:stone|".to_owned(),
            }])
            .unwrap(),
            vec![0; SECTION_BLOCK_COUNT],
        )
        .unwrap(),
        biome: BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).unwrap(),
        height: HeightData::complete(vec![16; CHUNK_COLUMN_COUNT]).unwrap(),
        sky_light: LightData::complete(vec![15; SECTION_BLOCK_COUNT]).unwrap(),
        block_light: LightData::complete(vec![0; SECTION_BLOCK_COUNT]).unwrap(),
    };
    let mut sections = BTreeMap::new();
    sections.insert(0, section);
    let chunk = MapChunkCache::new(
        ChunkCoord::new(0, 0),
        ChunkLoadState::Loaded,
        sections,
        BiomeData::complete(vec![0; CHUNK_COLUMN_COUNT]).unwrap(),
        HeightData::complete(vec![16; CHUNK_COLUMN_COUNT]).unwrap(),
        TileBoundaryState::Present(
            TileBoundary::new(BlockCoord::new(0, 0, 0), BlockCoord::new(16, 16, 16)).unwrap(),
        ),
        AssetResolutionState::Available,
    );
    let patch = PatchDefinition::new(
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(1.0, 1.0, 0.0),
        Vec3::new(0.0, 1.0, 1.0),
        0.0,
        1.0,
        0.0,
        1.0,
        0.0,
        1.0,
        SideVisible::Both,
        1,
        true,
    )
    .unwrap();
    let models = ModelView::new(AssetResolutionState::Available).with_model(
        BlockStateId(0),
        ModelDefinition {
            model_id: AssetKey::new("minecraft:block/stone"),
            patches: vec![patch],
        },
    );
    (chunk, models)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn fixture_manifest_is_fixed_and_contains_the_required_matrix() {
    let manifest: serde_json::Value =
        serde_json::from_str(FIXTURE_MANIFEST).expect("fixture manifest must be valid JSON");
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(
        manifest["sourceRevision"],
        "93b454efb8802dc7406d6873434f2aeec5c636f4"
    );
    let cases = manifest["cases"]
        .as_array()
        .expect("cases must be an array");
    let ids: Vec<_> = cases
        .iter()
        .map(|case| case["id"].as_str().expect("case id must be a string"))
        .collect();
    for required in [
        "flat",
        "mountain-cliff",
        "water",
        "forest-leaves",
        "snow",
        "stairs",
        "slabs",
        "fences",
        "doors",
        "glass",
        "chunk-boundary",
        "missing-texture",
        "malformed-chunk",
        "unloaded-chunk",
        "custom-resource-pack",
    ] {
        assert!(ids.contains(&required), "missing fixture case {required}");
    }
    assert!(
        cases
            .iter()
            .all(|case| case["expectedGeneratedAt"].is_null()),
        "goldens must be committed, never generated during tests"
    );
}

#[test]
fn flat_fixture_png_matches_committed_digest() {
    let (chunk, models) = flat_fixture_domain();
    let domain = RendererDomain::new(&chunk, &models);
    let mut atlas = TextureAtlas::default();
    atlas.insert(
        1,
        TextureImage::new(1, 1, vec![[120, 80, 40, 255]]).unwrap(),
    );
    let lighting = Lighting::new(
        [
            0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 221, 238, 255,
        ],
        0.1,
    );
    let tile = render_chunk(
        &domain,
        IsoProjection::new(128, 128, 4.0, 16.0),
        &atlas,
        lighting,
    )
    .unwrap();
    let png = tile.png().unwrap();
    assert!(tile.has_terrain());
    assert_eq!(
        sha256_hex(&png),
        "3a253863fb49f9ff5145fec64c75071b5792e991dc3a32594108fafa9480773f"
    );
}

#[test]
fn fixed_reference_vectors_cover_geometry_and_lighting_boundaries() {
    let projection = IsoProjection::new(512, 384, 2.5, 16.0);
    let world = Vec3::new(7.25, 16.0, -3.5);
    let screen = projection.project(world);
    let restored = projection.unproject(screen.0, screen.1);
    assert!((restored.x - world.x).abs() < 1e-9);
    assert!((restored.z - world.z).abs() < 1e-9);

    let patch = PatchDefinition::new(
        Vec3::ZERO,
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        0.25,
        0.75,
        0.0,
        1.0,
        0.2,
        0.8,
        SideVisible::Front,
        0,
        true,
    )
    .unwrap();
    let hit = patch
        .intersect(Ray::new(
            Vec3::new(0.5, 0.5, 1.0),
            Vec3::new(0.0, 0.0, -1.0),
        ))
        .unwrap();
    assert!((hit.u - 0.5).abs() < 1e-9);
    assert!((hit.v - 0.5).abs() < 1e-9);
}
