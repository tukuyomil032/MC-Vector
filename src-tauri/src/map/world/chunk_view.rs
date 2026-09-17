use std::fmt;

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
pub struct ChunkKey {
    pub dimension: String,
    pub chunk_x: i64,
    pub chunk_z: i64,
}

impl ChunkKey {
    pub fn new(dimension: impl Into<String>, chunk_x: i64, chunk_z: i64) -> Self {
        Self {
            dimension: dimension.into(),
            chunk_x,
            chunk_z,
        }
    }
}

#[derive(Clone, Copy, Debug, Hash, PartialEq, Eq)]
pub enum ChunkSourceKind {
    LiveSnapshot,
    CachedLive,
    SavedAnvil,
}

impl ChunkSourceKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::LiveSnapshot => "live_snapshot",
            Self::CachedLive => "cached_live",
            Self::SavedAnvil => "saved_anvil",
        }
    }
}

impl fmt::Display for ChunkSourceKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChunkLayer {
    pub y: i32,
    pub state: String,
    pub biome: String,
    pub sky_light: u8,
    pub block_light: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChunkView {
    pub key: ChunkKey,
    pub min_y: i32,
    pub max_y: i32,
    pub columns: Vec<Vec<ChunkLayer>>,
    pub revision: u64,
    pub captured_at: Option<u64>,
    pub source: ChunkSourceKind,
}

impl ChunkView {
    pub fn new(
        key: ChunkKey,
        min_y: i32,
        max_y: i32,
        columns: Vec<Vec<ChunkLayer>>,
        revision: u64,
        captured_at: Option<u64>,
        source: ChunkSourceKind,
    ) -> Result<Self, String> {
        if min_y >= max_y {
            return Err("Chunk view height range is invalid".to_string());
        }
        if columns.len() != 16 * 16 {
            return Err("Chunk view must contain exactly 256 columns".to_string());
        }
        for column in &columns {
            if column.len() > 16 {
                return Err("Chunk view contains more than 16 surface layers".to_string());
            }
            if column
                .iter()
                .any(|layer| layer.y < min_y || layer.y >= max_y)
            {
                return Err("Chunk view contains a layer outside its height range".to_string());
            }
        }
        Ok(Self {
            key,
            min_y,
            max_y,
            columns,
            revision,
            captured_at,
            source,
        })
    }

    pub fn column(&self, local_x: usize, local_z: usize) -> Option<&[ChunkLayer]> {
        if local_x >= 16 || local_z >= 16 {
            return None;
        }
        self.columns.get(local_z * 16 + local_x).map(Vec::as_slice)
    }

    pub fn surface_layer(&self, local_x: usize, local_z: usize) -> Option<&ChunkLayer> {
        self.column(local_x, local_z)
            .and_then(|layers| surface_layer_from_layers(layers, self.min_y, self.max_y))
    }
}

fn surface_layer_from_layers(layers: &[ChunkLayer], min_y: i32, max_y: i32) -> Option<&ChunkLayer> {
    layers
        .iter()
        .filter(|layer| layer.y >= min_y && layer.y < max_y && !is_air_state(&layer.state))
        .max_by_key(|layer| layer.y)
}

fn is_air_state(state: &str) -> bool {
    let block = state.split('|').next().unwrap_or(state);
    matches!(
        block,
        "minecraft:air" | "minecraft:cave_air" | "minecraft:void_air"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layer(y: i32, state: &str) -> ChunkLayer {
        ChunkLayer {
            y,
            state: state.to_string(),
            biome: "minecraft:plains".to_string(),
            sky_light: 15,
            block_light: 0,
        }
    }

    fn columns(first: ChunkLayer) -> Vec<Vec<ChunkLayer>> {
        (0..256).map(|_| vec![first.clone()]).collect()
    }

    #[test]
    fn validates_and_indexes_columns_in_z_then_x_order() {
        let view = ChunkView::new(
            ChunkKey::new("minecraft:overworld", -1, 2),
            -64,
            320,
            columns(layer(64, "minecraft:grass_block")),
            7,
            Some(42),
            ChunkSourceKind::LiveSnapshot,
        )
        .expect("fixture should be valid");
        assert_eq!(view.key.chunk_x, -1);
        assert_eq!(
            view.column(15, 15).expect("column"),
            &[layer(64, "minecraft:grass_block")]
        );
        assert_eq!(view.surface_layer(0, 0).expect("surface").y, 64);
        assert_eq!(view.source.to_string(), "live_snapshot");
    }

    #[test]
    fn air_layers_are_not_surface_terrain() {
        let view = ChunkView::new(
            ChunkKey::new("minecraft:overworld", 0, 0),
            0,
            128,
            columns(layer(70, "minecraft:air")),
            0,
            None,
            ChunkSourceKind::SavedAnvil,
        )
        .expect("fixture should be valid");
        assert!(view.surface_layer(0, 0).is_none());
        assert!(is_air_state("minecraft:void_air|"));
        assert!(!is_air_state("minecraft:stone|"));
    }

    #[test]
    fn rejects_wrong_column_count_and_height_range() {
        assert!(ChunkView::new(
            ChunkKey::new("minecraft:overworld", 0, 0),
            10,
            10,
            Vec::new(),
            0,
            None,
            ChunkSourceKind::SavedAnvil,
        )
        .is_err());
        assert!(ChunkView::new(
            ChunkKey::new("minecraft:overworld", 0, 0),
            0,
            128,
            Vec::new(),
            0,
            None,
            ChunkSourceKind::SavedAnvil,
        )
        .is_err());
    }
}
