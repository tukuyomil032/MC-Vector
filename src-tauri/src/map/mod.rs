pub mod assets;
pub mod projection;
pub mod render;
pub mod tile_buffer;
pub mod tiles;
pub mod world;

/// Stable world-facing data types consumed by the application and renderer.
pub(crate) mod domain {
    pub(crate) use super::world::{ChunkKey, ChunkView};
}

/// Application-side scheduling, cache, and tile identity services.
pub(crate) mod application {
    pub(crate) use super::tiles::{
        CachedTile, MemoryTileCache, RenderProgress, TileKey, TileMetadata, TilePriority,
        TileRenderState, TileScheduler, DEFAULT_PERSPECTIVE,
    };
}

/// World sources normalize saved Anvil data and live bridge snapshots.
pub(crate) mod sources {
    pub(crate) use super::world::{
        decode_live_snapshot, enumerate_region_files, is_air_state, present_chunks_for_bounds,
        read_complete_chunk, read_level_metadata, LiveSnapshotCache,
    };
}

/// Renderer-facing boundary for projection-independent rasterization.
pub(crate) mod renderer {
    pub(crate) use super::render::{render_iso_tile, shade_surface, Face, SurfaceSample};
}
