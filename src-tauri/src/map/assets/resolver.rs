use std::collections::HashMap;

use super::manifest::AssetManifest;
use super::resource_pack::overlay_entries;

#[derive(Clone, Debug, Default)]
pub(crate) struct ResourcePackStack {
    entries: HashMap<String, Vec<u8>>,
}

impl ResourcePackStack {
    pub(crate) fn from_layers(layers: impl IntoIterator<Item = HashMap<String, Vec<u8>>>) -> Self {
        let mut stack = Self::default();
        for entries in layers {
            stack.overlay(entries);
        }
        stack
    }

    pub(crate) fn overlay(&mut self, entries: HashMap<String, Vec<u8>>) {
        overlay_entries(&mut self.entries, entries);
    }

    pub(crate) fn entries(&self) -> &HashMap<String, Vec<u8>> {
        &self.entries
    }
}

pub(crate) fn source_version(path: &str) -> Option<String> {
    let file_name = path.rsplit(['/', '\\']).next()?.strip_suffix(".jar")?;
    let version = file_name.strip_prefix("minecraft-").unwrap_or(file_name);
    if version.starts_with("1.") {
        Some(version.to_string())
    } else {
        None
    }
}

pub(crate) fn manifest_quality(manifest: &AssetManifest) -> &'static str {
    match manifest.quality {
        super::manifest::AssetQuality::Full => "full",
        super::manifest::AssetQuality::Partial => "partial",
        super::manifest::AssetQuality::Fallback => "fallback",
    }
}
