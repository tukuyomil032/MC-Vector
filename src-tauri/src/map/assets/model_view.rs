//! SPDX-License-Identifier: Apache-2.0
//! SPDX-FileCopyrightText: Dynmap contributors
//! Origin: DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java
//! Source-Ref: 93b454efb8802dc7406d6873434f2aeec5c636f4
//! Ported-to: MC-Vector Rust
//! Changes: Exposes immutable model lookup and keeps missing/unknown assets explicit.

use std::collections::BTreeMap;

use crate::map::renderer::dynmap::patch::PatchDefinition;
use crate::map::world::chunk_view::BlockStateId;

#[derive(Debug, Clone, Eq, PartialEq, Ord, PartialOrd)]
pub struct AssetKey(String);

impl AssetKey {
    pub fn new(key: impl Into<String>) -> Self {
        Self(key.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AssetResolutionState {
    Available,
    Missing { asset: AssetKey },
    Unknown { asset: AssetKey },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModelDefinition {
    pub model_id: AssetKey,
    pub patches: Vec<PatchDefinition>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ModelResolution<'a> {
    Resolved(&'a ModelDefinition),
    MissingAsset { asset: &'a AssetKey },
    UnknownModel { block_state: BlockStateId },
}

#[derive(Debug, Clone, Default)]
pub struct ModelView {
    asset_state: AssetResolutionState,
    models: BTreeMap<BlockStateId, ModelDefinition>,
}

impl Default for AssetResolutionState {
    fn default() -> Self {
        Self::Available
    }
}

impl ModelView {
    pub fn new(asset_state: AssetResolutionState) -> Self {
        Self {
            asset_state,
            models: BTreeMap::new(),
        }
    }

    pub fn with_model(mut self, block_state: BlockStateId, model: ModelDefinition) -> Self {
        self.models.insert(block_state, model);
        self
    }

    pub fn asset_state(&self) -> &AssetResolutionState {
        &self.asset_state
    }

    pub fn resolve(&self, block_state: BlockStateId) -> ModelResolution<'_> {
        match &self.asset_state {
            AssetResolutionState::Missing { asset } => ModelResolution::MissingAsset { asset },
            AssetResolutionState::Unknown { .. } => ModelResolution::UnknownModel { block_state },
            AssetResolutionState::Available => self
                .models
                .get(&block_state)
                .map(ModelResolution::Resolved)
                .unwrap_or(ModelResolution::UnknownModel { block_state }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AssetKey, AssetResolutionState, ModelDefinition, ModelResolution, ModelView};
    use crate::map::world::chunk_view::BlockStateId;

    #[test]
    fn missing_model_asset_is_not_silently_rendered() {
        let view = ModelView::new(AssetResolutionState::Missing {
            asset: AssetKey::new("block-models"),
        });
        assert!(matches!(
            view.resolve(BlockStateId(42)),
            ModelResolution::MissingAsset { .. }
        ));
    }

    #[test]
    fn unknown_model_state_is_distinct_from_missing_assets() {
        let view = ModelView::new(AssetResolutionState::Available);
        assert!(matches!(
            view.resolve(BlockStateId(42)),
            ModelResolution::UnknownModel { .. }
        ));
    }

    #[test]
    fn known_model_is_returned_immutably() {
        let model = ModelDefinition {
            model_id: AssetKey::new("minecraft:stone"),
            patches: Vec::new(),
        };
        let view =
            ModelView::new(AssetResolutionState::Available).with_model(BlockStateId(1), model);
        assert!(matches!(
            view.resolve(BlockStateId(1)),
            ModelResolution::Resolved(_)
        ));
    }
}
