//! Source-independent contracts shared by Anvil, Paper, and fixture adapters.

use std::fmt;

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct MinecraftVersionId(String);

impl MinecraftVersionId {
    pub fn new(value: impl Into<String>) -> Result<Self, DomainContractError> {
        let value = value.into();
        if value.is_empty() || value.len() > 32 || value.chars().any(char::is_whitespace) {
            return Err(DomainContractError::InvalidIdentifier);
        }
        Ok(Self(value))
    }

    pub fn unknown() -> Self {
        Self("unknown".to_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for MinecraftVersionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct WorldId(String);

impl WorldId {
    pub fn new(value: impl Into<String>) -> Result<Self, DomainContractError> {
        let value = value.into();
        if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
            return Err(DomainContractError::InvalidIdentifier);
        }
        Ok(Self(value))
    }

    pub fn unknown() -> Self {
        Self("unknown".to_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct DimensionId(String);

impl DimensionId {
    pub fn new(value: impl Into<String>) -> Result<Self, DomainContractError> {
        let value = value.into();
        if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
            return Err(DomainContractError::InvalidIdentifier);
        }
        Ok(Self(value))
    }

    pub fn overworld() -> Self {
        Self("minecraft:overworld".to_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub struct WorldCoordinate {
    pub x: i64,
    pub y: i32,
    pub z: i64,
}

impl WorldCoordinate {
    pub const fn new(x: i64, y: i32, z: i64) -> Self {
        Self { x, y, z }
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct ChunkCoordinate {
    pub x: i64,
    pub z: i64,
}

impl ChunkCoordinate {
    pub const fn new(x: i64, z: i64) -> Self {
        Self { x, z }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct ChunkIdentity {
    pub minecraft_version: MinecraftVersionId,
    pub world: WorldId,
    pub dimension: DimensionId,
    pub coordinate: ChunkCoordinate,
}

impl ChunkIdentity {
    pub fn unknown(coordinate: ChunkCoordinate) -> Self {
        Self {
            minecraft_version: MinecraftVersionId::unknown(),
            world: WorldId::unknown(),
            dimension: DimensionId::overworld(),
            coordinate,
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum MissingDataKind {
    BlockStates,
    Biomes,
    Height,
    SkyLight,
    BlockLight,
    TileBoundary,
    Asset,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ChunkDataAvailability {
    Complete,
    Partial { missing: Vec<MissingDataKind> },
    Missing { reason: String },
}

impl ChunkDataAvailability {
    pub fn is_renderable(&self) -> bool {
        matches!(self, Self::Complete | Self::Partial { .. })
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct BlockStateProperty {
    pub name: String,
    pub value: String,
}

impl BlockStateProperty {
    pub fn new(name: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: value.into(),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct ModelReference(String);

impl ModelReference {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct TextureReference(String);

impl TextureReference {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum MaterialOpacity {
    Opaque,
    Cutout,
    Translucent,
    Emissive,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct Material {
    pub texture: TextureReference,
    pub opacity: MaterialOpacity,
    pub tintable: bool,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum DomainContractError {
    InvalidIdentifier,
    IdentityMismatch,
}

#[cfg(test)]
mod tests {
    use super::{ChunkCoordinate, ChunkDataAvailability, ChunkIdentity, MinecraftVersionId};

    #[test]
    fn identity_keeps_version_world_dimension_and_chunk_together() {
        let identity = ChunkIdentity {
            minecraft_version: MinecraftVersionId::new("1.21.10").unwrap(),
            world: super::WorldId::new("test-world").unwrap(),
            dimension: super::DimensionId::overworld(),
            coordinate: ChunkCoordinate::new(-1, 2),
        };
        assert_eq!(identity.coordinate, ChunkCoordinate::new(-1, 2));
    }

    #[test]
    fn missing_data_is_not_renderable_but_partial_data_is_explicit() {
        assert!(!ChunkDataAvailability::Missing {
            reason: "not_loaded".to_owned(),
        }
        .is_renderable());
        assert!(ChunkDataAvailability::Partial {
            missing: Vec::new()
        }
        .is_renderable());
    }
}
