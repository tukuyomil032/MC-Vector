//! Versioned Paper snapshot bridge contract.
//!
//! Paper is a data provider at this boundary.  It never owns rendering.  The
//! request/response validation here is deliberately independent from a socket
//! or Tauri command so the same contract can be exercised by fixture, Paper,
//! and eventual real-transport adapters.

use serde::{Deserialize, Serialize};

use crate::domain::MinecraftVersionId;

pub mod snapshots;

pub const PROTOCOL_VERSION: u16 = 2;

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BridgeMessage {
    HelloRequest(HelloRequest),
    HelloResponse(HelloResponse),
    Heartbeat(Heartbeat),
    SnapshotRequest(SnapshotRequest),
    SnapshotResponse(SnapshotResponse),
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct HelloRequest {
    pub protocol_version: u16,
    pub server_id: String,
    pub minecraft_version: MinecraftVersionId,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct HelloResponse {
    pub protocol_version: u16,
    pub server_id: String,
    pub plugin_version: String,
    pub minecraft_version: MinecraftVersionId,
    pub status: HelloStatus,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HelloStatus {
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
pub struct Heartbeat {
    pub sequence: u64,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct SnapshotRequest {
    pub request_id: String,
    pub server_id: String,
    pub minecraft_version: MinecraftVersionId,
    pub world_id: String,
    pub dimension: String,
    pub chunk_x: i32,
    pub chunk_z: i32,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct SnapshotResponse {
    pub request_id: String,
    pub server_id: String,
    pub minecraft_version: MinecraftVersionId,
    pub world_id: String,
    pub dimension: String,
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub status: SnapshotStatus,
    pub snapshot: Option<ChunkSnapshot>,
    pub unavailable_reason: Option<UnavailableReason>,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotStatus {
    Loaded,
    NotLoaded,
    WorldUnavailable,
    QueueFull,
    Timeout,
    InvalidSnapshot,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnavailableReason {
    NotLoaded,
    WorldUnavailable,
    QueueFull,
    Timeout,
    InvalidSnapshot,
    WorldMismatch,
    DimensionMismatch,
    ChunkCoordinateMismatch,
    VersionMismatch,
    ProtocolMismatch,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct ChunkSnapshot {
    pub data_version: i64,
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub biomes: Vec<String>,
    pub heightmap: Vec<i32>,
    pub sections: Vec<SectionSnapshot>,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct SectionSnapshot {
    pub section_y: i32,
    pub block_palette: Vec<BlockStateSnapshot>,
    pub packed_block_states: Vec<i64>,
    pub biome_palette: Vec<String>,
    pub sky_light: Option<Vec<u8>>,
    pub block_light: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct BlockStateSnapshot {
    pub name: String,
    pub properties: Vec<BlockPropertySnapshot>,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub struct BlockPropertySnapshot {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum BridgeState {
    Disconnected,
    Connected,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum TerrainState {
    Unknown,
    Ready,
    Unavailable,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct BridgeDiagnostics {
    pub bridge_state: BridgeState,
    pub terrain_state: TerrainState,
    pub live_requested_count: u32,
    pub live_received_count: u32,
    pub unavailable_reason: Option<UnavailableReason>,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ValidationError {
    ProtocolMismatch { expected: u16, actual: u16 },
    ServerMismatch,
    PluginVersionMissing,
    MinecraftVersionMismatch,
    RequestIdMismatch,
    WorldMismatch,
    DimensionMismatch,
    ChunkCoordinateMismatch,
    LoadedSnapshotMissing,
    UnexpectedSnapshot,
    UnexpectedUnavailableReason,
    SnapshotCoordinateMismatch,
    EmptyBlockPalette,
    EmptyBiomePalette,
}

impl HelloRequest {
    pub fn validate_response(&self, response: &HelloResponse) -> Result<(), ValidationError> {
        validate_protocol(response.protocol_version)?;
        if response.server_id != self.server_id {
            return Err(ValidationError::ServerMismatch);
        }
        if response.plugin_version.trim().is_empty() {
            return Err(ValidationError::PluginVersionMissing);
        }
        if response.minecraft_version != self.minecraft_version {
            return Err(ValidationError::MinecraftVersionMismatch);
        }
        Ok(())
    }
}

impl SnapshotResponse {
    pub fn validate_against(&self, request: &SnapshotRequest) -> Result<(), ValidationError> {
        validate_snapshot_identity(self, request)?;
        match self.status {
            SnapshotStatus::Loaded => {
                let snapshot = self
                    .snapshot
                    .as_ref()
                    .ok_or(ValidationError::LoadedSnapshotMissing)?;
                if snapshot.chunk_x != request.chunk_x || snapshot.chunk_z != request.chunk_z {
                    return Err(ValidationError::SnapshotCoordinateMismatch);
                }
                if snapshot.sections.iter().any(|section| {
                    section.block_palette.is_empty() || section.biome_palette.is_empty()
                }) {
                    return Err(ValidationError::EmptyBlockPalette);
                }
                if self.unavailable_reason.is_some() {
                    return Err(ValidationError::UnexpectedUnavailableReason);
                }
            }
            SnapshotStatus::NotLoaded
            | SnapshotStatus::WorldUnavailable
            | SnapshotStatus::QueueFull
            | SnapshotStatus::Timeout
            | SnapshotStatus::InvalidSnapshot => {
                if self.snapshot.is_some() {
                    return Err(ValidationError::UnexpectedSnapshot);
                }
                if self.unavailable_reason.is_none() {
                    return Err(ValidationError::UnexpectedUnavailableReason);
                }
            }
        }
        Ok(())
    }
}

fn validate_protocol(protocol_version: u16) -> Result<(), ValidationError> {
    if protocol_version != PROTOCOL_VERSION {
        return Err(ValidationError::ProtocolMismatch {
            expected: PROTOCOL_VERSION,
            actual: protocol_version,
        });
    }
    Ok(())
}

fn validate_snapshot_identity(
    response: &SnapshotResponse,
    request: &SnapshotRequest,
) -> Result<(), ValidationError> {
    if response.request_id != request.request_id {
        return Err(ValidationError::RequestIdMismatch);
    }
    if response.server_id != request.server_id {
        return Err(ValidationError::ServerMismatch);
    }
    if response.minecraft_version != request.minecraft_version {
        return Err(ValidationError::MinecraftVersionMismatch);
    }
    if response.world_id != request.world_id {
        return Err(ValidationError::WorldMismatch);
    }
    if response.dimension != request.dimension {
        return Err(ValidationError::DimensionMismatch);
    }
    if response.chunk_x != request.chunk_x || response.chunk_z != request.chunk_z {
        return Err(ValidationError::ChunkCoordinateMismatch);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version() -> MinecraftVersionId {
        MinecraftVersionId::new("1.21.4").expect("fixture version")
    }

    fn request() -> SnapshotRequest {
        SnapshotRequest {
            request_id: "request-1".to_owned(),
            server_id: "server-1".to_owned(),
            minecraft_version: version(),
            world_id: "world-1".to_owned(),
            dimension: "minecraft:overworld".to_owned(),
            chunk_x: -2,
            chunk_z: 4,
        }
    }

    fn loaded_response() -> SnapshotResponse {
        SnapshotResponse {
            request_id: "request-1".to_owned(),
            server_id: "server-1".to_owned(),
            minecraft_version: version(),
            world_id: "world-1".to_owned(),
            dimension: "minecraft:overworld".to_owned(),
            chunk_x: -2,
            chunk_z: 4,
            status: SnapshotStatus::Loaded,
            snapshot: Some(ChunkSnapshot {
                data_version: 4189,
                chunk_x: -2,
                chunk_z: 4,
                biomes: vec!["minecraft:plains".to_owned(); 256],
                heightmap: vec![64; 256],
                sections: vec![SectionSnapshot {
                    section_y: 0,
                    block_palette: vec![BlockStateSnapshot {
                        name: "minecraft:stone".to_owned(),
                        properties: Vec::new(),
                    }],
                    packed_block_states: vec![0; 512],
                    biome_palette: vec!["minecraft:plains".to_owned()],
                    sky_light: Some(vec![15; 2048]),
                    block_light: Some(vec![0; 2048]),
                }],
            }),
            unavailable_reason: None,
        }
    }

    #[test]
    fn loaded_snapshot_validates_all_request_identity_fields() {
        assert_eq!(loaded_response().validate_against(&request()), Ok(()));
    }

    #[test]
    fn mismatched_snapshot_coordinates_are_rejected() {
        let mut response = loaded_response();
        response.chunk_z += 1;
        assert_eq!(
            response.validate_against(&request()),
            Err(ValidationError::ChunkCoordinateMismatch)
        );
    }

    #[test]
    fn not_loaded_is_not_reported_as_empty_terrain() {
        let mut response = loaded_response();
        response.status = SnapshotStatus::NotLoaded;
        response.snapshot = None;
        response.unavailable_reason = Some(UnavailableReason::NotLoaded);
        assert_eq!(response.validate_against(&request()), Ok(()));
        assert_eq!(
            response.unavailable_reason,
            Some(UnavailableReason::NotLoaded)
        );
    }

    #[test]
    fn protocol_json_round_trip_preserves_wire_shape() {
        let message = BridgeMessage::SnapshotRequest(request());
        let json = serde_json::to_string(&message).expect("message serializes");
        assert!(json.contains("snapshot_request"));
        let restored: BridgeMessage = serde_json::from_str(&json).expect("message parses");
        assert_eq!(restored, message);
    }

    #[test]
    fn incompatible_protocol_is_rejected_before_identity_checks() {
        let hello = HelloRequest {
            protocol_version: PROTOCOL_VERSION,
            server_id: "server-1".to_owned(),
            minecraft_version: version(),
        };
        let response = HelloResponse {
            protocol_version: PROTOCOL_VERSION + 1,
            server_id: "server-1".to_owned(),
            plugin_version: "2.0.63".to_owned(),
            minecraft_version: version(),
            status: HelloStatus::Accepted,
        };
        assert_eq!(
            hello.validate_response(&response),
            Err(ValidationError::ProtocolMismatch {
                expected: PROTOCOL_VERSION,
                actual: PROTOCOL_VERSION + 1,
            })
        );
    }
}
