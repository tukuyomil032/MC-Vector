//! Eclipse Adoptium (Temurin) metadata: the LTS majors on offer and the
//! signed-off JDK package (URL, SHA-256, size) for the host OS and CPU.

use std::time::Duration;

use reqwest::{redirect, Client, Url};
use serde::Deserialize;

use super::extract::ArchiveKind;
use crate::download::{read_limited_response_body, send_request_with_timeout, user_agent};

pub const ADOPTIUM_API: &str = "https://api.adoptium.net/v3";
/// LTS majors shown when Adoptium cannot be reached.
pub const FALLBACK_LTS_RELEASES: &[u16] = &[8, 17, 21, 25];
/// Hosts a Java download (and its redirects) may use.
pub const JAVA_DOWNLOAD_HOSTS: &[&str] = &[
    "api.adoptium.net",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];
pub const MAX_JAVA_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_JAVA_METADATA_BYTES: u64 = 4 * 1024 * 1024;
const JAVA_CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const JAVA_RESPONSE_HEADERS_TIMEOUT: Duration = Duration::from_secs(30);
const JAVA_METADATA_REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const RELEASES_HEADERS_TIMEOUT: Duration = Duration::from_secs(10);

/// One JDK archive to download. Only [`resolve_package`] and the debug E2E
/// fixture create these, so the URL has always passed the download policy.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaPackage {
    pub(crate) url: Url,
    pub(crate) sha256: String,
    pub(crate) size: u64,
    pub(crate) archive: ArchiveKind,
}

impl JavaPackage {
    pub fn size(&self) -> u64 {
        self.size
    }

    pub fn sha256(&self) -> &str {
        &self.sha256
    }

    pub fn archive(&self) -> ArchiveKind {
        self.archive
    }
}

/// Adoptium's `os` and `architecture` names for this machine.
pub fn host_platform() -> Result<(&'static str, &'static str), String> {
    let os = match std::env::consts::OS {
        "macos" => "mac",
        "windows" => "windows",
        "linux" => "linux",
        _ => return Err("Unsupported operating system".to_string()),
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        "x86_64" => "x64",
        _ => return Err("Unsupported CPU architecture".to_string()),
    };
    Ok((os, arch))
}

pub(crate) fn validate_java_download_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url.trim()).map_err(|_| "Invalid Java download URL".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Java download URL host is missing".to_string())?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.fragment().is_some()
        || host.parse::<std::net::IpAddr>().is_ok()
        || !JAVA_DOWNLOAD_HOSTS
            .iter()
            .any(|allowed| host.eq_ignore_ascii_case(allowed))
    {
        return Err("Java download URL is not an approved HTTPS provider URL".to_string());
    }
    Ok(parsed)
}

fn java_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(JAVA_CONNECT_TIMEOUT)
        .timeout(JAVA_METADATA_REQUEST_TIMEOUT)
        .user_agent(user_agent())
        .redirect(redirect::Policy::custom(|attempt| {
            if validate_java_download_url(attempt.url().as_str()).is_ok() {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|error| format!("Failed to create Java download client: {error}"))
}

async fn fetch_bytes(client: &Client, url: Url, context: &str) -> Result<Vec<u8>, String> {
    let response = send_request_with_timeout(
        client.get(url).header("Accept", "application/json"),
        JAVA_RESPONSE_HEADERS_TIMEOUT,
        context,
    )
    .await?;
    if !response.status().is_success() {
        return Err(format!("{context} failed with HTTP {}", response.status()));
    }
    read_limited_response_body(response, MAX_JAVA_METADATA_BYTES, context).await
}

#[derive(Debug, Deserialize)]
struct AvailableReleases {
    #[serde(default)]
    available_lts_releases: Vec<u16>,
}

/// The LTS majors Adoptium currently offers, ascending.
pub async fn available_lts_releases() -> Result<Vec<u16>, String> {
    let client = java_client()?;
    let url = Url::parse(&format!("{ADOPTIUM_API}/info/available_releases"))
        .map_err(|error| error.to_string())?;
    tokio::time::timeout(
        RELEASES_HEADERS_TIMEOUT * 2,
        fetch_available_lts(&client, url),
    )
    .await
    .map_err(|_| "Java release list request timed out".to_string())?
}

pub(crate) async fn fetch_available_lts(client: &Client, url: Url) -> Result<Vec<u16>, String> {
    let body = fetch_bytes(client, url, "Java release list request").await?;
    let releases: AvailableReleases = serde_json::from_slice(&body)
        .map_err(|error| format!("Invalid Java release list: {error}"))?;
    let mut majors: Vec<u16> = releases
        .available_lts_releases
        .into_iter()
        .filter(|major| (1..=99).contains(major))
        .collect();
    majors.sort_unstable();
    majors.dedup();
    if majors.is_empty() {
        return Err("Java release list contains no LTS releases".into());
    }
    Ok(majors)
}

#[derive(Debug, Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
}

#[derive(Debug, Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(Debug, Deserialize)]
struct AdoptiumPackage {
    checksum: Option<String>,
    link: String,
    size: Option<u64>,
}

fn package_metadata_url(major: u16, os: &str, arch: &str) -> Result<Url, String> {
    Url::parse(&format!(
        "{ADOPTIUM_API}/assets/latest/{major}/hotspot?architecture={arch}&image_type=jdk&jvm_impl=hotspot&os={os}&project=jdk&release_type=ga"
    ))
    .map_err(|error| error.to_string())
}

/// The newest GA JDK of `major` for this machine. Packages without a published
/// SHA-256 and size are never offered.
pub async fn resolve_package(major: u16) -> Result<JavaPackage, String> {
    let (os, arch) = host_platform()?;
    let client = java_client()?;
    resolve_package_from(
        &client,
        package_metadata_url(major, os, arch)?,
        ArchiveKind::for_os(os),
    )
    .await
}

pub(crate) async fn resolve_package_from(
    client: &Client,
    metadata_url: Url,
    archive: ArchiveKind,
) -> Result<JavaPackage, String> {
    let body = fetch_bytes(
        client,
        metadata_url,
        "Failed to resolve Java artifact metadata",
    )
    .await?;
    let assets: Vec<AdoptiumAsset> = serde_json::from_slice(&body)
        .map_err(|error| format!("Invalid Java artifact metadata: {error}"))?;
    let package = assets
        .into_iter()
        .map(|asset| asset.binary.package)
        .find(|package| package.checksum.is_some() && package.size.is_some())
        .ok_or_else(|| "Java provider did not supply a SHA-256 checksum and size".to_string())?;
    let url = validate_java_download_url(&package.link)?;
    let sha256 = package
        .checksum
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Java provider supplied an invalid SHA-256 checksum".to_string());
    }
    let size = package.size.unwrap_or_default();
    if size == 0 || size > MAX_JAVA_ARCHIVE_BYTES {
        return Err("Java provider supplied an artifact size outside the allowed range".into());
    }
    Ok(JavaPackage {
        url,
        sha256,
        size,
        archive,
    })
}

/// Debug builds started by the smoke E2E (`MC_VECTOR_E2E=1`) may install a
/// loopback fixture archive instead of contacting Adoptium.
pub fn e2e_java_fixture() -> Result<Option<JavaPackage>, String> {
    if !cfg!(debug_assertions) || std::env::var("MC_VECTOR_E2E").ok().as_deref() != Some("1") {
        return Ok(None);
    }
    let Some(url) = std::env::var_os("MC_VECTOR_E2E_JAVA_ARCHIVE_URL") else {
        return Ok(None);
    };
    let url = Url::parse(
        url.to_str()
            .ok_or_else(|| "E2E Java fixture URL is not valid UTF-8".to_string())?,
    )
    .map_err(|_| "E2E Java fixture URL is invalid".to_string())?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"))
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("E2E Java fixture URL must be a loopback HTTP URL".to_string());
    }
    let sha256 = std::env::var("MC_VECTOR_E2E_JAVA_SHA256")
        .map_err(|_| "E2E Java fixture checksum is missing".to_string())?
        .trim()
        .to_ascii_lowercase();
    if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("E2E Java fixture checksum must be a SHA-256 hex digest".to_string());
    }
    let size = std::env::var("MC_VECTOR_E2E_JAVA_SIZE")
        .map_err(|_| "E2E Java fixture size is missing".to_string())?
        .parse::<u64>()
        .map_err(|_| "E2E Java fixture size is invalid".to_string())?;
    if size == 0 || size > MAX_JAVA_ARCHIVE_BYTES {
        return Err("E2E Java fixture size is outside the allowed range".to_string());
    }
    let (os, _) = host_platform()?;
    Ok(Some(JavaPackage {
        url,
        sha256,
        size,
        archive: ArchiveKind::for_os(os),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::{client, LoopbackServer, Route};

    #[test]
    fn java_download_url_is_strict() {
        assert!(validate_java_download_url("https://api.adoptium.net/v3/binary/latest/21").is_ok());
        assert!(validate_java_download_url("http://api.adoptium.net/v3/binary/latest/21").is_err());
        assert!(validate_java_download_url("https://evil.example/jdk.zip").is_err());
        assert!(validate_java_download_url("https://github.com:444/jdk.zip").is_err());
    }

    #[tokio::test]
    async fn available_lts_releases_are_read_from_a_loopback_provider() {
        let server = LoopbackServer::start(
            vec![Route::json(
                "/v3/info/available_releases",
                serde_json::json!({
                    "available_lts_releases": [25, 8, 11, 17, 21, 0],
                    "available_releases": [8, 11, 17, 21, 24, 25]
                }),
            )],
            1,
        );
        let majors = fetch_available_lts(&client(), server.url("/v3/info/available_releases"))
            .await
            .unwrap();
        assert_eq!(majors, vec![8, 11, 17, 21, 25]);
        server.finish();
    }

    #[tokio::test]
    async fn package_resolution_requires_checksum_size_and_an_approved_link() {
        let sha = "a".repeat(64);
        let server = LoopbackServer::start(
            vec![
                Route::json(
                    "/ok",
                    serde_json::json!([
                        {"binary": {"package": {"link": "https://github.com/x.tar.gz"}}},
                        {"binary": {"package": {
                            "link": "https://github.com/adoptium/jdk.tar.gz",
                            "checksum": sha.to_uppercase(),
                            "size": 1234
                        }}}
                    ]),
                ),
                Route::json(
                    "/evil",
                    serde_json::json!([{"binary": {"package": {
                        "link": "https://evil.example/jdk.tar.gz",
                        "checksum": sha,
                        "size": 1
                    }}}]),
                ),
            ],
            2,
        );
        let package = resolve_package_from(&client(), server.url("/ok"), ArchiveKind::TarGz)
            .await
            .unwrap();
        assert_eq!(package.sha256, "a".repeat(64));
        assert_eq!(package.size, 1234);
        assert_eq!(package.url.host_str(), Some("github.com"));
        assert!(
            resolve_package_from(&client(), server.url("/evil"), ArchiveKind::TarGz)
                .await
                .is_err()
        );
        server.finish();
    }

    #[test]
    fn metadata_url_names_the_platform() {
        let url = package_metadata_url(21, "mac", "aarch64").unwrap();
        assert_eq!(url.host_str(), Some("api.adoptium.net"));
        assert!(url.path().ends_with("/assets/latest/21/hotspot"));
        assert!(url.query().unwrap().contains("os=mac"));
    }
}
