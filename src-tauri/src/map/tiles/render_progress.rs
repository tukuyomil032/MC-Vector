use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TileRenderState {
    Terrain,
    Empty,
    Rendering,
    Error,
    AssetMissing,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderProgress {
    pub(crate) state: TileRenderState,
    pub(crate) completed: usize,
    pub(crate) total: usize,
    pub(crate) message: Option<String>,
}

impl RenderProgress {
    pub(crate) fn rendering(completed: usize, total: usize) -> Self {
        Self {
            state: TileRenderState::Rendering,
            completed,
            total,
            message: None,
        }
    }

    pub(crate) fn completed(state: TileRenderState, message: Option<String>) -> Self {
        Self {
            state,
            completed: 1,
            total: 1,
            message,
        }
    }

    pub(crate) fn error(message: impl Into<String>) -> Self {
        Self {
            state: TileRenderState::Error,
            completed: 0,
            total: 1,
            message: Some(message.into()),
        }
    }
}
