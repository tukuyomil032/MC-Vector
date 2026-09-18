pub(crate) mod application;
pub mod assets;
pub(crate) mod bridge;
pub(crate) mod domain;
pub mod projection;
pub mod render;
pub mod tile_buffer;
pub mod tiles;
pub mod world;

/// World sources normalize saved Anvil data and live bridge snapshots.
pub(crate) mod sources {
    pub(crate) use super::world::{
        decode_live_snapshot, enumerate_region_files, is_air_state, present_chunks_for_bounds,
        read_complete_chunk, read_level_metadata, LiveSnapshotCache,
    };
}

/// Renderer-facing boundary for projection-independent rasterization and
/// source-derived perspective geometry.
pub(crate) mod renderer;
