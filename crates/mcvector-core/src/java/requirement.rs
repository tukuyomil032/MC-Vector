//! Which Java major a Minecraft version needs. Mojang's version JSON
//! (`javaVersion.majorVersion`) is preferred; a built-in table covers offline
//! use and versions Mojang does not list.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use reqwest::{redirect, Client, Url};
use serde_json::Value;

use crate::download::{read_limited_response_body, send_request_with_timeout, user_agent};

const MOJANG_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const MOJANG_HOSTS: &[&str] = &["piston-meta.mojang.com"];
const MAX_MOJANG_BYTES: u64 = 4 * 1024 * 1024;
const MOJANG_TIMEOUT: Duration = Duration::from_secs(10);

/// Software whose version is not a Minecraft version (proxies).
const PROXY_SOFTWARE: &[&str] = &["Velocity", "BungeeCord", "Waterfall"];

/// Where a requirement came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequirementSource {
    /// Mojang's version JSON (fetched now or earlier in this process).
    Mojang,
    /// The built-in table.
    Table,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct JavaRequirement {
    pub major: u16,
    pub source: RequirementSource,
}

static MOJANG_CACHE: LazyLock<Mutex<HashMap<String, u16>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Numeric release components of a Minecraft version (`1.20.4` → [1, 20, 4],
/// `26.1` → [26, 1]). Pre-release suffixes after `-` are ignored; snapshots
/// such as `24w14a` return None.
pub fn release_components(version: &str) -> Option<Vec<u32>> {
    let base = version.trim().split(['-', ' ', '+']).next()?;
    if base.is_empty() {
        return None;
    }
    base.split('.')
        .map(|part| part.parse::<u32>().ok())
        .collect::<Option<Vec<_>>>()
        .filter(|parts| !parts.is_empty())
}

/// The built-in table: ≤1.16.5 → 8, 1.17.x → 16, 1.18–1.20.4 → 17,
/// 1.20.5–1.21.x → 21, year-based releases (26.1 and later) → 25.
pub fn table_requirement(version: &str) -> Option<u16> {
    let parts = release_components(version)?;
    let major = parts[0];
    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);
    match major {
        1 => Some(match minor {
            0..=16 => 8,
            17 => 16,
            18 | 19 => 17,
            20 if patch <= 4 => 17,
            _ => 21,
        }),
        // Year-based numbering began with 26.1, which requires Java 25.
        26.. => Some(25),
        _ => None,
    }
}

fn mojang_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(MOJANG_TIMEOUT)
        .timeout(MOJANG_TIMEOUT * 2)
        .user_agent(user_agent())
        .redirect(redirect::Policy::none())
        .build()
        .map_err(|error| format!("Failed to create Mojang metadata client: {error}"))
}

fn approved_mojang_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && url
            .host_str()
            .is_some_and(|host| MOJANG_HOSTS.contains(&host))
}

async fn fetch_json(client: &Client, url: Url) -> Result<Value, String> {
    let response = send_request_with_timeout(
        client.get(url).header("Accept", "application/json"),
        MOJANG_TIMEOUT,
        "Mojang metadata request",
    )
    .await?;
    if !response.status().is_success() {
        return Err(format!(
            "Mojang metadata request failed with HTTP {}",
            response.status()
        ));
    }
    let body = read_limited_response_body(response, MAX_MOJANG_BYTES, "Mojang metadata").await?;
    serde_json::from_slice(&body).map_err(|error| format!("Invalid Mojang metadata: {error}"))
}

/// `javaVersion.majorVersion` of `version` from Mojang. `Ok(None)` when Mojang
/// does not list the version or its JSON has no requirement.
pub(crate) async fn mojang_java_major_from(
    client: &Client,
    manifest_url: Url,
    version: &str,
    approved: fn(&Url) -> bool,
) -> Result<Option<u16>, String> {
    if !approved(&manifest_url) {
        return Err("Mojang metadata endpoint is not approved".into());
    }
    let manifest = fetch_json(client, manifest_url).await?;
    let Some(detail) = manifest["versions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|entry| entry["id"].as_str() == Some(version.trim()))
        .and_then(|entry| entry["url"].as_str())
    else {
        return Ok(None);
    };
    let detail = Url::parse(detail).map_err(|_| "Mojang version URL is invalid".to_string())?;
    if !approved(&detail) {
        return Err("Mojang version URL is outside the approved host".into());
    }
    let detail = fetch_json(client, detail).await?;
    Ok(detail["javaVersion"]["majorVersion"]
        .as_u64()
        .and_then(|major| u16::try_from(major).ok())
        .filter(|major| (1..=99).contains(major)))
}

fn cached(version: &str) -> Option<u16> {
    MOJANG_CACHE
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .get(version)
        .copied()
}

/// The Java major `software` at `version` needs, or None for proxies and
/// versions neither Mojang nor the table knows.
pub async fn required_java(software: &str, version: &str) -> Option<JavaRequirement> {
    if PROXY_SOFTWARE
        .iter()
        .any(|proxy| proxy.eq_ignore_ascii_case(software))
    {
        return None;
    }
    let version = version.trim();
    if version.is_empty() {
        return None;
    }
    if let Some(major) = cached(version) {
        return Some(JavaRequirement {
            major,
            source: RequirementSource::Mojang,
        });
    }
    let mojang = match (mojang_client(), Url::parse(MOJANG_MANIFEST_URL)) {
        // Unit tests never reach the real Mojang API; the lookup itself is
        // tested against a loopback server.
        _ if cfg!(test) => Ok(None),
        (Ok(client), Ok(url)) => {
            mojang_java_major_from(&client, url, version, approved_mojang_url).await
        }
        (Err(error), _) => Err(error),
        (_, Err(error)) => Err(error.to_string()),
    };
    match mojang {
        Ok(Some(major)) => {
            MOJANG_CACHE
                .lock()
                .unwrap_or_else(|poison| poison.into_inner())
                .insert(version.to_owned(), major);
            return Some(JavaRequirement {
                major,
                source: RequirementSource::Mojang,
            });
        }
        Ok(None) => {}
        Err(error) => log::debug!("Mojang Java requirement lookup failed: {error}"),
    }
    table_requirement(version).map(|major| JavaRequirement {
        major,
        source: RequirementSource::Table,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::{client, LoopbackServer, Route};

    #[test]
    fn table_matches_mojang_eras() {
        for (version, major) in [
            ("1.8.9", Some(8)),
            ("1.16.5", Some(8)),
            ("1.17", Some(16)),
            ("1.17.1", Some(16)),
            ("1.18.2", Some(17)),
            ("1.20.4", Some(17)),
            ("1.20.5", Some(21)),
            ("1.21.11", Some(21)),
            ("1.21-pre1", Some(21)),
            ("26.1", Some(25)),
            ("24w14a", None),
            ("", None),
        ] {
            assert_eq!(table_requirement(version), major, "{version}");
        }
    }

    #[tokio::test]
    async fn proxies_have_no_minecraft_requirement() {
        assert_eq!(required_java("Velocity", "3.4.0").await, None);
    }

    #[tokio::test]
    async fn mojang_requirement_is_read_from_a_loopback_manifest() {
        let server = LoopbackServer::start(
            vec![
                Route::json(
                    "/manifest.json",
                    serde_json::json!({"versions": [
                        {"id": "1.21.4", "type": "release", "url": "{base}/1.21.4.json"},
                        {"id": "1.17.1", "type": "release", "url": "https://evil.example/x.json"}
                    ]}),
                ),
                Route::json(
                    "/1.21.4.json",
                    serde_json::json!({"javaVersion": {"component": "java-runtime-delta", "majorVersion": 21}}),
                ),
            ],
            4,
        );
        let loopback = |url: &Url| url.host_str() == Some("127.0.0.1");
        let manifest = server.url("/manifest.json");
        assert_eq!(
            mojang_java_major_from(&client(), manifest.clone(), "1.21.4", loopback)
                .await
                .unwrap(),
            Some(21)
        );
        assert_eq!(
            mojang_java_major_from(&client(), manifest.clone(), "9.9.9", loopback)
                .await
                .unwrap(),
            None
        );
        let error = mojang_java_major_from(&client(), manifest, "1.17.1", loopback)
            .await
            .unwrap_err();
        assert!(error.contains("approved"), "{error}");
        server.finish();
    }

    #[test]
    fn only_https_mojang_metadata_is_approved() {
        assert!(!approved_mojang_url(
            &Url::parse("http://piston-meta.mojang.com/x").unwrap()
        ));
        assert!(!approved_mojang_url(
            &Url::parse("https://piston-meta.mojang.com.evil.test/x").unwrap()
        ));
        assert!(approved_mojang_url(
            &Url::parse("https://piston-meta.mojang.com/x").unwrap()
        ));
    }
}
