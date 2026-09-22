use std::collections::HashMap;
use std::io::Cursor;

use fastanvil::Region;
use fastnbt::{ByteArray, Value};
use map_renderer_core::assets::model_view::AssetResolutionState;
use map_renderer_core::bridge::snapshots::v1_21_4 as paper_1_21_4;
use map_renderer_core::bridge::{
    BlockStateSnapshot, ChunkSnapshot, SectionSnapshot, SnapshotRequest, SnapshotResponse,
    SnapshotStatus,
};
use map_renderer_core::domain::MinecraftVersionId;
use map_renderer_core::world::anvil::SavedAnvilSource;
use map_renderer_core::world::anvil_versions::v1_21_4 as anvil_1_21_4;
use map_renderer_core::world::chunk_view::{BlockCoord, ChunkCoord};

fn compound(entries: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Compound(
        entries
            .into_iter()
            .map(|(key, value)| (key.to_owned(), value))
            .collect::<HashMap<_, _>>(),
    )
}

fn chunk_bytes() -> Vec<u8> {
    let block_state = compound([("Name", Value::String("minecraft:stone".to_owned()))]);
    let section = compound([
        ("Y", Value::Byte(0)),
        (
            "block_states",
            compound([("palette", Value::List(vec![block_state]))]),
        ),
        (
            "biomes",
            compound([(
                "palette",
                Value::List(vec![Value::String("minecraft:plains".to_owned())]),
            )]),
        ),
        (
            "SkyLight",
            Value::ByteArray(ByteArray::new(vec![15_i8; 2048])),
        ),
        (
            "BlockLight",
            Value::ByteArray(ByteArray::new(vec![0_i8; 2048])),
        ),
    ]);
    let root = compound([
        ("DataVersion", Value::Int(anvil_1_21_4::DATA_VERSION as i32)),
        ("Status", Value::String("minecraft:full".to_owned())),
        ("x", Value::Int(-2)),
        ("z", Value::Int(4)),
        ("sections", Value::List(vec![section])),
    ]);
    fastnbt::to_bytes(&root).expect("fixture NBT serializes")
}

fn snapshot() -> SnapshotResponse {
    SnapshotResponse {
        request_id: "request-1".to_owned(),
        server_id: "server-1".to_owned(),
        minecraft_version: MinecraftVersionId::new("1.21.4").expect("version"),
        world_id: "world-1".to_owned(),
        dimension: "minecraft:overworld".to_owned(),
        chunk_x: -2,
        chunk_z: 4,
        status: SnapshotStatus::Loaded,
        snapshot: Some(ChunkSnapshot {
            data_version: paper_1_21_4::DATA_VERSION,
            chunk_x: -2,
            chunk_z: 4,
            biomes: vec!["minecraft:plains".to_owned(); 256],
            heightmap: vec![16; 256],
            sections: vec![SectionSnapshot {
                section_y: 0,
                block_palette: vec![BlockStateSnapshot {
                    name: "minecraft:stone".to_owned(),
                    properties: Vec::new(),
                }],
                packed_block_states: vec![0; 256],
                biome_palette: vec!["minecraft:plains".to_owned()],
                sky_light: Some(vec![0x0f; 2048]),
                block_light: Some(vec![0; 2048]),
            }],
        }),
        unavailable_reason: None,
    }
}

fn request() -> SnapshotRequest {
    SnapshotRequest {
        request_id: "request-1".to_owned(),
        server_id: "server-1".to_owned(),
        minecraft_version: MinecraftVersionId::new("1.21.4").expect("version"),
        world_id: "world-1".to_owned(),
        dimension: "minecraft:overworld".to_owned(),
        chunk_x: -2,
        chunk_z: 4,
    }
}

#[test]
fn saved_and_live_sources_produce_the_same_renderer_data() {
    let root = std::env::temp_dir().join(format!(
        "mc-vector-saved-live-equivalence-{}",
        std::process::id()
    ));
    let region_dir = root.join("region");
    std::fs::create_dir_all(&region_dir).expect("fixture directory");
    let mut region = Region::create(Cursor::new(Vec::new())).expect("create region");
    region
        .write_chunk((-2_i64).rem_euclid(32) as usize, 4, &chunk_bytes())
        .expect("write region chunk");
    let region_bytes = region.into_inner().expect("finish region").into_inner();
    std::fs::write(region_dir.join("r.-1.0.mca"), region_bytes).expect("write region");

    let saved = SavedAnvilSource::new(&root)
        .load_chunk(ChunkCoord::new(-2, 4))
        .expect("read saved chunk")
        .expect("saved chunk exists");
    let live = paper_1_21_4::decode(&request(), &snapshot(), AssetResolutionState::Available)
        .expect("decode live snapshot");

    let saved_section = saved.sections.get(&0).expect("saved section");
    let live_section = live.sections.get(&0).expect("live section");
    assert_eq!(saved_section.block_states, live_section.block_states);
    assert_eq!(saved_section.sky_light, live_section.sky_light);
    assert_eq!(saved_section.block_light, live_section.block_light);
    assert_eq!(saved.biome, live.biome);
    assert_eq!(saved.height, live.height);
    assert_eq!(
        saved
            .block_state_at(BlockCoord::new(-32, 0, 64))
            .expect("saved block")
            .name,
        live.block_state_at(BlockCoord::new(-32, 0, 64))
            .expect("live block")
            .name
    );
    assert_eq!(
        saved
            .light_at(BlockCoord::new(-32, 0, 64))
            .expect("saved light"),
        live.light_at(BlockCoord::new(-32, 0, 64))
            .expect("live light")
    );

    std::fs::remove_dir_all(root).expect("remove fixture");
}
