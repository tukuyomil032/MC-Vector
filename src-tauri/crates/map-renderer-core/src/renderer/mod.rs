pub mod dynmap;
pub mod png;

use crate::assets::model_view::ModelView;
use crate::world::chunk_view::MapChunkCache;

/// Immutable input boundary shared by future renderer implementations.
pub struct RendererDomain<'a> {
    pub chunk: &'a MapChunkCache,
    pub models: &'a ModelView,
}

impl<'a> RendererDomain<'a> {
    pub const fn new(chunk: &'a MapChunkCache, models: &'a ModelView) -> Self {
        Self { chunk, models }
    }
}
