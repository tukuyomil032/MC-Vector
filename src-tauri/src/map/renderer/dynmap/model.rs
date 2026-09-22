//! Dynmap model/patch traversal boundary.
//!
//! Model lookup is intentionally separate from perspective traversal.  A
//! missing asset or unknown block state is an error at this boundary; it is
//! never replaced with a guessed colour.

use super::patch::{PatchDefinition, PatchHit, Ray};
use crate::map::assets::model_view::{ModelResolution, ModelView};
use crate::map::world::chunk_view::BlockStateId;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModelHit {
    pub patch_index: usize,
    pub patch: PatchDefinition,
    pub hit: PatchHit,
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum ModelError {
    MissingAsset,
    UnknownModel,
    EmptyModel,
}

pub fn nearest_patch(
    models: &ModelView,
    block_state: BlockStateId,
    ray: Ray,
) -> Result<Option<ModelHit>, ModelError> {
    let model = match models.resolve(block_state) {
        ModelResolution::Resolved(model) => model,
        ModelResolution::MissingAsset { .. } => return Err(ModelError::MissingAsset),
        ModelResolution::UnknownModel { .. } => return Err(ModelError::UnknownModel),
    };
    if model.patches.is_empty() {
        return Err(ModelError::EmptyModel);
    }

    Ok(model
        .patches
        .iter()
        .enumerate()
        .filter_map(|(patch_index, patch)| {
            patch.intersect(ray).map(|hit| ModelHit {
                patch_index,
                patch: *patch,
                hit,
            })
        })
        .min_by(|left, right| left.hit.distance.total_cmp(&right.hit.distance)))
}

#[cfg(test)]
mod tests {
    use super::{nearest_patch, ModelError};
    use crate::map::assets::model_view::{AssetResolutionState, ModelDefinition, ModelView};
    use crate::map::renderer::dynmap::patch::{PatchDefinition, Ray};
    use crate::map::renderer::dynmap::types::{SideVisible, Vec3};
    use crate::map::world::chunk_view::BlockStateId;

    fn model_view() -> ModelView {
        let patch = PatchDefinition::new(
            Vec3::ZERO,
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 1.0, 0.0),
            0.0,
            1.0,
            0.0,
            1.0,
            0.0,
            1.0,
            SideVisible::Front,
            0,
            true,
        )
        .unwrap();
        ModelView::new(AssetResolutionState::Available).with_model(
            BlockStateId(1),
            ModelDefinition {
                model_id: crate::map::assets::model_view::AssetKey::new("minecraft:test"),
                patches: vec![patch],
            },
        )
    }

    #[test]
    fn nearest_patch_keeps_uv_and_patch_identity() {
        let hit = nearest_patch(
            &model_view(),
            BlockStateId(1),
            Ray::new(Vec3::new(0.5, 0.5, 1.0), Vec3::new(0.0, 0.0, -1.0)),
        )
        .unwrap()
        .unwrap();
        assert_eq!(hit.patch_index, 0);
        assert!((hit.hit.u - 0.5).abs() < 1e-9);
        assert!((hit.hit.v - 0.5).abs() < 1e-9);
    }

    #[test]
    fn unknown_model_is_not_converted_to_a_fallback_surface() {
        let view = ModelView::new(AssetResolutionState::Available);
        assert_eq!(
            nearest_patch(
                &view,
                BlockStateId(99),
                Ray::new(Vec3::new(0.5, 0.5, 1.0), Vec3::new(0.0, 0.0, -1.0))
            ),
            Err(ModelError::UnknownModel)
        );
    }
}
