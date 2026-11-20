//! Version ordering and release-notes links for server upgrades.

use std::cmp::Ordering;

use crate::java::requirement::release_components;

/// Orders release versions by their numeric components (`1.21.10` > `1.21.9`,
/// `26.1` > `1.21.11`). Missing components count as zero.
pub fn compare_releases(a: &[u32], b: &[u32]) -> Ordering {
    let length = a.len().max(b.len());
    (0..length)
        .map(|index| {
            let left = a.get(index).copied().unwrap_or(0);
            let right = b.get(index).copied().unwrap_or(0);
            left.cmp(&right)
        })
        .find(|ordering| *ordering != Ordering::Equal)
        .unwrap_or(Ordering::Equal)
}

/// Release versions in `versions` newer than `current`, newest first.
/// Snapshots and pre-releases (anything not purely numeric) are skipped. When
/// `current` is not a release version every release is returned.
pub fn newer_releases(current: &str, versions: &[String]) -> Vec<String> {
    let current = release_components(current).filter(|_| is_release(current));
    let mut releases: Vec<(Vec<u32>, String)> = versions
        .iter()
        .filter(|version| is_release(version))
        .filter_map(|version| Some((release_components(version)?, version.trim().to_owned())))
        .filter(|(components, _)| {
            current
                .as_ref()
                .is_none_or(|current| compare_releases(components, current) == Ordering::Greater)
        })
        .collect();
    releases.sort_by(|a, b| compare_releases(&b.0, &a.0));
    releases.dedup_by(|a, b| compare_releases(&a.0, &b.0) == Ordering::Equal);
    releases.into_iter().map(|(_, version)| version).collect()
}

/// True for `1.21.4`-style versions (digits and dots only).
pub fn is_release(version: &str) -> bool {
    let version = version.trim();
    !version.is_empty()
        && !version.starts_with('.')
        && !version.ends_with('.')
        && version
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'.')
}

/// A best-effort page describing `software` at `version`, or None when no
/// stable page is known.
pub fn release_notes_url(software: &str, version: &str) -> Option<String> {
    let version = version.trim();
    if version.is_empty()
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return None;
    }
    let url = match software {
        "Paper" | "Folia" | "Velocity" => format!(
            "https://papermc.io/downloads/all?project={}&version={version}",
            software.to_ascii_lowercase()
        ),
        "Purpur" => format!("https://purpurmc.org/download/purpur/{version}"),
        "LeafMC" => "https://www.leafmc.one/download".to_owned(),
        "Fabric" => "https://fabricmc.net/use/server/".to_owned(),
        "Forge" => format!(
            "https://files.minecraftforge.net/net/minecraftforge/forge/index_{version}.html"
        ),
        "NeoForge" => "https://projects.neoforged.net/neoforged/neoforge".to_owned(),
        "Vanilla" if is_release(version) => format!(
            "https://www.minecraft.net/en-us/article/minecraft-java-edition-{}",
            version.replace('.', "-")
        ),
        _ => return None,
    };
    Some(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn newer_releases_are_numeric_newest_first_and_skip_snapshots() {
        let versions = strings(&[
            "1.20.6",
            "1.21",
            "1.21.10",
            "1.21.9",
            "1.21.4-pre1",
            "24w14a",
            "26.1",
            "1.20.4",
            "1.21.10",
        ]);
        assert_eq!(
            newer_releases("1.21", &versions),
            strings(&["26.1", "1.21.10", "1.21.9"])
        );
        assert_eq!(newer_releases("26.1", &versions), Vec::<String>::new());
        assert_eq!(newer_releases("24w14a", &versions).len(), 6);
    }

    #[test]
    fn release_notes_follow_each_provider_pattern() {
        assert_eq!(
            release_notes_url("Vanilla", "1.21.4").as_deref(),
            Some("https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-4")
        );
        assert_eq!(
            release_notes_url("Paper", "1.21.4").as_deref(),
            Some("https://papermc.io/downloads/all?project=paper&version=1.21.4")
        );
        assert_eq!(
            release_notes_url("Purpur", "1.21.4").as_deref(),
            Some("https://purpurmc.org/download/purpur/1.21.4")
        );
        assert!(release_notes_url("Fabric", "1.21.4").is_some());
        assert_eq!(release_notes_url("Vanilla", "24w14a"), None);
        assert_eq!(release_notes_url("Paper", "1.21/../x"), None);
        assert_eq!(release_notes_url("Spigot", "1.21.4"), None);
    }
}
