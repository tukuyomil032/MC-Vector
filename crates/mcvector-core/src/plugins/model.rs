//! Shared browser policy and normalized provider records.
use super::catalog::{hangar, modrinth, spiget, string};
use futures_util::{stream, StreamExt};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{cmp::Reverse, collections::HashSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PluginSource {
    Modrinth,
    Hangar,
    Spiget,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Compatibility {
    Compatible,
    Incompatible,
    Unknown,
}

impl Compatibility {
    pub fn from_provider(value: &str) -> Self {
        match value {
            "compatible" => Self::Compatible,
            "incompatible" => Self::Incompatible,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortMode {
    Relevance,
    Downloads,
    Name,
    Compatibility,
}

#[derive(Clone, Debug)]
pub struct ServerPluginSupport {
    pub sources: Vec<PluginSource>,
    pub target_directory: String,
    pub loader: String,
}

/// Provider availability mirrors the React browser. The installer separately
/// checks whether the server can actually load the downloaded artifact.
pub fn server_support(software: &str) -> ServerPluginSupport {
    let software = software.trim().to_ascii_lowercase();
    let is_mod = matches!(software.as_str(), "fabric" | "forge" | "neoforge");
    let mut sources = vec![PluginSource::Modrinth];
    if matches!(
        software.as_str(),
        "paper" | "leafmc" | "waterfall" | "velocity"
    ) {
        sources.push(PluginSource::Hangar);
    }
    if !is_mod {
        sources.push(PluginSource::Spiget);
    }
    let loader = match software.as_str() {
        "fabric" => "fabric",
        "forge" => "forge",
        "neoforge" => "neoforge",
        "paper" | "purpur" | "leaf" | "leafmc" | "folia" => "paper",
        "spigot" | "bukkit" | "craftbukkit" => "spigot",
        "velocity" => "velocity",
        "waterfall" | "bungeecord" => "bungeecord",
        _ => "",
    };
    ServerPluginSupport {
        sources,
        target_directory: if is_mod { "mods" } else { "plugins" }.into(),
        loader: loader.into(),
    }
}

#[derive(Clone, Debug)]
pub struct SearchRequest {
    pub source: PluginSource,
    pub query: String,
    pub software: String,
    pub game_version: String,
    pub offset: u32,
    pub limit: u32,
    pub sort: SortMode,
    pub category: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub author: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub compatibility: Compatibility,
    pub project_url: String,
    pub source: PluginSource,
    /// Minecraft versions the provider lists for the project (may be empty).
    pub supported_versions: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Category {
    pub id: String,
    pub name: String,
}

fn count(value: &Value) -> u64 {
    value
        .as_u64()
        .unwrap_or_else(|| value.as_f64().unwrap_or_default().max(0.0) as u64)
}

pub(super) fn project_url(base: &str, segments: &[&str]) -> Option<Url> {
    let mut url = Url::parse(base).ok()?;
    let mut path = url.path_segments_mut().ok()?;
    path.pop_if_empty();
    for segment in segments {
        if segment.is_empty() || matches!(*segment, "." | "..") {
            return None;
        }
        path.push(segment);
    }
    drop(path);
    Some(url)
}

fn normalize_project(source: PluginSource, value: &Value) -> Option<ProjectRecord> {
    let (id, slug, name, author, summary, icon, downloads, url) = match source {
        PluginSource::Modrinth => {
            let slug = string(&value["slug"]);
            let id = value["project_id"]
                .as_str()
                .filter(|id| !id.is_empty())
                .unwrap_or(slug);
            (
                id.to_owned(),
                slug.to_owned(),
                string(&value["title"]),
                string(&value["author"]),
                string(&value["description"]),
                string(&value["icon_url"]),
                count(&value["downloads"]),
                project_url("https://modrinth.com/project/", &[slug])?,
            )
        }
        PluginSource::Hangar => {
            let author = string(&value["namespace"]["owner"]);
            let slug = string(&value["namespace"]["slug"]);
            (
                format!("{author}/{slug}"),
                slug.to_owned(),
                string(&value["name"]),
                author,
                string(&value["description"]),
                string(&value["avatarUrl"]),
                count(&value["stats"]["downloads"]),
                project_url("https://hangar.papermc.io/", &[author, slug])?,
            )
        }
        PluginSource::Spiget => {
            let id = value["id"].as_u64()?.to_string();
            let name = string(&value["name"]);
            let url = Url::parse(&format!("https://www.spigotmc.org/resources/{id}/")).ok()?;
            (
                id,
                slug(name),
                name,
                string(&value["authorName"]),
                string(&value["tag"]),
                string(&value["iconUrl"]),
                count(&value["downloads"]),
                url,
            )
        }
    };
    if name.is_empty() {
        return None;
    }
    Some(ProjectRecord {
        id,
        slug,
        name: name.into(),
        author: author.into(),
        summary: summary.into(),
        icon_url: (!icon.is_empty()).then(|| icon.into()),
        downloads,
        compatibility: Compatibility::from_provider(string(&value["compatibility"])),
        project_url: url.into(),
        source,
        supported_versions: super::catalog::strings(&value["supportedVersions"]),
    })
}

fn slug(name: &str) -> String {
    let mut slug = String::new();
    for character in name.to_lowercase().chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_') {
            slug.push(character);
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        "plugin".into()
    } else {
        slug.into()
    }
}

/// One page of search results and, when the provider reports it, how many
/// results the query has in all (Spiget does not).
#[derive(Clone, Debug)]
pub struct SearchPage {
    pub items: Vec<ProjectRecord>,
    pub total: Option<u64>,
}

/// One published version of a project, newest first as the provider lists it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VersionRecord {
    pub id: String,
    pub name: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    /// ISO 8601 publish time, when the provider gives one.
    pub published: Option<String>,
}

/// Versions of a project for the detail view. Modrinth filters by the
/// server's loader; Hangar lists every platform; Spiget has no version files
/// to choose from, so it lists none.
pub async fn versions(
    project: &super::installer::ProjectRef,
    software: &str,
) -> Result<Vec<VersionRecord>, String> {
    use super::catalog::strings;
    use super::installer::ProjectRef;
    match project {
        ProjectRef::Modrinth { project_id } => {
            let loader = server_support(software).loader;
            let payload = modrinth::versions(project_id, Some(&loader), None).await?;
            Ok(parse_modrinth_versions(&payload))
        }
        ProjectRef::Hangar { owner, slug } => Ok(hangar::versions(owner, slug, None)
            .await?
            .iter()
            .map(|version| {
                let dependencies = version["platformDependencies"].as_object();
                let mut game_versions: Vec<String> = dependencies
                    .into_iter()
                    .flat_map(|map| map.values())
                    .flat_map(strings)
                    .collect();
                game_versions.dedup();
                let name = string(&version["name"]).to_owned();
                VersionRecord {
                    id: name.clone(),
                    name,
                    game_versions,
                    loaders: dependencies
                        .into_iter()
                        .flat_map(|map| map.keys())
                        .map(|key| key.to_ascii_lowercase())
                        .collect(),
                    published: None,
                }
            })
            .collect()),
        ProjectRef::Spiget { .. } => Ok(Vec::new()),
    }
}

fn parse_modrinth_versions(payload: &Value) -> Vec<VersionRecord> {
    use super::catalog::strings;
    payload
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|version| {
            let id = string(&version["id"]);
            if id.is_empty() {
                return None;
            }
            let number = string(&version["version_number"]);
            let name = string(&version["name"]);
            Some(VersionRecord {
                id: id.to_owned(),
                name: if number.is_empty() { name } else { number }.to_owned(),
                game_versions: strings(&version["game_versions"]),
                loaders: strings(&version["loaders"]),
                published: Some(string(&version["date_published"]))
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
            })
        })
        .collect()
}

pub async fn search(request: SearchRequest) -> Result<SearchPage, String> {
    let support = server_support(&request.software);
    if !support.sources.contains(&request.source) {
        return Err("Source is unavailable for server software".into());
    }

    let (payload, total) = match request.source {
        PluginSource::Modrinth => {
            let project_type = if support.target_directory == "mods" {
                "mod"
            } else {
                "plugin"
            };
            let mut page =
                modrinth::search_browser(&request, project_type, &support.loader).await?;
            (page["hits"].take(), page["total_hits"].as_u64())
        }
        PluginSource::Hangar => {
            let mut page = hangar::search_browser(&request).await?;
            (page["result"].take(), page["pagination"]["count"].as_u64())
        }
        PluginSource::Spiget => (Value::Array(spiget::search_browser(&request).await?), None),
    };
    let mut records: Vec<_> = payload
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| normalize_project(request.source, item))
        .collect();

    if request.source == PluginSource::Hangar && !request.game_version.trim().is_empty() {
        let request = &request;
        stream::iter(&mut records)
            .for_each_concurrent(4, |record| async move {
                if let Ok(compatibility) = hangar::compatibility(
                    &record.author,
                    &record.slug,
                    &request.software,
                    &request.game_version,
                )
                .await
                {
                    record.compatibility =
                        Compatibility::from_provider(string(&compatibility["compatibility"]));
                }
            })
            .await;
    }
    sort_projects(&mut records, request.sort);
    Ok(SearchPage {
        items: records,
        total,
    })
}

fn sort_projects(records: &mut [ProjectRecord], sort: SortMode) {
    match sort {
        SortMode::Relevance => (),
        SortMode::Downloads => records.sort_by_key(|record| Reverse(record.downloads)),
        SortMode::Name => records.sort_by_cached_key(|record| record.name.to_lowercase()),
        SortMode::Compatibility => records.sort_by_key(|record| {
            let order = match record.compatibility {
                Compatibility::Compatible => 0,
                Compatibility::Unknown => 1,
                Compatibility::Incompatible => 2,
            };
            (order, Reverse(record.downloads))
        }),
    }
}

pub async fn categories(source: PluginSource) -> Result<Vec<Category>, String> {
    match source {
        PluginSource::Modrinth => parse_categories(source, &modrinth::categories().await?),
        PluginSource::Hangar => Ok(hangar::categories()
            .iter()
            .map(|(id, name)| Category {
                id: (*id).into(),
                name: (*name).into(),
            })
            .collect()),
        PluginSource::Spiget => parse_categories(source, &spiget::categories().await?),
    }
}

fn parse_categories(source: PluginSource, payload: &Value) -> Result<Vec<Category>, String> {
    let mut seen = HashSet::new();
    let categories = payload.as_array().ok_or("Invalid plugin category list")?;
    Ok(categories
        .iter()
        .filter_map(|item| {
            let name = item["name"].as_str().filter(|name| !name.is_empty())?;
            let id = match source {
                PluginSource::Modrinth => name.to_owned(),
                PluginSource::Spiget => item["id"].as_u64()?.to_string(),
                PluginSource::Hangar => return None,
            };
            seen.insert(id.clone()).then(|| Category {
                id,
                name: name.into(),
            })
        })
        .collect())
}

#[cfg(test)]
mod browser_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn modrinth_versions_prefer_the_version_number_and_skip_entries_without_id() {
        let payload = json!([
            {"id": "a1", "name": "Release 2", "version_number": "2.0.0",
             "game_versions": ["1.21.10", " ", "1.21.9"], "loaders": ["paper", "purpur"],
             "date_published": "2026-10-01T12:00:00Z"},
            {"id": "", "name": "broken"},
            {"id": "b2", "name": "Beta", "game_versions": [], "loaders": []}
        ]);
        assert_eq!(
            parse_modrinth_versions(&payload),
            vec![
                VersionRecord {
                    id: "a1".into(),
                    name: "2.0.0".into(),
                    game_versions: vec!["1.21.10".into(), "1.21.9".into()],
                    loaders: vec!["paper".into(), "purpur".into()],
                    published: Some("2026-10-01T12:00:00Z".into()),
                },
                VersionRecord {
                    id: "b2".into(),
                    name: "Beta".into(),
                    game_versions: vec![],
                    loaders: vec![],
                    published: None,
                },
            ]
        );
        assert!(parse_modrinth_versions(&json!({"error": "x"})).is_empty());
    }

    #[test]
    fn project_records_keep_the_supported_versions() {
        let record = normalize_project(
            PluginSource::Modrinth,
            &json!({"slug": "veinminer", "title": "VeinMiner", "project_id": "p1",
                    "supportedVersions": ["1.21.10", ""]}),
        )
        .unwrap();
        assert_eq!(record.supported_versions, vec!["1.21.10".to_string()]);
    }

    #[test]
    fn availability_matches_browser() {
        use PluginSource::{Hangar, Modrinth, Spiget};
        for software in ["Paper", "LeafMC", "Velocity", "Waterfall"] {
            assert_eq!(
                server_support(software).sources,
                vec![Modrinth, Hangar, Spiget]
            );
        }
        for software in ["Fabric", "Forge", "NeoForge"] {
            let support = server_support(software);
            assert_eq!(support.target_directory, "mods");
            assert_eq!(support.sources, vec![Modrinth]);
            assert_eq!(support.loader, software.to_ascii_lowercase());
        }
        for software in ["Spigot", "Vanilla", "BungeeCord"] {
            let support = server_support(software);
            assert_eq!(support.target_directory, "plugins");
            assert_eq!(support.sources, vec![Modrinth, Spiget]);
        }
        assert_eq!(server_support("LeafMC").loader, "paper");
        assert_eq!(server_support("Waterfall").loader, "bungeecord");
    }

    #[test]
    fn normalizes_all_provider_records() {
        let modrinth = normalize_project(
            PluginSource::Modrinth,
            &json!({
                "slug": "vault", "title": "Vault", "description": "Economy", "downloads": 7,
                "compatibility": "compatible"
            }),
        )
        .unwrap();
        assert_eq!(modrinth.id, "vault");
        assert_eq!(modrinth.author, "");
        assert_eq!(modrinth.icon_url, None);
        assert_eq!(modrinth.compatibility, Compatibility::Compatible);
        assert_eq!(modrinth.project_url, "https://modrinth.com/project/vault");

        let hangar = normalize_project(
            PluginSource::Hangar,
            &json!({
                "name":"Plugin", "namespace":{"owner":"My Owner","slug":"plugin"},
                "avatarUrl":"https://example.com/icon.png", "stats":{"downloads":4}
            }),
        )
        .unwrap();
        assert_eq!(hangar.id, "My Owner/plugin");
        assert_eq!(
            hangar.project_url,
            "https://hangar.papermc.io/My%20Owner/plugin"
        );
        assert_eq!(hangar.downloads, 4);
        assert_eq!(hangar.compatibility, Compatibility::Unknown);

        let spiget = normalize_project(
            PluginSource::Spiget,
            &json!({
                "id":7, "name":"Vault--Data ✔", "tag":"1.8 plugin", "compatibility":"incompatible"
            }),
        )
        .unwrap();
        assert_eq!(spiget.slug, "vault-data");
        assert_eq!(spiget.project_url, "https://www.spigotmc.org/resources/7/");
        assert_eq!(spiget.compatibility, Compatibility::Incompatible);
    }

    #[test]
    fn compatibility_sort_uses_downloads_to_break_ties() {
        let mut projects: Vec<_> =
            [
                ("first", "compatible", 1),
                ("popular", "compatible", 100),
                ("unknown", "unknown", 1000),
                ("incompatible", "incompatible", 10000),
            ]
            .into_iter()
            .map(|(name, compatibility, downloads)| {
                normalize_project(PluginSource::Modrinth, &json!({
                "slug":name, "title":name, "compatibility":compatibility, "downloads":downloads
            })).unwrap()
            })
            .collect();
        sort_projects(&mut projects, SortMode::Compatibility);
        assert_eq!(
            projects
                .iter()
                .map(|record| record.name.as_str())
                .collect::<Vec<_>>(),
            ["popular", "first", "unknown", "incompatible"]
        );
    }

    #[test]
    fn parses_and_deduplicates_categories() {
        let modrinth = parse_categories(
            PluginSource::Modrinth,
            &json!([
                {"name":"technology","project_type":"mod"},
                {"name":"technology","project_type":"plugin"},
                {"name":""}, {}
            ]),
        )
        .unwrap();
        assert_eq!(
            modrinth,
            vec![Category {
                id: "technology".into(),
                name: "technology".into()
            }]
        );
        assert_eq!(
            parse_categories(
                PluginSource::Spiget,
                &json!([
                    {"id":2,"name":"Tools"}, {"name":"Missing ID"}
                ])
            )
            .unwrap(),
            vec![Category {
                id: "2".into(),
                name: "Tools".into()
            }]
        );
    }
}
