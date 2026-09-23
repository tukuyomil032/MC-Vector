//! Redacted Tauri-facing Map request, status, and event contracts.
//!
//! These types intentionally contain no filesystem paths, tokens, raw HTTP
//! bodies, or internal error strings.  The application may emit them directly
//! over Tauri events without leaking renderer internals.

use serde::{Deserialize, Serialize};

use crate::bridge::{BridgeState, TerrainState};
use crate::cache::TileRenderSource;
use crate::domain::MinecraftVersionId;
use crate::renderer::dynmap::tile::{TileCoordinate, TileProjection};

pub const MAP_RENDER_PROGRESS_EVENT: &str = "map-render-progress";
pub const MAP_TILE_READY_EVENT: &str = "map-tile-ready";
pub const MAP_BRIDGE_STATE_EVENT: &str = "map-bridge-state";
pub const RENDERER_VERSION: &str = "dynmap-93b454efb8802dc7406d6873434f2aeec5c636f4";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRenderRequest {
    pub request_id: String,
    pub server_id: String,
    pub world_id: String,
    pub dimension: String,
    pub minecraft_version: MinecraftVersionId,
    pub projection: TileProjection,
    pub zoom: u8,
    pub width: u32,
    pub height: u32,
    pub center_x: f64,
    pub center_z: f64,
    pub world_center_x: Option<f64>,
    pub world_center_z: Option<f64>,
    pub tile: TileCoordinate,
}

impl MapRenderRequest {
    pub fn validate(&self) -> Result<(), MapIpcError> {
        if self.request_id.trim().is_empty()
            || self.server_id.trim().is_empty()
            || self.world_id.trim().is_empty()
            || self.dimension.trim().is_empty()
        {
            return Err(MapIpcError::InvalidRequest);
        }
        if !self.center_x.is_finite()
            || !self.center_z.is_finite()
            || self.world_center_x.is_some_and(|value| !value.is_finite())
            || self.world_center_z.is_some_and(|value| !value.is_finite())
        {
            return Err(MapIpcError::InvalidCoordinates);
        }
        if self.zoom > 8 || self.width == 0 || self.height == 0 {
            return Err(MapIpcError::InvalidViewport);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MapRenderState {
    Queued,
    Rendering,
    Ready,
    Empty,
    Failed,
    Retryable,
    Cancelled,
    Blocked,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MapCacheState {
    Miss,
    Hit,
    Stale,
    Failed,
    Corrupt,
    Untrusted,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MapUnavailableReason {
    RendererNotConnected,
    BridgeNotConnected,
    NotLoaded,
    WorldUnavailable,
    QueueFull,
    Timeout,
    InvalidSnapshot,
    MissingAsset,
    MalformedAnvil,
    UnsupportedVersion,
    ChecksumMismatch,
    CacheCorrupt,
    NoGeneratedTerrain,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRenderDiagnostics {
    pub bridge_state: BridgeState,
    pub terrain_state: TerrainState,
    pub render_state: MapRenderState,
    pub source: TileRenderSource,
    pub live_requested_count: u32,
    pub live_received_count: u32,
    pub rendered_chunk_count: u32,
    pub decode_failed_chunk_count: u32,
    pub coverage_ratio: f32,
    pub unavailable_reason: Option<MapUnavailableReason>,
    pub renderer_version: String,
    pub minecraft_version: MinecraftVersionId,
    pub asset_version: Option<String>,
    pub cache_state: MapCacheState,
    pub retryable: bool,
}

impl MapRenderDiagnostics {
    /// A connected bridge is not enough to activate Map.  A tile can replace an
    /// existing layer only after the renderer has produced verified terrain.
    pub fn has_verified_terrain(&self) -> bool {
        self.bridge_state == BridgeState::Connected
            && self.terrain_state == TerrainState::Ready
            && self.render_state == MapRenderState::Ready
            && self.source != TileRenderSource::None
            && self.unavailable_reason.is_none()
    }

    pub fn can_activate_map(&self) -> bool {
        self.has_verified_terrain()
    }

    pub fn can_start_render_scheduler(&self) -> bool {
        self.bridge_state == BridgeState::Connected
            && self.terrain_state != TerrainState::Unavailable
            && !matches!(
                self.render_state,
                MapRenderState::Blocked
                    | MapRenderState::Empty
                    | MapRenderState::Failed
                    | MapRenderState::Cancelled
            )
            && self.unavailable_reason.is_none()
    }

    pub fn should_replace_existing_layer(&self) -> bool {
        self.has_verified_terrain()
    }

    pub fn can_save_as_fresh_cache(&self) -> bool {
        self.has_verified_terrain()
    }

    pub fn blocked(minecraft_version: MinecraftVersionId) -> Self {
        Self {
            bridge_state: BridgeState::Disconnected,
            terrain_state: TerrainState::Unknown,
            render_state: MapRenderState::Blocked,
            source: TileRenderSource::None,
            live_requested_count: 0,
            live_received_count: 0,
            rendered_chunk_count: 0,
            decode_failed_chunk_count: 0,
            coverage_ratio: 0.0,
            unavailable_reason: Some(MapUnavailableReason::RendererNotConnected),
            renderer_version: RENDERER_VERSION.to_owned(),
            minecraft_version,
            asset_version: None,
            cache_state: MapCacheState::Miss,
            retryable: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRenderProgressEvent {
    pub request_id: String,
    pub server_id: String,
    pub generation: u64,
    pub diagnostics: MapRenderDiagnostics,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTileReadyEvent {
    pub request_id: String,
    pub server_id: String,
    pub tile: TileCoordinate,
    pub zoom: u8,
    pub png: Option<Vec<u8>>,
    pub diagnostics: MapRenderDiagnostics,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRenderResponse {
    pub request_id: String,
    pub tile: TileCoordinate,
    pub zoom: u8,
    pub diagnostics: MapRenderDiagnostics,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MapIpcError {
    InvalidRequest,
    InvalidCoordinates,
    InvalidViewport,
}

impl MapIpcError {
    pub const fn code(self) -> &'static str {
        match self {
            Self::InvalidRequest => "map_invalid_request",
            Self::InvalidCoordinates => "map_invalid_coordinates",
            Self::InvalidViewport => "map_invalid_viewport",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> MapRenderRequest {
        MapRenderRequest {
            request_id: "request-1".to_owned(),
            server_id: "server-1".to_owned(),
            world_id: "world-1".to_owned(),
            dimension: "minecraft:overworld".to_owned(),
            minecraft_version: MinecraftVersionId::new("1.21.4").expect("fixture version"),
            projection: TileProjection::IsoProjected,
            zoom: 8,
            width: 768,
            height: 768,
            center_x: 0.0,
            center_z: 0.0,
            world_center_x: Some(0.0),
            world_center_z: Some(0.0),
            tile: TileCoordinate::new(0, 0),
        }
    }

    #[test]
    fn request_json_uses_frontend_camel_case_contract() {
        let json = serde_json::to_value(request()).unwrap();
        assert_eq!(json["requestId"], "request-1");
        assert_eq!(json["worldCenterX"], 0.0);
        assert_eq!(json["projection"], "iso_projected");
    }

    #[test]
    fn invalid_coordinates_are_rejected_before_rendering() {
        let mut invalid = request();
        invalid.center_x = f64::NAN;
        assert_eq!(invalid.validate(), Err(MapIpcError::InvalidCoordinates));
    }

    #[test]
    fn blocked_diagnostics_are_redacted_and_not_renderer_ready() {
        let diagnostics = MapRenderDiagnostics::blocked(
            MinecraftVersionId::new("1.21.4").expect("fixture version"),
        );
        let json = serde_json::to_string(&diagnostics).unwrap();
        assert!(json.contains("renderer_not_connected"));
        assert!(!json.contains("/Users/"));
        assert!(!json.contains("token"));
        assert_eq!(diagnostics.render_state, MapRenderState::Blocked);
        assert_eq!(diagnostics.terrain_state, TerrainState::Unknown);
        assert!(!diagnostics.can_activate_map());
        assert!(!diagnostics.can_start_render_scheduler());
        assert!(!diagnostics.should_replace_existing_layer());
        assert!(!diagnostics.can_save_as_fresh_cache());
    }

    #[test]
    fn connected_bridge_without_verified_terrain_cannot_activate_or_replace() {
        let mut diagnostics = MapRenderDiagnostics::blocked(
            MinecraftVersionId::new("1.21.4").expect("fixture version"),
        );
        diagnostics.bridge_state = BridgeState::Connected;
        assert!(!diagnostics.can_activate_map());
        assert!(!diagnostics.should_replace_existing_layer());
    }

    #[test]
    fn failed_empty_and_retryable_results_never_become_fresh_success() {
        let mut diagnostics = MapRenderDiagnostics::blocked(
            MinecraftVersionId::new("1.21.4").expect("fixture version"),
        );
        diagnostics.bridge_state = BridgeState::Connected;
        diagnostics.terrain_state = TerrainState::Ready;
        diagnostics.source = TileRenderSource::Saved;
        for state in [
            MapRenderState::Empty,
            MapRenderState::Failed,
            MapRenderState::Retryable,
        ] {
            diagnostics.render_state = state;
            assert!(!diagnostics.can_activate_map());
            assert!(!diagnostics.can_save_as_fresh_cache());
        }
    }

    #[test]
    fn only_verified_ready_terrain_can_replace_and_activate() {
        let mut diagnostics = MapRenderDiagnostics::blocked(
            MinecraftVersionId::new("1.21.4").expect("fixture version"),
        );
        diagnostics.bridge_state = BridgeState::Connected;
        diagnostics.terrain_state = TerrainState::Ready;
        diagnostics.render_state = MapRenderState::Ready;
        diagnostics.source = TileRenderSource::Saved;
        diagnostics.unavailable_reason = None;
        assert!(diagnostics.can_activate_map());
        assert!(diagnostics.should_replace_existing_layer());
        assert!(diagnostics.can_save_as_fresh_cache());
    }
}
