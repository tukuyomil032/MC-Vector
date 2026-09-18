use serde::Serialize;

pub(crate) const DEFAULT_PERSPECTIVE: &str = "iso_hd";

#[derive(Clone, Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TileKey {
    pub(crate) server_id: String,
    pub(crate) world_id: String,
    pub(crate) minecraft_version: String,
    pub(crate) resource_pack_hash: String,
    pub(crate) asset_manifest_version: String,
    pub(crate) renderer_version: String,
    pub(crate) perspective: String,
    pub(crate) zoom: u8,
    pub(crate) tile_x: i32,
    pub(crate) tile_y: i32,
}

impl TileKey {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn new(
        server_id: impl Into<String>,
        world_id: impl Into<String>,
        minecraft_version: impl Into<String>,
        resource_pack_hash: impl Into<String>,
        asset_manifest_version: impl Into<String>,
        renderer_version: impl Into<String>,
        perspective: impl Into<String>,
        zoom: u8,
        tile_x: i32,
        tile_y: i32,
    ) -> Self {
        Self {
            server_id: server_id.into(),
            world_id: world_id.into(),
            minecraft_version: minecraft_version.into(),
            resource_pack_hash: resource_pack_hash.into(),
            asset_manifest_version: asset_manifest_version.into(),
            renderer_version: renderer_version.into(),
            perspective: perspective.into(),
            zoom,
            tile_x,
            tile_y,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_separates_renderer_and_asset_versions() {
        let base = TileKey::new(
            "server",
            "overworld",
            "1.21.10",
            "sha256:pack",
            "manifest-v1",
            "renderer-v1",
            DEFAULT_PERSPECTIVE,
            8,
            -1,
            2,
        );
        let mut changed = base.clone();
        changed.renderer_version = "renderer-v2".to_string();
        assert_ne!(base, changed);
        changed.renderer_version = base.renderer_version.clone();
        changed.resource_pack_hash = "sha256:other".to_string();
        assert_ne!(base, changed);
    }
}
