use super::{body, checksum, http, optional_string, string, strings};
use serde_json::{json, Map, Value};

const API: &str = "https://hangar.papermc.io/api/v1";

pub async fn search(query: String, offset: u32, limit: u32) -> Result<Value, String> {
    let mut url = http::endpoint(API, &["projects"])?;
    url.query_pairs_mut()
        .append_pair("query", &query)
        .append_pair("offset", &offset.to_string())
        .append_pair("limit", &http::page_limit(limit, 100)?.to_string());
    let payload = http::get(url).await?;
    let projects: Vec<Value> = payload["result"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(parse_project)
        .collect();
    Ok(json!({"result": projects, "pagination": payload["pagination"]}))
}

fn parse_project(project: &Value) -> Option<Value> {
    let name = string(&project["name"]);
    let owner = string(&project["namespace"]["owner"]);
    let slug = string(&project["namespace"]["slug"]);
    if name.is_empty() || owner.is_empty() || slug.is_empty() {
        return None;
    }
    Some(
        json!({"name": name, "namespace":{"owner":owner,"slug":slug},
        "stats":{"downloads":project["stats"]["downloads"].as_f64().unwrap_or(0.0),
            "stars":project["stats"]["stars"].as_f64().unwrap_or(0.0)},
        "description":string(&project["description"]), "avatarUrl":string(&project["avatarUrl"])}),
    )
}

pub async fn versions(
    owner: &str,
    slug: &str,
    platform: Option<&str>,
) -> Result<Vec<Value>, String> {
    let platform = platform.filter(|value| !value.is_empty());
    let primary = fetch_versions(owner, slug, platform).await?;
    if !primary.is_empty() || platform.is_none() {
        return Ok(primary);
    }
    fetch_versions(owner, slug, None).await
}

async fn fetch_versions(
    owner: &str,
    slug: &str,
    platform: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut url = http::endpoint(API, &["projects", owner, slug, "versions"])?;
    url.query_pairs_mut().append_pair("limit", "30");
    if let Some(platform) = platform.filter(|value| !value.is_empty()) {
        url.query_pairs_mut().append_pair("platform", platform);
    }
    let payload = http::get(url).await?;
    Ok(parse_versions(&payload))
}

fn parse_versions(payload: &Value) -> Vec<Value> {
    payload["result"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(parse_version)
        .collect()
}

fn parse_version(version: &Value) -> Option<Value> {
    let name = string(&version["name"]);
    if name.is_empty() {
        return None;
    }
    let mut downloads = Map::new();
    for (platform, payload) in version["downloads"].as_object()? {
        let download_url = optional_string(&payload["downloadUrl"]);
        let external_url = optional_string(&payload["externalUrl"]);
        if download_url.is_null() && external_url.is_null() {
            continue;
        }
        let mut download = json!({"downloadUrl":download_url,"externalUrl":external_url,
            "fileName":optional_string(&payload["fileInfo"]["name"])});
        if let Some(hash) = checksum(&payload["fileInfo"]) {
            download["checksum"] = hash;
        }
        downloads.insert(platform.to_uppercase(), download);
    }
    if downloads.is_empty() {
        return None;
    }
    let mut dependencies = Map::new();
    if let Some(raw) = version["platformDependencies"].as_object() {
        for (platform, values) in raw {
            if values.is_array() {
                dependencies.insert(platform.to_uppercase(), json!(strings(values)));
            }
        }
    }
    Some(
        json!({"name":name,"downloads":downloads,"platformDependencies":dependencies,
        // Hangar's `pluginDependencies` are separate from `platformDependencies`.
        // Preserve them so install planning can fail closed on required edges.
        "pluginDependencies":version.get("pluginDependencies").cloned().unwrap_or(Value::Null)}),
    )
}

fn platform(software: &str) -> &'static str {
    let normalized = software.to_ascii_lowercase();
    if normalized.contains("velocity") {
        "VELOCITY"
    } else if normalized.contains("waterfall") || normalized.contains("bungeecord") {
        "WATERFALL"
    } else {
        "PAPER"
    }
}

/// Hangar `platformDependencies` contains supported Minecraft versions for a
/// platform (for example `PAPER: ["1.21"]`), not other plugin projects.
fn platform_versions(version: &Value, platform: &str) -> Vec<String> {
    strings(&version["platformDependencies"][platform])
}

fn has_platform_download(version: &Value, platform: &str) -> bool {
    version["downloads"].get(platform).is_some()
}

fn matching(available: &[String], minecraft_version: &str) -> bool {
    if available.is_empty() || minecraft_version.is_empty() {
        return true;
    }
    let normalized = minecraft_version.trim();
    let major_minor = normalized.split('.').take(2).collect::<Vec<_>>().join(".");
    available
        .iter()
        .any(|value| value.trim() == normalized || value.trim() == major_minor)
}

fn supported_versions(versions: &[Value], platform: &str) -> Vec<String> {
    let mut supported = Vec::new();
    for value in versions
        .iter()
        .filter(|version| has_platform_download(version, platform))
        .flat_map(|version| platform_versions(version, platform))
    {
        if !supported.contains(&value) {
            supported.push(value);
        }
    }
    supported
}

fn sanitize_file_name(value: &str) -> String {
    let mut result = String::new();
    for character in value.to_ascii_lowercase().chars() {
        let character = if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        {
            character
        } else {
            '-'
        };
        if character != '-' || !result.ends_with('-') {
            result.push(character);
        }
    }
    result.trim_matches('-').to_owned()
}

fn resolve(versions: &[Value], slug: &str, platform: &str, minecraft_version: &str) -> Value {
    let available = versions
        .iter()
        .filter(|version| has_platform_download(version, platform))
        .collect::<Vec<_>>();
    let compatible = available
        .iter()
        .copied()
        .find(|version| matching(&platform_versions(version, platform), minecraft_version));
    let Some(selected) = compatible.or_else(|| available.first().copied()) else {
        return Value::Null;
    };
    let Some(downloads) = selected["downloads"].as_object() else {
        return Value::Null;
    };
    let Some(download) = downloads.get(platform) else {
        return Value::Null;
    };
    let supplied_name = string(&download["fileName"]);
    let fallback = format!(
        "{}.jar",
        sanitize_file_name(&format!("{slug}-{}", string(&selected["name"])))
    );
    let mut result = json!({"versionName":selected["name"], "fileName":if supplied_name.is_empty() { &fallback } else { supplied_name },
        "downloadUrl":download["downloadUrl"],"externalUrl":download["externalUrl"],
        "compatible":compatible.is_some(),"compatibility":compatibility_result(versions,platform,minecraft_version)["compatibility"],
        "supportedVersions":supported_versions(versions,platform),
        "pluginDependencies":selected["pluginDependencies"].clone()});
    if let Some(hash) = download.get("checksum") {
        result["checksum"] = hash.clone();
    }
    result
}

pub async fn resolve_download(
    owner: &str,
    slug: &str,
    software: &str,
    minecraft_version: &str,
) -> Result<Value, String> {
    let platform = platform(software);
    let versions = versions(owner, slug, Some(platform)).await?;
    let result = resolve(&versions, slug, platform, minecraft_version);
    if result.is_null() {
        return Err(format!(
            "No Hangar download is available for server platform {platform}"
        ));
    }
    Ok(result)
}

/// Returns required dependency names for the selected platform. The installer
/// does not yet resolve Hangar's plugin dependency graph, so callers must reject
/// required dependencies rather than confusing them with Minecraft constraints.
pub fn required_plugin_dependencies(
    version: &Value,
    software: &str,
) -> Result<Vec<String>, String> {
    let platform = platform(software);
    if version["pluginDependencies"].is_null() {
        return Ok(Vec::new());
    }
    let Some(by_platform) = version["pluginDependencies"].as_object() else {
        return Err("Hangar plugin dependency metadata is malformed; install manually".into());
    };
    let Some(raw) = by_platform.get(platform) else {
        return Ok(Vec::new());
    };
    let Some(dependencies) = raw.as_array() else {
        return Err("Hangar plugin dependency metadata is malformed; install manually".into());
    };
    let mut required = Vec::new();
    for dependency in dependencies {
        let Some(is_required) = dependency["required"].as_bool() else {
            return Err(
                "Hangar plugin dependency requirement is unverifiable; install manually".into(),
            );
        };
        if is_required {
            let name = string(&dependency["name"]);
            if name.is_empty() {
                return Err(
                    "Hangar required plugin dependency has no name; install manually".into(),
                );
            }
            required.push(name.to_owned());
        }
    }
    Ok(required)
}

pub fn validate_required_dependencies(version: &Value, software: &str) -> Result<(), String> {
    let required = required_plugin_dependencies(version, software)?;
    if required.is_empty() {
        return Ok(());
    }
    Err(format!(
        "This Hangar version requires {}. Automatic Hangar dependency installation is not supported yet; install those plugins manually, then retry",
        required.join(", ")
    ))
}

pub async fn compatibility(
    owner: &str,
    slug: &str,
    software: &str,
    minecraft_version: &str,
) -> Result<Value, String> {
    let platform = platform(software);
    let versions = versions(owner, slug, Some(platform)).await?;
    Ok(compatibility_result(&versions, platform, minecraft_version))
}

fn compatibility_result(versions: &[Value], platform: &str, minecraft_version: &str) -> Value {
    let supported = supported_versions(versions, platform);
    let compatible = versions.iter().any(|version| {
        has_platform_download(version, platform)
            && matching(&platform_versions(version, platform), minecraft_version)
    });
    let status = if supported.is_empty() || minecraft_version.trim().is_empty() {
        "unknown"
    } else if compatible {
        "compatible"
    } else {
        "incompatible"
    };
    json!({"compatible":compatible,"compatibility":status,"supportedVersions":supported})
}

pub async fn project_body(owner: &str, slug: &str) -> Result<Option<String>, String> {
    let payload = http::get(http::endpoint(API, &["projects", owner, slug])?).await?;
    Ok(body(&payload["mainPageContent"]).or_else(|| body(&payload["description"])))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Vec<Value> {
        parse_versions(
            &json!({"result":[null, {}, {"name":"2.0", "downloads":{"paper":{
            "downloadUrl":"https://hangar.papermc.io/plugin.jar", "fileInfo":{"sha256Hash":"A".repeat(64)}}},
            "platformDependencies":{"paper":["1.21", " 1.21.1 ", false, ""]}},
            {"name":"1.0", "downloads":{"PAPER":{"externalUrl":"https://example.org"}},
            "platformDependencies":{"PAPER":["1.20"]}}]}),
        )
    }

    #[test]
    fn parses_downloads_hashes_and_dependencies() {
        let versions = fixture();
        assert_eq!(versions.len(), 2);
        assert_eq!(
            versions[0]["downloads"]["PAPER"]["checksum"]["value"],
            "a".repeat(64)
        );
        assert_eq!(
            platform_versions(&versions[0], "PAPER"),
            vec!["1.21", "1.21.1"]
        );
        assert!(parse_version(&json!({"name":"1", "downloads":{"PAPER":{}}})).is_none());
    }

    #[test]
    fn selects_matching_version_and_preserves_incompatible_fallback() {
        let versions = fixture();
        let matching = resolve(&versions, "My Plugin", "PAPER", "1.20.6");
        assert_eq!(matching["versionName"], "1.0");
        assert_eq!(matching["compatible"], true);
        assert_eq!(matching["fileName"], "my-plugin-1.0.jar");
        let fallback = resolve(&versions, "plugin", "PAPER", "1.19");
        assert_eq!(fallback["versionName"], "2.0");
        assert_eq!(fallback["compatible"], false);
        assert_eq!(
            fallback["supportedVersions"],
            json!(["1.21", "1.21.1", "1.20"])
        );
        assert!(resolve(&[], "plugin", "PAPER", "1.21").is_null());
    }

    #[test]
    fn platform_selection_and_empty_metadata_remain_platform_scoped() {
        assert_eq!(platform("Velocity"), "VELOCITY");
        assert_eq!(platform("BungeeCord"), "WATERFALL");
        assert_eq!(platform("purpur"), "PAPER");
        assert!(matching(&[], "1.21"));
        assert!(matching(&["1.21".into()], "1.21.4"));
        assert!(!matching(&["1.21.1".into()], "1.21.4"));
        let version = json!({"platformDependencies":{"VELOCITY":["1.21"]}});
        assert!(platform_versions(&version, "PAPER").is_empty());
    }

    #[test]
    fn platform_dependencies_are_minecraft_constraints_not_plugin_edges() {
        let version = parse_version(&json!({
            "name":"2.0",
            "downloads":{"PAPER":{"downloadUrl":"https://hangar.papermc.io/plugin.jar"}},
            "platformDependencies":{"PAPER":["1.21"]},
            "pluginDependencies":{"PAPER":[{"name":"RequiredPlugin","required":true,"namespace":{"owner":"Owner","slug":"RequiredPlugin"}}]}
        })).unwrap();

        assert_eq!(platform_versions(&version, "PAPER"), vec!["1.21"]);
        assert_eq!(version["platformDependencies"]["PAPER"], json!(["1.21"]));
        assert_eq!(
            required_plugin_dependencies(&version, "Paper").unwrap(),
            vec!["RequiredPlugin"]
        );
        let resolved = resolve(&[version], "plugin", "PAPER", "1.21");
        assert!(validate_required_dependencies(&resolved, "Paper")
            .unwrap_err()
            .contains("RequiredPlugin"));
    }

    #[test]
    fn malformed_hangar_plugin_dependency_metadata_fails_closed() {
        let version = parse_version(&json!({
            "name":"2.0",
            "downloads":{"PAPER":{"downloadUrl":"https://hangar.papermc.io/plugin.jar"}},
            "platformDependencies":{"PAPER":["1.21"]},
            "pluginDependencies":{"PAPER":[{"name":"RequiredPlugin"}]}
        }))
        .unwrap();

        assert_eq!(platform_versions(&version, "PAPER"), vec!["1.21"]);
        assert!(validate_required_dependencies(&version, "Paper")
            .unwrap_err()
            .contains("unverifiable"));
        let optional =
            json!({"pluginDependencies":{"PAPER":[{"name":"OptionalPlugin","required":false}]}});
        assert!(validate_required_dependencies(&optional, "Paper").is_ok());
    }

    #[test]
    fn compatibility_status_is_unknown_without_supported_metadata() {
        let versions = fixture();
        assert_eq!(
            compatibility_result(&versions, "PAPER", "1.21.4")["compatibility"],
            "compatible"
        );
        assert_eq!(
            compatibility_result(&versions, "PAPER", "1.19")["compatibility"],
            "incompatible"
        );
        assert_eq!(
            compatibility_result(&versions, "PAPER", "")["compatibility"],
            "unknown"
        );
        assert_eq!(
            compatibility_result(&[], "PAPER", "1.21.4")["compatibility"],
            "unknown"
        );
        let no_dependencies = parse_versions(
            &json!({"result":[{"name":"1.0","downloads":{"PAPER":{"downloadUrl":"https://hangar.papermc.io/plugin.jar"}}}]}),
        );
        let result = compatibility_result(&no_dependencies, "PAPER", "1.21.4");
        assert_eq!(result["compatible"], true);
        assert_eq!(result["compatibility"], "unknown");
        assert_eq!(result["supportedVersions"], json!([]));
    }
    #[test]
    fn missing_platform_never_selects_another_platform_artifact_or_compatibility() {
        let versions = parse_versions(&json!({"result":[
            {"name":"velocity-only", "downloads":{"VELOCITY":{"downloadUrl":"https://hangar.papermc.io/velocity.jar"}},
             "platformDependencies":{"VELOCITY":["1.21"]}},
            {"name":"paper", "downloads":{"PAPER":{"downloadUrl":"https://hangar.papermc.io/paper.jar"}},
             "platformDependencies":{"PAPER":["1.20"]}}
        ]}));
        assert!(resolve(&versions[..1], "plugin", "PAPER", "1.21").is_null());
        let missing = compatibility_result(&versions[..1], "PAPER", "1.21");
        assert_eq!(missing["compatibility"], "unknown");
        assert_eq!(missing["compatible"], false);
        assert_eq!(missing["supportedVersions"], json!([]));
        let paper = resolve(&versions, "plugin", "PAPER", "1.20");
        assert_eq!(paper["versionName"], "paper");
        assert_eq!(paper["downloadUrl"], "https://hangar.papermc.io/paper.jar");
        assert_eq!(paper["supportedVersions"], json!(["1.20"]));
    }
}
