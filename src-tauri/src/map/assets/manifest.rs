use serde::{Deserialize, Serialize};

pub(crate) const ASSET_MANIFEST_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AssetSourceState {
    Valid,
    VersionMismatch,
    Invalid,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetManifest {
    pub manifest_version: u32,
    pub minecraft_version: Option<String>,
    pub source_path: String,
    pub source_identity: String,
    pub resource_pack_hash: String,
    pub blockstate_count: usize,
    pub model_count: usize,
    pub texture_count: usize,
    pub animated_texture_count: usize,
    pub unresolved_blockstate_count: usize,
    pub quality: AssetQuality,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AssetQuality {
    Full,
    Partial,
    Fallback,
}

impl AssetManifest {
    pub(crate) fn quality_for(unresolved: usize, total_blockstates: usize) -> AssetQuality {
        if total_blockstates == 0 {
            AssetQuality::Fallback
        } else if unresolved == 0 {
            AssetQuality::Full
        } else {
            AssetQuality::Partial
        }
    }
}
