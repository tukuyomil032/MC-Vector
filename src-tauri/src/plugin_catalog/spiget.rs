use super::{body, http, string};
use base64::{
    engine::{
        general_purpose::{GeneralPurpose, GeneralPurposeConfig},
        DecodePaddingMode,
    },
    Engine,
};
use serde_json::{json, Value};
use std::sync::OnceLock;

const API: &str = "https://api.spiget.org/v2";

pub async fn search(
    query: String,
    page: u32,
    size: u32,
    minecraft_version: Option<&str>,
) -> Result<Vec<Value>, String> {
    let payload = http::get(search_url(&query, page, size)?).await?;
    Ok(payload
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|resource| parse_resource(resource, minecraft_version))
        .collect())
}

fn search_url(query: &str, page: u32, size: u32) -> Result<reqwest::Url, String> {
    let trimmed = query.trim();
    let mut url = if trimmed.is_empty() {
        http::endpoint(API, &["resources", "free"])?
    } else {
        // Search text is not an identifier. Encode the whole term as one path
        // segment so punctuation and slashes retain their former search meaning.
        let mut url = http::endpoint(API, &["search", "resources"])?;
        url.path_segments_mut()
            .map_err(|_| "Invalid provider path")?
            .push(trimmed);
        url
    };
    url.query_pairs_mut()
        .append_pair("size", &http::page_limit(size, 100)?.to_string())
        .append_pair("page", &page.max(1).to_string())
        .append_pair("sort", "-downloads");
    Ok(url)
}

fn parse_resource(resource: &Value, minecraft_version: Option<&str>) -> Option<Value> {
    let id = resource["id"].as_u64()?;
    let name = string(&resource["name"]);
    if name.is_empty() {
        return None;
    }
    let supported = version_hints(string(&resource["tag"]));
    let compatibility = compatibility(&supported, minecraft_version);
    let mut parsed = json!({"id":id,"name":name,"tag":string(&resource["tag"]),
        "supportedVersions":supported, "compatibility":compatibility,
        "downloads":resource["downloads"].as_f64().unwrap_or(0.0),
        "premium":resource["premium"].as_bool().unwrap_or(false),"external":resource["external"].as_bool().unwrap_or(false)});
    let icon_path = string(&resource["icon"]["url"]);
    if !icon_path.is_empty() {
        let lower = icon_path.to_ascii_lowercase();
        parsed["iconUrl"] = json!(
            if lower.starts_with("http://") || lower.starts_with("https://") {
                icon_path.to_owned()
            } else {
                format!(
                    "https://www.spigotmc.org/{}",
                    icon_path.trim_start_matches('/')
                )
            }
        );
    }
    for (target, value) in [
        ("authorName", &resource["author"]["name"]),
        ("fileType", &resource["file"]["type"]),
    ] {
        if !string(value).is_empty() {
            parsed[target] = value.clone();
        }
    }
    let file_url = string(&resource["file"]["url"]);
    if let Some(version) = version_id(file_url) {
        parsed["latestVersionId"] = json!(version);
    }
    Some(parsed)
}

// Spiget publishes free-form tag text rather than a Minecraft version matrix.
// Preserve the existing hint policy centrally: hints match by major/minor, while
// missing hints or a missing selected server version leave eligibility unknown.
fn version_hints(text: &str) -> Vec<String> {
    static PATTERN: OnceLock<regex::Regex> = OnceLock::new();
    let pattern = PATTERN.get_or_init(|| {
        regex::Regex::new(r"(?-u:\b1\.[0-9]+(?:\.[0-9]+)?\b)")
            .expect("Minecraft version hint pattern is valid")
    });
    let mut versions = Vec::new();
    for found in pattern.find_iter(text) {
        let value = found.as_str().to_owned();
        if !versions.contains(&value) {
            versions.push(value);
        }
    }
    versions
}

fn compatibility(supported: &[String], minecraft_version: Option<&str>) -> &'static str {
    let Some(server) = minecraft_version
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return "unknown";
    };
    if supported.is_empty() {
        return "unknown";
    }
    let major_minor = |value: &str| value.split('.').take(2).collect::<Vec<_>>().join(".");
    if supported
        .iter()
        .any(|value| value.trim() == server || major_minor(value.trim()) == major_minor(server))
    {
        "compatible"
    } else {
        "incompatible"
    }
}

fn version_id(url: &str) -> Option<u64> {
    url.split(['?', '&']).skip(1).find_map(|part| {
        let value = part.strip_prefix("version=")?;
        let digits: String = value.chars().take_while(char::is_ascii_digit).collect();
        digits.parse().ok()
    })
}

/// Resolve the authoritative resource and latest version for install planning.
pub async fn install_resource(resource_id: u64, minecraft_version: &str) -> Result<Value, String> {
    let id = resource_id.to_string();
    let payload = http::get(http::endpoint(API, &["resources", &id])?).await?;
    let mut parsed =
        parse_resource(&payload, Some(minecraft_version)).ok_or("Invalid Spiget resource")?;
    if parsed["premium"].as_bool() != Some(true) && parsed["external"].as_bool() != Some(true) {
        let version = http::get(http::endpoint(
            API,
            &["resources", &id, "versions", "latest"],
        )?)
        .await?;
        parsed["versionName"] = version["name"].clone();
        parsed["versionId"] = version["id"].clone();
    }
    Ok(parsed)
}

pub async fn resource_body(resource_id: u64) -> Result<Option<String>, String> {
    let payload = http::get(http::endpoint(
        API,
        &["resources", &resource_id.to_string()],
    )?)
    .await?;
    Ok(parse_body(&payload))
}

fn parse_body(payload: &Value) -> Option<String> {
    let raw = string(&payload["description"]);
    // Match browser atob: providers may omit padding or include ASCII spacing.
    let normalized: String = raw
        .chars()
        .filter(|value| !value.is_ascii_whitespace())
        .collect();
    let decoder = GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_padding_mode(DecodePaddingMode::Indifferent)
            .with_decode_allow_trailing_bits(true),
    );
    let decoded = decoder
        .decode(normalized)
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_else(|_| raw.to_owned());
    body(&json!(decoded))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose::STANDARD;

    #[test]
    fn search_text_is_encoded_as_one_segment_and_empty_query_uses_free_resources() {
        let url = search_url(" redstone / tools?version=1 ", 0, 25).unwrap();
        assert_eq!(url.host_str(), Some("api.spiget.org"));
        assert!(url.path().ends_with("redstone%20%2F%20tools%3Fversion=1"));
        assert!(url
            .query_pairs()
            .any(|(key, value)| key == "page" && value == "1"));
        assert_eq!(search_url(" ", 1, 25).unwrap().path(), "/v2/resources/free");
    }

    #[test]
    fn fixture_preserves_resource_optional_fields() {
        let parsed = parse_resource(&json!({"id":123,"name":"Plugin","icon":{"url":"/data/icon.png"},
            "author":{"name":"Author"},"file":{"type":".jar","url":"https://example.org/?version=456&x=1"}}), None).unwrap();
        assert_eq!(parsed["iconUrl"], "https://www.spigotmc.org/data/icon.png");
        assert_eq!(parsed["latestVersionId"], 456);
        assert!(parse_resource(&json!({"id":-1,"name":"bad"}), None).is_none());
        assert!(parse_resource(&Value::Null, None).is_none());
        assert!(parse_resource(&json!({"id":1,"name":"Minimal"}), None)
            .unwrap()
            .get("iconUrl")
            .is_none());
    }

    #[test]
    fn version_hints_are_deduplicated_and_keep_original_word_boundaries() {
        assert_eq!(
            version_hints("Supports 1.21.4, 1.20 and 1.21.4"),
            vec!["1.21.4", "1.20"]
        );
        assert!(version_hints("v1.21 11.20 release_1.19 2.0").is_empty());
        assert_eq!(version_hints("[1.21.x]"), vec!["1.21"]);
    }

    #[test]
    fn resource_compatibility_is_resolved_against_selected_server_in_rust() {
        let resource = json!({"id":1, "name":"Plugin", "tag":"Supports 1.21.1 / 1.20"});
        let compatible = parse_resource(&resource, Some("1.21.4")).unwrap();
        assert_eq!(compatible["compatibility"], "compatible");
        assert_eq!(compatible["supportedVersions"], json!(["1.21.1", "1.20"]));
        assert_eq!(
            parse_resource(&resource, Some("1.19.4")).unwrap()["compatibility"],
            "incompatible"
        );
        assert_eq!(
            parse_resource(&resource, None).unwrap()["compatibility"],
            "unknown"
        );
        assert_eq!(
            parse_resource(&resource, Some(" ")).unwrap()["compatibility"],
            "unknown"
        );
        assert_eq!(
            parse_resource(&json!({"id":1,"name":"No hints"}), Some("1.21.4")).unwrap()
                ["compatibility"],
            "unknown"
        );
    }

    #[test]
    fn decodes_utf8_base64_body_and_preserves_plain_text_on_failure() {
        let encoded = STANDARD.encode("説明文 <b>Plugin</b>");
        assert_eq!(
            parse_body(&json!({"description":encoded})),
            Some("説明文 <b>Plugin</b>".into())
        );
        assert_eq!(
            parse_body(&json!({"description":"plain description!"})),
            Some("plain description!".into())
        );
        assert_eq!(parse_body(&json!({"description":""})), None);
        assert_eq!(
            parse_body(&json!({"description":" Y Q\n"})),
            Some("a".into())
        );
    }
}
