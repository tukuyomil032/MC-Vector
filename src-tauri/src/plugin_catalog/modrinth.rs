use super::{body, checksum, http, optional_string, string, strings};
use serde_json::{json, Value};

const API: &str = "https://api.modrinth.com/v2";

pub async fn search(
    query: String,
    facets: String,
    offset: u32,
    limit: u32,
    minecraft_version: Option<&str>,
) -> Result<Value, String> {
    let selected_version = minecraft_version
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let facets = search_facets(&facets, selected_version)?;
    let mut url = http::endpoint(API, &["search"])?;
    url.query_pairs_mut()
        .append_pair("query", &query)
        .append_pair("offset", &offset.to_string())
        .append_pair("limit", &http::page_limit(limit, 100)?.to_string());
    if !facets.is_empty() {
        url.query_pairs_mut().append_pair("facets", &facets);
    }
    let payload = http::get(url).await?;
    Ok(parse_search(&payload, selected_version))
}

fn search_facets(facets: &str, selected_version: Option<&str>) -> Result<String, String> {
    let Some(version) = selected_version else {
        return Ok(facets.to_owned());
    };
    let mut facets: Vec<Vec<String>> = if facets.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(facets).map_err(|_| "Invalid Modrinth search facets")?
    };
    // A separate AND group makes the selected version mandatory even if caller
    // facets contain an OR group for other versions. Only this enforced filter
    // allows search results to be marked compatible with the selected server.
    facets.push(vec![format!("versions:{version}")]);
    serde_json::to_string(&facets).map_err(|error| error.to_string())
}

fn parse_search(payload: &Value, selected_version: Option<&str>) -> Value {
    let hits: Vec<Value> = payload["hits"].as_array().into_iter().flatten().filter_map(|hit| {
        if !hit.is_object() || string(&hit["slug"]).is_empty() || string(&hit["title"]).is_empty() { return None; }
        let mut result = json!({"slug": string(&hit["slug"]), "title": string(&hit["title"]),
            "description": string(&hit["description"]), "icon_url": string(&hit["icon_url"]),
            "downloads": hit["downloads"].as_f64().unwrap_or(0.0), "project_type": string(&hit["project_type"]),
            "compatibility": if selected_version.is_some() { "compatible" } else { "unknown" },
            "supportedVersions": selected_version.map(|version| vec![version.to_owned()]).unwrap_or_else(|| strings(&hit["versions"]))});
        for key in ["project_id", "author"] {
            if let Some(value) = hit[key].as_str() { result[key] = json!(value); }
        }
        Some(result)
    }).collect();
    json!({"hits": hits, "total_hits": payload["total_hits"].as_u64().unwrap_or(0)})
}

pub async fn versions(
    project_id: &str,
    loader: Option<&str>,
    minecraft_version: Option<&str>,
) -> Result<Value, String> {
    let payload = http::get(versions_url(project_id, loader, minecraft_version)?).await?;
    Ok(if payload.is_array() {
        payload
    } else {
        json!([])
    })
}

fn versions_url(
    project_id: &str,
    loader: Option<&str>,
    minecraft_version: Option<&str>,
) -> Result<reqwest::Url, String> {
    let mut url = http::endpoint(API, &["project", project_id, "version"])?;
    for (key, value) in [("loaders", loader), ("game_versions", minecraft_version)] {
        if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
            url.query_pairs_mut()
                .append_pair(key, &json!([value]).to_string());
        }
    }
    Ok(url)
}

pub async fn compatible_version(
    project_id: &str,
    loader: &str,
    minecraft_version: &str,
) -> Result<Value, String> {
    let payload = versions(project_id, Some(loader), Some(minecraft_version)).await?;
    Ok(payload
        .as_array()
        .into_iter()
        .flatten()
        .find_map(parse_version)
        .unwrap_or(Value::Null))
}

pub async fn version_by_id(version_id: &str) -> Result<Value, String> {
    let payload = http::get(http::endpoint(API, &["version", version_id])?).await?;
    Ok(parse_version(&payload).unwrap_or(Value::Null))
}

pub async fn project_identity(project_id: &str) -> Result<Value, String> {
    let payload = http::get(http::endpoint(API, &["project", project_id])?).await?;
    Ok(parse_identity(&payload).unwrap_or(Value::Null))
}

pub async fn project_body(project_id: &str) -> Result<Option<String>, String> {
    let payload = http::get(http::endpoint(API, &["project", project_id])?).await?;
    Ok(body(&payload["body"]))
}

fn parse_identity(payload: &Value) -> Option<Value> {
    let (id, slug, title) = (
        string(&payload["id"]),
        string(&payload["slug"]),
        string(&payload["title"]),
    );
    if id.is_empty() || slug.is_empty() || title.is_empty() {
        return None;
    }
    Some(json!({"id": id, "slug": slug, "title": title}))
}

fn parse_version(payload: &Value) -> Option<Value> {
    let id = string(&payload["id"]);
    let file_name = selected_install_file(payload["files"].as_array()?, None)
        .map(|file| string(&file["filename"]))?;
    if id.is_empty() {
        return None;
    }
    let dependencies: Vec<Value> = payload["dependencies"].as_array().into_iter().flatten()
        .filter_map(|dependency| {
            let kind = string(&dependency["dependency_type"]);
            if kind.is_empty() { return None; }
            Some(json!({"dependencyType": kind, "projectId": optional_string(&dependency["project_id"]),
                "versionId": optional_string(&dependency["version_id"]), "fileName": optional_string(&dependency["file_name"])}))
        }).collect();
    Some(
        json!({"id": id, "fileName": file_name, "gameVersions": strings(&payload["game_versions"]), "dependencies": dependencies}),
    )
}

/// Additional authoritative fields needed by installation, without changing the
/// transitional catalog DTO consumed by existing renderer adapters.
pub async fn install_version(version_id: &str) -> Result<Value, String> {
    let payload = http::get(http::endpoint(API, &["version", version_id])?).await?;
    let mut parsed = parse_version(&payload).ok_or("Invalid Modrinth install version")?;
    parsed["projectId"] = optional_string(&payload["project_id"]);
    parsed["loaders"] = json!(strings(&payload["loaders"]));
    parsed["versionName"] = optional_string(&payload["version_number"]);
    Ok(parsed)
}

/// Transitional metadata lookup for the existing artifact transport. Selection
/// and hashes are resolved by provider ID; no renderer URL is used for metadata.
pub async fn artifact(version_id: &str, file_name: &str) -> Result<Value, String> {
    let payload = http::get(http::endpoint(API, &["version", version_id])?).await?;
    parse_artifact(&payload, file_name)
}

fn parse_artifact(payload: &Value, file_name: &str) -> Result<Value, String> {
    let files = payload["files"]
        .as_array()
        .ok_or("Failed to parse Modrinth version payload")?;
    let chosen = selected_install_file(files, Some(file_name))
        .ok_or("No downloadable files in Modrinth version")?;
    let url = string(&chosen["url"]);
    if url.is_empty() {
        return Err("No download URL in Modrinth version file".into());
    }
    let mut result = json!({"url": url});
    if let Some(hash) = checksum(&chosen["hashes"]) {
        result["checksum"] = hash;
    }
    Ok(result)
}

fn installable_jar(file: &Value) -> bool {
    let filename = string(&file["filename"]).trim().to_ascii_lowercase();
    let Some(stem) = filename.strip_suffix(".jar") else {
        return false;
    };
    if filename.is_empty() || string(&file["url"]).trim().is_empty() {
        return false;
    }
    // Source and Javadoc archives are JAR containers, but are not installable
    // plugin artifacts. Keep these out even if a provider accidentally marks
    // one as primary.
    !matches!(
        stem.rsplit(['-', '_', '.']).next(),
        Some("source" | "sources" | "javadoc" | "javadocs")
    )
}

fn selected_install_file<'a>(files: &'a [Value], preferred: Option<&str>) -> Option<&'a Value> {
    files
        .iter()
        .find(|file| file["primary"].as_bool() == Some(true) && installable_jar(file))
        .or_else(|| {
            preferred
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .and_then(|name| {
                    files.iter().find(|file| {
                        string(&file["filename"]).eq_ignore_ascii_case(name)
                            && installable_jar(file)
                    })
                })
        })
        .or_else(|| files.iter().find(|file| installable_jar(file)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_endpoint_preserves_provider_filters_and_rejects_url_ids() {
        let url = versions_url("plugin", Some(" paper "), Some(" 1.21 ")).unwrap();
        let pairs: std::collections::HashMap<_, _> = url.query_pairs().collect();
        assert_eq!(
            pairs.get("loaders").map(|value| value.as_ref()),
            Some("[\"paper\"]")
        );
        assert_eq!(
            pairs.get("game_versions").map(|value| value.as_ref()),
            Some("[\"1.21\"]")
        );
        assert!(versions_url("plugin", Some(" "), None)
            .unwrap()
            .query()
            .is_none());
        assert!(versions_url("https://evil.test/project", None, None).is_err());
    }

    #[test]
    fn parses_version_dependencies_and_skips_invalid_entries() {
        let payload = json!({"id":"v1", "files":[null, {"filename":"plugin.jar", "url":"https://cdn.modrinth.com/plugin"}],
            "game_versions":[" 1.21 ", false, ""], "dependencies":[null, {},
                {"dependency_type":"required", "project_id":"dep", "version_id":null}]});
        assert_eq!(
            parse_version(&payload),
            Some(
                json!({"id":"v1", "fileName":"plugin.jar", "gameVersions":["1.21"],
            "dependencies":[{"dependencyType":"required", "projectId":"dep", "versionId":null, "fileName":null}]})
            )
        );
        assert!(parse_version(&json!({"id":"v1", "files":[]})).is_none());
    }

    #[test]
    fn identity_requires_all_fields_and_search_ignores_invalid_hits() {
        assert!(parse_identity(&json!({"id":"id", "slug":"slug"})).is_none());
        let search = parse_search(
            &json!({"hits":[null, {"slug":"slug", "title":"Plugin"}], "total_hits":1}),
            None,
        );
        assert_eq!(search["hits"].as_array().unwrap().len(), 1);
        assert_eq!(search["hits"][0]["downloads"], 0.0);
    }

    #[test]
    fn selected_version_is_a_required_search_filter_and_owns_result_status() {
        let facets = search_facets(
            r#"[["project_type:plugin"],["versions:1.20","versions:1.21"]]"#,
            Some("1.21.4"),
        )
        .unwrap();
        let facets: Vec<Vec<String>> = serde_json::from_str(&facets).unwrap();
        assert_eq!(facets.last().unwrap(), &vec!["versions:1.21.4"]);
        assert!(search_facets("invalid facets", Some("1.21.4")).is_err());
        let payload = json!({"hits":[{"slug":"plugin","title":"Plugin","versions":["1.20","1.21.4"]}],"total_hits":1});
        let selected = parse_search(&payload, Some("1.21.4"));
        assert_eq!(selected["hits"][0]["compatibility"], "compatible");
        assert_eq!(selected["hits"][0]["supportedVersions"], json!(["1.21.4"]));
        let unfiltered = parse_search(&payload, None);
        assert_eq!(unfiltered["hits"][0]["compatibility"], "unknown");
        assert_eq!(
            unfiltered["hits"][0]["supportedVersions"],
            json!(["1.20", "1.21.4"])
        );
    }

    #[test]
    fn install_selection_prefers_primary_jar_and_rejects_sources_and_non_jars() {
        let payload = json!({"files":[
            {"filename":"plugin-sources.jar", "url":"https://cdn.modrinth.com/sources", "primary":true},
            {"filename":"plugin.zip", "url":"https://cdn.modrinth.com/zip", "primary":true},
            {"filename":"first.jar", "url":"https://cdn.modrinth.com/first"},
            {"filename":"primary.jar", "url":"https://cdn.modrinth.com/primary", "primary":true,
                "hashes":{"sha256":"primary-hash"}}
        ]});
        assert_eq!(
            parse_artifact(&payload, "first.jar").unwrap()["url"],
            "https://cdn.modrinth.com/primary"
        );
        assert_eq!(
            parse_artifact(&payload, "missing.jar").unwrap()["checksum"]["value"],
            "primary-hash"
        );
        assert_eq!(
            parse_version(&json!({"id":"v1", "files":payload["files"], "game_versions":["1.21"]}))
                .unwrap()["fileName"],
            "primary.jar"
        );
        let no_installable_artifacts = json!({"files":[
            {"filename":"plugin-sources.jar", "url":"https://cdn.modrinth.com/sources", "primary":true},
            {"filename":"plugin.zip", "url":"https://cdn.modrinth.com/zip", "primary":true}
        ]});
        assert!(parse_artifact(&no_installable_artifacts, "").is_err());
        assert!(
            parse_version(&json!({"id":"v1", "files":no_installable_artifacts["files"]})).is_none()
        );
    }

    #[test]
    fn when_no_primary_jar_is_available_selected_jar_is_the_fallback() {
        let payload = json!({"files":[
            {"filename":"plugin-sources.jar", "url":"https://cdn.modrinth.com/sources"},
            {"filename":"plugin.jar", "url":"https://cdn.modrinth.com/plugin"},
            {"filename":"plugin.zip", "url":"https://cdn.modrinth.com/zip"}
        ]});
        assert_eq!(
            parse_artifact(&payload, "missing.jar").unwrap()["url"],
            "https://cdn.modrinth.com/plugin"
        );
    }
}
