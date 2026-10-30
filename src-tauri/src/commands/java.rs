use reqwest::{redirect, Client, Url};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

use super::download::{
    download_verified_artifact, read_limited_response_body, send_request_with_timeout,
};
use super::server::ServerManager;
use crate::state::operation_manager::{GlobalOperation, OperationKind, ServerOperationManager};

const MAX_JAVA_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_JAVA_ARCHIVE_ENTRIES: usize = 100_000;
const MAX_JAVA_UNCOMPRESSED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_JAVA_ENTRY_NAME_BYTES: usize = 255;
const MAX_JAVA_ENTRY_DEPTH: usize = 32;
const MAX_JAVA_COMPRESSION_RATIO: u64 = 100;
const COPY_BUFFER_SIZE: usize = 64 * 1024;
const MAX_JAVA_METADATA_BYTES: u64 = 4 * 1024 * 1024;
const JAVA_RESPONSE_HEADERS_TIMEOUT: Duration = Duration::from_secs(30);
const JAVA_METADATA_REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const JAVA_REGISTRY_STORE: &str = "config.json";
const JAVA_REGISTRY_KEY: &str = "javaVersions";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    pub version: u16,
    pub path: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_custom: Option<bool>,
}

fn validate_java_versions(versions: &[JavaVersion]) -> Result<(), String> {
    let mut seen = HashSet::with_capacity(versions.len());
    for version in versions {
        if !(1..=99).contains(&version.version) {
            return Err(format!(
                "Java registry contains unsupported major version {}",
                version.version
            ));
        }
        if version.path.trim().is_empty() || version.path.len() > 32_768 {
            return Err("Java registry contains an invalid installation path".to_string());
        }
        if version.name.trim().is_empty() || version.name.len() > 256 {
            return Err("Java registry contains an invalid display name".to_string());
        }
        if !seen.insert(version.version) {
            return Err(format!(
                "Java registry contains duplicate major version {}",
                version.version
            ));
        }
    }
    Ok(())
}

fn decode_java_versions(value: Option<serde_json::Value>) -> Result<Vec<JavaVersion>, String> {
    let value = match value {
        None | Some(serde_json::Value::Null) => return Ok(Vec::new()),
        Some(value) => value,
    };
    let versions: Vec<JavaVersion> = serde_json::from_value(value).map_err(|error| {
        format!("Java registry data is invalid; it was left untouched: {error}")
    })?;
    validate_java_versions(&versions)?;
    Ok(versions)
}

fn read_java_versions_sync(app: &AppHandle) -> Result<Vec<JavaVersion>, String> {
    let store = app
        .store(JAVA_REGISTRY_STORE)
        .map_err(|error| format!("Failed to open Java registry store: {error}"))?;
    decode_java_versions(store.get(JAVA_REGISTRY_KEY))
}

fn write_java_versions_sync(app: &AppHandle, versions: &[JavaVersion]) -> Result<(), String> {
    validate_java_versions(versions)?;
    let value = serde_json::to_value(versions)
        .map_err(|error| format!("Failed to serialize Java registry: {error}"))?;
    let store = app
        .store(JAVA_REGISTRY_STORE)
        .map_err(|error| format!("Failed to open Java registry store: {error}"))?;
    let previous = store.get(JAVA_REGISTRY_KEY);
    store.set(JAVA_REGISTRY_KEY, value);
    if let Err(error) = store.save() {
        match previous {
            Some(value) => store.set(JAVA_REGISTRY_KEY, value),
            None => {
                store.delete(JAVA_REGISTRY_KEY);
            }
        }
        return match store.save() {
            Ok(()) => Err(format!("Failed to save Java registry; previous registry restored: {error}")),
            Err(restore_error) => Err(format!(
                "Failed to save Java registry ({error}) and failed to persist its previous value ({restore_error})"
            )),
        };
    }
    Ok(())
}

async fn read_java_versions(app: AppHandle) -> Result<Vec<JavaVersion>, String> {
    tokio::task::spawn_blocking(move || read_java_versions_sync(&app))
        .await
        .map_err(|error| format!("Java registry read task failed: {error}"))?
}

async fn write_java_versions(app: AppHandle, versions: Vec<JavaVersion>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || write_java_versions_sync(&app, &versions))
        .await
        .map_err(|error| format!("Java registry write task failed: {error}"))?
}

async fn reject_mutation_of_running_runtime(
    servers: &ServerManager,
    install_dir: &Path,
) -> Result<(), String> {
    let runtime_path = match tokio::fs::canonicalize(install_dir).await {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => install_dir.to_path_buf(),
        Err(error) => {
            return Err(format!(
                "Failed to resolve Java installation before mutation: {error}"
            ));
        }
    };
    if servers.is_java_runtime_in_use(&runtime_path).await {
        return Err("Cannot modify a Java runtime used by a running server".to_string());
    }
    Ok(())
}

fn upsert_java_version(versions: &mut Vec<JavaVersion>, entry: JavaVersion) {
    if let Some(existing) = versions
        .iter_mut()
        .find(|version| version.version == entry.version)
    {
        *existing = entry;
    } else {
        versions.push(entry);
    }
}

struct DownloadTempGuard {
    path: PathBuf,
    armed: bool,
}

impl DownloadTempGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for DownloadTempGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

struct DirectoryTempGuard {
    path: PathBuf,
    armed: bool,
}

impl DirectoryTempGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for DirectoryTempGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}
const JAVA_CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const JAVA_DOWNLOAD_HOSTS: &[&str] = &[
    "api.adoptium.net",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

fn e2e_java_fixture() -> Result<Option<(Url, String, u64)>, String> {
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

    let checksum = std::env::var("MC_VECTOR_E2E_JAVA_SHA256")
        .map_err(|_| "E2E Java fixture checksum is missing".to_string())?
        .trim()
        .to_ascii_lowercase();
    if checksum.len() != 64 || !checksum.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("E2E Java fixture checksum must be a SHA-256 hex digest".to_string());
    }
    let size = std::env::var("MC_VECTOR_E2E_JAVA_SIZE")
        .map_err(|_| "E2E Java fixture size is missing".to_string())?
        .parse::<u64>()
        .map_err(|_| "E2E Java fixture size is invalid".to_string())?;
    if size == 0 || size > MAX_JAVA_ARCHIVE_BYTES {
        return Err("E2E Java fixture size is outside the allowed range".to_string());
    }

    Ok(Some((url, checksum, size)))
}

fn validate_java_download_url(url: &str) -> Result<Url, String> {
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

async fn resolve_adoptium_package(
    client: &Client,
    major_version: u16,
    os: &str,
    arch: &str,
) -> Result<(Url, String, u64), String> {
    let metadata_url = format!(
        "https://api.adoptium.net/v3/assets/latest/{major_version}/hotspot?architecture={arch}&image_type=jdk&jvm_impl=hotspot&os={os}&project=jdk&release_type=ga"
    );
    let response = send_request_with_timeout(
        client.get(&metadata_url),
        JAVA_RESPONSE_HEADERS_TIMEOUT,
        "Failed to resolve Java artifact metadata",
    )
    .await?;
    if !response.status().is_success() {
        return Err(format!(
            "Java metadata request failed with HTTP {}",
            response.status()
        ));
    }
    let body =
        read_limited_response_body(response, MAX_JAVA_METADATA_BYTES, "Java artifact metadata")
            .await?;
    let assets: Vec<AdoptiumAsset> = serde_json::from_slice(&body)
        .map_err(|error| format!("Invalid Java artifact metadata: {error}"))?;
    let package = assets
        .into_iter()
        .map(|asset| asset.binary.package)
        .find(|package| package.checksum.is_some() && package.size.is_some())
        .ok_or_else(|| "Java provider did not supply a SHA-256 checksum and size".to_string())?;
    let url = validate_java_download_url(&package.link)?;
    let checksum = package
        .checksum
        .ok_or_else(|| "Java provider did not supply a SHA-256 checksum".to_string())?;
    let size = package
        .size
        .ok_or_else(|| "Java provider did not supply an artifact size".to_string())?;
    Ok((url, checksum, size))
}

fn validate_managed_java_install_dir(
    app_data_dir: &Path,
    install_dir: &Path,
) -> Result<PathBuf, String> {
    let root = app_data_dir.join("java");
    let candidate = install_dir;
    if !candidate.is_absolute()
        || !candidate.starts_with(&root)
        || candidate == root
        || candidate
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(
            "Java install directory must be a child of the app-managed java directory".to_string(),
        );
    }
    if let Ok(metadata) = std::fs::symlink_metadata(&root) {
        if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
            return Err("Managed Java root is not a real directory".to_string());
        }
    }
    if let Ok(metadata) = std::fs::symlink_metadata(&candidate) {
        if is_link_or_reparse_point(&metadata) {
            return Err(
                "Java install directory must not be a symbolic link or reparse point".to_string(),
            );
        }
    }
    Ok(candidate.to_path_buf())
}

fn install_java_with_rollback(
    staging: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<Option<PathBuf>, String> {
    let staging = staging
        .canonicalize()
        .map_err(|error| format!("Failed to resolve staged Java installation: {error}"))?;
    let root = managed_root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve managed Java root: {error}"))?;
    if !staging.starts_with(&root) || !destination.starts_with(&root) {
        return Err("Java installation must remain inside managed storage".to_string());
    }
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                return Err("Existing Java installation is not a real directory".to_string());
            }
            let name = destination
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("java");
            let rollback =
                destination.with_file_name(format!(".{name}.rollback-{}", Uuid::new_v4()));
            std::fs::rename(destination, &rollback)
                .map_err(|error| format!("Failed to stage existing Java installation: {error}"))?;
            match std::fs::rename(&staging, destination) {
                Ok(()) => Ok(Some(rollback)),
                Err(error) => {
                    let recovery = std::fs::rename(&rollback, destination);
                    if recovery.is_ok() {
                        Err(format!(
                            "Failed to install Java and restored the existing installation: {error}"
                        ))
                    } else {
                        Err(format!(
                            "Failed to install Java and restore the existing installation; manual recovery required: {error}"
                        ))
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::rename(staging, destination)
                .map(|()| None)
                .map_err(|error| format!("Failed to install Java: {error}"))
        }
        Err(error) => Err(format!(
            "Failed to inspect existing Java installation: {error}"
        )),
    }
}

fn rollback_java_install(
    destination: &Path,
    previous_install: Option<&Path>,
) -> Result<(), String> {
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                return Err(
                    "Refusing to remove an unexpected Java installation during rollback".into(),
                );
            }
            std::fs::remove_dir_all(destination).map_err(|error| {
                format!("Failed to remove the unregistered Java installation: {error}")
            })?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Failed to inspect Java installation during rollback: {error}"
            ))
        }
    }
    if let Some(previous_install) = previous_install {
        restore_java_install_backup(previous_install, destination)?;
    }
    Ok(())
}

fn restore_java_install_backup(backup: &Path, destination: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(destination) {
        Ok(_) => return Err("Java installation path is occupied during rollback".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Failed to inspect Java rollback destination: {error}"
            ))
        }
    }
    let metadata = std::fs::symlink_metadata(backup)
        .map_err(|error| format!("Failed to inspect Java installation backup: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Java installation backup is not a real directory".into());
    }
    std::fs::rename(backup, destination)
        .map_err(|error| format!("Failed to restore the previous Java installation: {error}"))
}

fn backup_java_install_for_removal(install_dir: &Path) -> Result<PathBuf, String> {
    let metadata = std::fs::symlink_metadata(install_dir)
        .map_err(|error| format!("Failed to inspect Java installation: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Existing Java installation is not a real directory".to_string());
    }
    let name = install_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Java installation directory name is invalid".to_string())?;
    let backup = install_dir.with_file_name(format!(".{name}.delete-{}", Uuid::new_v4()));
    std::fs::rename(install_dir, &backup)
        .map_err(|error| format!("Failed to stage Java installation for deletion: {error}"))?;
    Ok(backup)
}

fn cleanup_java_backup(path: &Path) {
    if let Err(error) = std::fs::remove_dir_all(path) {
        log::warn!(
            "Failed to remove Java installation backup {:?}: {error}",
            path
        );
    }
}

/// Validates paths that the server launcher can adopt once its command boundary
/// is migrated. Managed installations must stay below `appData/java`; system
/// Java is limited to PATH's literal `java` plus known platform locations.
pub fn validate_java_executable_path(
    java_path: &str,
    managed_root: &Path,
) -> Result<PathBuf, String> {
    let value = java_path.trim();
    if matches!(value, "java" | "java.exe") {
        return Ok(PathBuf::from(value));
    }
    let managed_root_metadata = std::fs::symlink_metadata(managed_root)
        .map_err(|_| "Managed Java root is unavailable".to_string())?;
    if is_link_or_reparse_point(&managed_root_metadata) || !managed_root_metadata.is_dir() {
        return Err("Managed Java root is not a real directory".to_string());
    }
    let managed_root = managed_root
        .canonicalize()
        .map_err(|_| "Managed Java root is unavailable".to_string())?;
    let candidate = PathBuf::from(value);
    let metadata = std::fs::symlink_metadata(&candidate)
        .map_err(|_| "Invalid Java executable path".to_string())?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Java executable must not be a symbolic link or reparse point".to_string());
    }
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "Invalid Java executable path".to_string())?;
    let file_name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Invalid Java executable path".to_string())?;
    if !canonical.is_file() || !matches!(file_name.as_str(), "java" | "java.exe") {
        return Err("Java path must point to a java executable".to_string());
    }
    let trusted_system = [
        "/usr/bin/java",
        "/usr/local/bin/java",
        "/opt/homebrew/bin/java",
    ]
    .iter()
    .any(|trusted| canonical == Path::new(trusted));
    let trusted_system_root = [
        "/Library/Java/JavaVirtualMachines",
        "/usr/lib/jvm",
        "/usr/lib64/jvm",
        "C:/Program Files/Java",
        "C:/Program Files/Eclipse Adoptium",
    ]
    .iter()
    .any(|root| canonical.starts_with(Path::new(root)));
    if canonical.starts_with(&managed_root) || trusted_system || trusted_system_root {
        Ok(canonical)
    } else {
        Err("Java executable must be app-managed or a trusted system Java".to_string())
    }
}

pub fn validate_jvm_extra_args(raw: &str) -> Result<Vec<String>, String> {
    let args = raw.split_whitespace().collect::<Vec<_>>();
    if args.len() > 32 {
        return Err("Too many JVM arguments".to_string());
    }
    args.into_iter()
        .map(|arg| {
            let allowed = arg.starts_with("-D")
                || arg.starts_with("-XX:+")
                || arg.starts_with("-XX:-")
                || arg.starts_with("-XX:MaxGCPauseMillis=")
                || arg.starts_with("-XX:G1HeapRegionSize=")
                || arg.starts_with("-XX:InitiatingHeapOccupancyPercent=");
            if !allowed
                || arg.len() > 256
                || arg.contains(|character: char| {
                    character.is_control()
                        || matches!(
                            character,
                            ';' | '&' | '|' | '`' | '$' | '(' | ')' | '<' | '>'
                        )
                })
                || [
                    "-javaagent",
                    "-agentpath",
                    "-agentlib",
                    "-classpath",
                    "-cp",
                    "-Djava.library.path",
                    "-XX:OnError",
                    "-XX:OnOutOfMemoryError",
                ]
                .iter()
                .any(|prefix| arg.starts_with(prefix))
            {
                Err(format!("Unsafe JVM argument: {arg}"))
            } else {
                Ok(arg.to_string())
            }
        })
        .collect()
}

#[tauri::command]
pub async fn get_java_versions(app: AppHandle) -> Result<Vec<JavaVersion>, String> {
    read_java_versions(app).await
}

#[tauri::command]
pub async fn delete_java(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    servers: State<'_, ServerManager>,
    major_version: u16,
) -> Result<(), String> {
    let _operation = operations
        .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
        .await?;
    if !(1..=99).contains(&major_version) {
        return Err("Unsupported Java major version".to_string());
    }

    let mut versions = read_java_versions(app.clone()).await?;
    let Some(index) = versions
        .iter()
        .position(|version| version.version == major_version)
    else {
        return Ok(());
    };

    let is_custom = versions[index].is_custom == Some(true);
    let deletion = if !is_custom {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|_| "Failed to resolve app data directory".to_string())?;
        let install_dir = app_data_dir
            .join("java")
            .join(format!("jdk-{major_version}"));
        validate_managed_java_install_dir(&app_data_dir, &install_dir)?;
        reject_mutation_of_running_runtime(servers.inner(), &install_dir).await?;
        let backup = backup_java_install_for_removal(&install_dir)?;
        Some((install_dir, backup))
    } else {
        None
    };

    versions.remove(index);
    if let Err(error) = write_java_versions(app, versions).await {
        if let Some((install_dir, backup)) = deletion.as_ref() {
            return match restore_java_install_backup(backup, install_dir) {
                Ok(()) => Err(error),
                Err(rollback_error) => Err(format!(
                    "{error}; failed to restore Java installation: {rollback_error}"
                )),
            };
        }
        return Err(error);
    }
    if let Some((_, backup)) = deletion.as_ref() {
        cleanup_java_backup(backup);
    }
    Ok(())
}

#[tauri::command]
pub async fn download_java(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    servers: State<'_, ServerManager>,
    major_version: u16,
) -> Result<String, String> {
    let _operation = operations
        .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
        .await?;
    if !(1..=99).contains(&major_version) {
        return Err("Unsupported Java major version".to_string());
    }
    let mut java_versions = read_java_versions(app.clone()).await?;
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
    let archive_type = if os == "windows" { "zip" } else { "tar.gz" };
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let install_dir = app_data_dir
        .join("java")
        .join(format!("jdk-{major_version}"));
    let install_path = validate_managed_java_install_dir(&app_data_dir, &install_dir)?;
    reject_mutation_of_running_runtime(servers.inner(), &install_path).await?;
    let java_root = app_data_dir.join("java");
    tokio::fs::create_dir_all(&java_root)
        .await
        .map_err(|error| format!("Failed to create managed Java root: {error}"))?;
    let (download_url, checksum, expected_size) = if let Some(fixture) = e2e_java_fixture()? {
        fixture
    } else {
        let client = java_client()?;
        resolve_adoptium_package(&client, major_version, os, arch).await?
    };
    let managed_root = java_root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve managed Java root: {error}"))?;
    let verified = download_verified_artifact(
        download_url.as_str(),
        &java_root.join(format!("jdk-{major_version}.{archive_type}")),
        &managed_root,
        &checksum,
        Some(expected_size),
        MAX_JAVA_ARCHIVE_BYTES,
        Some(JAVA_DOWNLOAD_HOSTS),
        |downloaded, total| {
            let progress = if total > 0 {
                ((downloaded as f64 / total as f64) * 100.0) as u32
            } else {
                0
            };
            app.emit(
                "java-download-progress",
                serde_json::json!({ "progress": progress }),
            )
            .map_err(|error| format!("Failed to emit Java download progress: {error}"))
        },
    )
    .await?;
    debug_assert_eq!(verified.sha256, checksum.to_ascii_lowercase());
    debug_assert!(verified.size > 0);
    let mut archive_guard = DownloadTempGuard::new(verified.path.clone());
    let staging_dir = java_root.join(format!(".jdk-{major_version}.staging-{}", Uuid::new_v4()));
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|error| format!("Failed to create Java staging directory: {error}"))?;
    let mut staging_guard = DirectoryTempGuard::new(staging_dir.clone());

    let install = staging_dir.to_string_lossy().to_string();
    let temp = verified.path.to_string_lossy().to_string();
    let atype = archive_type.to_string();

    let extraction_result = tokio::task::spawn_blocking(move || {
        if atype == "tar.gz" {
            extract_tar_gz(&temp, &install)
        } else {
            extract_zip_archive(&temp, &install)
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let extracted_java_home = extraction_result?;
    let extracted_java_home = PathBuf::from(extracted_java_home);
    let relative_java_home = extracted_java_home
        .strip_prefix(&staging_dir)
        .map_err(|_| "Java extraction returned a path outside staging".to_string())?
        .to_path_buf();
    tokio::fs::remove_file(&verified.path)
        .await
        .map_err(|error| format!("Failed to remove verified Java archive: {error}"))?;
    archive_guard.disarm();
    let previous_install = install_java_with_rollback(&staging_dir, &install_path, &managed_root)?;
    staging_guard.disarm();
    let java_home = install_path
        .join(relative_java_home)
        .to_string_lossy()
        .to_string();
    upsert_java_version(
        &mut java_versions,
        JavaVersion {
            version: major_version,
            path: java_home.clone(),
            name: format!("Java {major_version}"),
            is_custom: None,
        },
    );
    if let Err(error) = write_java_versions(app, java_versions).await {
        return match rollback_java_install(&install_path, previous_install.as_deref()) {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error}; failed to restore the previous Java installation: {rollback_error}"
            )),
        };
    }
    if let Some(previous_install) = previous_install.as_deref() {
        cleanup_java_backup(previous_install);
    }
    Ok(java_home)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(version: u16, path: &str, is_custom: Option<bool>) -> JavaVersion {
        JavaVersion {
            version,
            path: path.to_string(),
            name: format!("Java {version}"),
            is_custom,
        }
    }

    #[test]
    fn missing_java_registry_defaults_to_empty_without_writing_a_value() {
        assert_eq!(
            decode_java_versions(None).unwrap(),
            Vec::<JavaVersion>::new()
        );
        assert_eq!(
            decode_java_versions(Some(serde_json::Value::Null)).unwrap(),
            Vec::<JavaVersion>::new()
        );
    }

    #[test]
    fn legacy_java_registry_shape_and_custom_entries_are_preserved() {
        let value = serde_json::json!([
            { "version": 21, "path": "/managed/jdk-21", "name": "Java 21" },
            { "version": 17, "path": "/custom/java", "name": "Custom 17", "isCustom": true }
        ]);
        let versions = decode_java_versions(Some(value)).unwrap();
        assert_eq!(versions[0], entry(21, "/managed/jdk-21", None));
        assert_eq!(
            versions[1],
            JavaVersion {
                version: 17,
                path: "/custom/java".into(),
                name: "Custom 17".into(),
                is_custom: Some(true),
            }
        );
        assert_eq!(
            serde_json::to_value(&versions).unwrap(),
            serde_json::json!([
                { "version": 21, "path": "/managed/jdk-21", "name": "Java 21" },
                { "version": 17, "path": "/custom/java", "name": "Custom 17", "isCustom": true }
            ])
        );
    }

    #[test]
    fn malformed_or_ambiguous_java_registry_data_is_rejected_without_normalizing_it() {
        assert!(decode_java_versions(Some(serde_json::json!({ "version": 21 }))).is_err());
        assert!(decode_java_versions(Some(serde_json::json!([
            { "version": 21, "path": "/one", "name": "One" },
            { "version": 21, "path": "/two", "name": "Two" }
        ])))
        .is_err());
        assert!(decode_java_versions(Some(serde_json::json!([
            { "version": 0, "path": "/invalid", "name": "Invalid" }
        ])))
        .is_err());
    }

    #[test]
    fn download_upsert_replaces_same_major_without_dropping_other_entries() {
        let mut versions = vec![
            entry(8, "/java-8", None),
            entry(21, "/custom-java-21", Some(true)),
        ];
        upsert_java_version(&mut versions, entry(21, "/managed-java-21", None));
        upsert_java_version(&mut versions, entry(17, "/managed-java-17", None));

        assert_eq!(versions.len(), 3);
        assert_eq!(versions[0], entry(8, "/java-8", None));
        assert_eq!(versions[1], entry(21, "/managed-java-21", None));
        assert_eq!(versions[2], entry(17, "/managed-java-17", None));
    }

    #[test]
    fn staged_java_install_can_rollback_to_the_previous_directory() {
        let root = std::fs::canonicalize("target").expect("cargo should provide target");
        let install_root = root.join("mc-vector-java-transaction").join(format!(
            "{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        let managed_root = install_root.join("java");
        let install_dir = managed_root.join("jdk-21");
        let staging_dir = managed_root.join(".jdk-21.staging");
        std::fs::create_dir_all(&install_dir).expect("existing installation should be created");
        std::fs::create_dir_all(&staging_dir).expect("staging installation should be created");
        std::fs::write(install_dir.join("release"), "old").expect("old install should be seeded");
        std::fs::write(staging_dir.join("release"), "new").expect("new install should be seeded");

        let backup = install_java_with_rollback(&staging_dir, &install_dir, &managed_root)
            .expect("staged install should replace current install");
        assert_eq!(
            std::fs::read_to_string(install_dir.join("release")).unwrap(),
            "new"
        );
        assert_eq!(
            std::fs::read_to_string(backup.as_ref().unwrap().join("release")).unwrap(),
            "old"
        );

        rollback_java_install(&install_dir, backup.as_deref())
            .expect("failed registry save should restore prior installation");
        assert_eq!(
            std::fs::read_to_string(install_dir.join("release")).unwrap(),
            "old"
        );
        assert!(!backup.unwrap().exists());
        std::fs::remove_dir_all(install_root).expect("transaction fixture should be cleaned");
    }

    #[test]
    fn java_delete_backup_can_be_restored_before_registry_commit() {
        let root = std::fs::canonicalize("target").expect("cargo should provide target");
        let install_root = root.join("mc-vector-java-delete-transaction").join(format!(
            "{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        let install_dir = install_root.join("java").join("jdk-17");
        std::fs::create_dir_all(&install_dir).expect("existing installation should be created");
        std::fs::write(install_dir.join("release"), "old").expect("old install should be seeded");

        let backup = backup_java_install_for_removal(&install_dir)
            .expect("deletion should first move the installation to backup");
        assert!(!install_dir.exists());
        assert_eq!(
            std::fs::read_to_string(backup.join("release")).unwrap(),
            "old"
        );

        restore_java_install_backup(&backup, &install_dir)
            .expect("failed registry save should restore the installation");
        assert_eq!(
            std::fs::read_to_string(install_dir.join("release")).unwrap(),
            "old"
        );
        assert!(!backup.exists());
        std::fs::remove_dir_all(install_root).expect("transaction fixture should be cleaned");
    }

    #[test]
    fn java_download_url_is_strict() {
        assert!(validate_java_download_url("https://api.adoptium.net/v3/binary/latest/21").is_ok());
        assert!(validate_java_download_url("http://api.adoptium.net/v3/binary/latest/21").is_err());
        assert!(validate_java_download_url("https://evil.example/jdk.zip").is_err());
    }
    #[test]
    fn install_dir_and_jvm_args_are_scoped() {
        let test_root = std::fs::canonicalize("target").expect("cargo should provide target");
        let root = test_root
            .join("mc-vector-java-root")
            .join(std::process::id().to_string());
        let managed_install_dir = root.join("java").join("jdk-21");
        let outside_install_dir = std::fs::canonicalize("target")
            .expect("cargo should provide target")
            .join("mc-vector-java-outside")
            .join(std::process::id().to_string());

        assert!(validate_managed_java_install_dir(&root, &managed_install_dir).is_ok());
        assert!(validate_managed_java_install_dir(&root, &outside_install_dir).is_err());
        assert!(validate_jvm_extra_args("-Dfile.encoding=UTF-8 -XX:+UseG1GC").is_ok());
        for arg in ["-javaagent:evil.jar", "-cp evil.jar", "-XX:OnError=cmd"] {
            assert!(validate_jvm_extra_args(arg).is_err(), "{arg}");
        }
    }

    #[test]
    fn archive_parent_directories_are_allowed_but_file_collisions_are_rejected() {
        let mut entries = HashMap::new();
        entries.insert(PathBuf::from("temurin-e2e"), true);
        entries.insert(PathBuf::from("temurin-e2e/Contents"), true);

        assert!(!archive_entry_conflicts(
            &entries,
            Path::new("temurin-e2e/Contents/Home/bin/java"),
            false,
        ));

        entries.insert(PathBuf::from("temurin-e2e/file"), false);
        assert!(archive_entry_conflicts(
            &entries,
            Path::new("temurin-e2e/file/child"),
            false,
        ));
        assert!(archive_entry_conflicts(
            &entries,
            Path::new("temurin-e2e/file"),
            false,
        ));
    }

    #[cfg(unix)]
    #[test]
    fn archive_execute_bits_are_restored_without_special_permissions() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};

        assert_eq!(safe_java_file_mode(0o7600, 0o7777), 0o711);

        let path = std::env::temp_dir().join(format!(
            "mc-vector-java-permissions-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        std::fs::write(&path, "java binary").expect("permission fixture should be written");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o7600))
            .expect("base permissions should be set");

        restore_java_execute_bits(&path, 0o7777).expect("safe execute bits should be restored");

        let mode = std::fs::metadata(&path).unwrap().mode() & 0o7777;
        assert_eq!(
            mode, 0o711,
            "setuid, setgid, and sticky bits must be removed"
        );
        std::fs::remove_file(path).expect("permission fixture should be removed");
    }
}

fn is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return metadata.file_attributes() & 0x0400 != 0;
    }
    #[cfg(not(windows))]
    false
}

fn safe_archive_entry_name(name: &str) -> Result<PathBuf, String> {
    let normalized = name.trim_end_matches('/');
    if normalized.is_empty()
        || normalized.len() > MAX_JAVA_ENTRY_NAME_BYTES
        || normalized.contains('\\')
        || normalized.contains('\0')
        || normalized.contains(':')
    {
        return Err("Java archive contains an unsafe entry name".to_string());
    }
    let path = Path::new(normalized);
    let mut depth = 0;
    for component in path.components() {
        let Component::Normal(component) = component else {
            return Err("Java archive entry must be a strict relative path".to_string());
        };
        if component.to_string_lossy().len() > MAX_JAVA_ENTRY_NAME_BYTES {
            return Err("Java archive entry component is too long".to_string());
        }
        depth += 1;
    }
    if depth == 0 || depth > MAX_JAVA_ENTRY_DEPTH {
        return Err("Java archive entry depth exceeds the limit".to_string());
    }
    Ok(path.to_path_buf())
}

fn ensure_java_directory(root: &Path, relative: Option<&Path>) -> Result<PathBuf, String> {
    let root_metadata = std::fs::symlink_metadata(root)
        .map_err(|error| format!("Failed to inspect Java destination: {error}"))?;
    if is_link_or_reparse_point(&root_metadata) || !root_metadata.is_dir() {
        return Err("Java destination root must be a real directory".to_string());
    }
    let mut current = root.to_path_buf();
    if let Some(relative) = relative {
        for component in relative.components() {
            let Component::Normal(component) = component else {
                return Err("Java destination path is not relative".to_string());
            };
            current.push(component);
            match std::fs::symlink_metadata(&current) {
                Ok(metadata) if is_link_or_reparse_point(&metadata) => {
                    return Err(
                        "Java destination contains a symbolic link or reparse point".to_string()
                    );
                }
                Ok(metadata) if !metadata.is_dir() => {
                    return Err("Java destination component is not a directory".to_string());
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    std::fs::create_dir(&current)
                        .map_err(|error| format!("Failed to create Java destination: {error}"))?;
                }
                Err(error) => return Err(format!("Failed to inspect Java destination: {error}")),
            }
        }
    }
    Ok(current)
}

fn archive_ratio_exceeded(uncompressed: u64, compressed: u64) -> bool {
    uncompressed > 0
        && (compressed == 0 || uncompressed > compressed.saturating_mul(MAX_JAVA_COMPRESSION_RATIO))
}

fn archive_entry_conflicts(
    entries: &HashMap<PathBuf, bool>,
    relative: &Path,
    is_directory: bool,
) -> bool {
    entries.iter().any(|(existing, existing_is_directory)| {
        if relative == existing {
            return true;
        }
        if relative.starts_with(existing) {
            return !existing_is_directory;
        }
        if existing.starts_with(relative) {
            return !is_directory;
        }
        false
    })
}

fn copy_java_entry<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    expected_size: u64,
    total: &mut u64,
) -> Result<u64, String> {
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    let mut copied = 0_u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read Java archive entry: {error}"))?;
        if read == 0 {
            break;
        }
        let read = read as u64;
        copied = copied
            .checked_add(read)
            .ok_or_else(|| "Java archive entry size overflow".to_string())?;
        *total = total
            .checked_add(read)
            .ok_or_else(|| "Java archive size overflow".to_string())?;
        if copied > expected_size || *total > MAX_JAVA_UNCOMPRESSED_BYTES {
            return Err("Java archive exceeds the uncompressed size limit".to_string());
        }
        writer
            .write_all(&buffer[..read as usize])
            .map_err(|error| format!("Failed to extract Java archive entry: {error}"))?;
    }
    if copied != expected_size {
        return Err("Java archive entry size changed while extracting".to_string());
    }
    Ok(copied)
}

#[cfg(unix)]
fn restore_java_execute_bits(path: &Path, archive_mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Failed to inspect extracted Java file: {error}"))?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(safe_java_file_mode(permissions.mode(), archive_mode));
    std::fs::set_permissions(path, permissions)
        .map_err(|error| format!("Failed to restore Java executable permissions: {error}"))
}

#[cfg(unix)]
fn safe_java_file_mode(existing_mode: u32, archive_mode: u32) -> u32 {
    (existing_mode & 0o777) | (archive_mode & 0o111)
}

#[cfg(not(unix))]
fn restore_java_execute_bits(_path: &Path, _archive_mode: u32) -> Result<(), String> {
    Ok(())
}

fn extract_tar_gz(archive_path: &str, dest_dir: &str) -> Result<String, String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let compressed_size = std::fs::metadata(archive_path)
        .map_err(|error| format!("Failed to inspect Java archive: {error}"))?
        .len();
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let gz = GzDecoder::new(file);
    let mut archive = Archive::new(gz);
    let destination = Path::new(dest_dir);
    let mut total = 0_u64;
    let mut entries = 0_usize;
    let mut paths = HashMap::new();

    for entry in archive
        .entries()
        .map_err(|error| format!("Failed to read tar archive: {error}"))?
    {
        let mut entry = entry.map_err(|error| format!("Failed to read tar entry: {error}"))?;
        entries += 1;
        if entries > MAX_JAVA_ARCHIVE_ENTRIES {
            return Err("Java archive entry count exceeds the limit".to_string());
        }
        let raw_path = entry
            .path()
            .map_err(|error| format!("Failed to read tar entry path: {error}"))?;
        let relative = safe_archive_entry_name(&raw_path.to_string_lossy())?;
        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            return Err("Java archive links are not allowed".to_string());
        }
        let is_directory = entry_type.is_dir();
        if archive_entry_conflicts(&paths, &relative, is_directory) {
            return Err("Java archive contains duplicate or colliding entries".to_string());
        }
        paths.insert(relative.clone(), is_directory);
        if entry_type.is_dir() {
            ensure_java_directory(destination, Some(&relative))?;
            continue;
        }
        if !entry_type.is_file() {
            return Err("Java archive contains an unsupported entry type".to_string());
        }
        let archive_mode = entry
            .header()
            .mode()
            .map_err(|error| format!("Failed to read Java archive file permissions: {error}"))?;
        let parent = ensure_java_directory(destination, relative.parent())?;
        let output = parent.join(
            relative
                .file_name()
                .ok_or_else(|| "Java archive entry has no file name".to_string())?,
        );
        if let Ok(metadata) = std::fs::symlink_metadata(&output) {
            if is_link_or_reparse_point(&metadata) || metadata.is_dir() {
                return Err("Java archive destination collides with an unsafe entry".to_string());
            }
        }
        let mut output_file = std::fs::File::create(&output)
            .map_err(|error| format!("Failed to create Java file: {error}"))?;
        let expected_size = entry.size();
        copy_java_entry(&mut entry, &mut output_file, expected_size, &mut total)?;
        restore_java_execute_bits(&output, archive_mode)?;
    }
    if archive_ratio_exceeded(total, compressed_size) {
        return Err("Java archive compression ratio exceeds the limit".to_string());
    }
    find_java_home(dest_dir)
}

fn extract_zip_archive(archive_path: &str, dest_dir: &str) -> Result<String, String> {
    let compressed_size = std::fs::metadata(archive_path)
        .map_err(|error| format!("Failed to inspect Java archive: {error}"))?
        .len();
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;
    if archive.len() > MAX_JAVA_ARCHIVE_ENTRIES {
        return Err("Java archive entry count exceeds the limit".to_string());
    }

    let mut totals = 0_u64;
    let mut paths = HashMap::with_capacity(archive.len());
    let mut safe_entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Zip entry error: {error}"))?;
        let entry_name = file
            .name()
            .map_err(|error| format!("Zip entry name error: {error}"))?;
        let relative = safe_archive_entry_name(&entry_name)?;
        if file.is_symlink() {
            return Err("Java archive contains a link or colliding entry".to_string());
        }
        let is_directory = file.is_dir();
        if archive_entry_conflicts(&paths, &relative, is_directory) {
            return Err("Java archive contains a link or colliding entry".to_string());
        }
        paths.insert(relative.clone(), is_directory);
        totals = totals
            .checked_add(file.size())
            .ok_or_else(|| "Java archive size overflow".to_string())?;
        if totals > MAX_JAVA_UNCOMPRESSED_BYTES {
            return Err("Java archive exceeds the uncompressed size limit".to_string());
        }
        safe_entries.push(relative);
    }
    if archive_ratio_exceeded(totals, compressed_size) {
        return Err("Java archive compression ratio exceeds the limit".to_string());
    }

    let destination = Path::new(dest_dir);
    let mut actual_total = 0_u64;
    for (index, relative) in safe_entries.into_iter().enumerate() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Zip entry error: {error}"))?;
        if entry.is_dir() {
            ensure_java_directory(destination, Some(&relative))?;
            continue;
        }
        let archive_mode = entry.unix_mode().unwrap_or(0);
        let parent = ensure_java_directory(destination, relative.parent())?;
        let output = parent.join(
            relative
                .file_name()
                .ok_or_else(|| "Java archive entry has no file name".to_string())?,
        );
        if let Ok(metadata) = std::fs::symlink_metadata(&output) {
            if is_link_or_reparse_point(&metadata) || metadata.is_dir() {
                return Err("Java archive destination collides with an unsafe entry".to_string());
            }
        }
        let mut output_file = std::fs::File::create(&output)
            .map_err(|error| format!("Failed to create Java file: {error}"))?;
        let expected_size = entry.size();
        copy_java_entry(
            &mut entry,
            &mut output_file,
            expected_size,
            &mut actual_total,
        )?;
        restore_java_execute_bits(&output, archive_mode)?;
    }

    find_java_home(dest_dir)
}

fn find_java_home(dir: &str) -> Result<String, String> {
    let path = Path::new(dir);
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("jdk") || name.contains("java") || name.contains("temurin") {
                    let contents_home = entry_path.join("Contents").join("Home");
                    if contents_home.exists() {
                        return Ok(contents_home.to_string_lossy().to_string());
                    }
                    return Ok(entry_path.to_string_lossy().to_string());
                }
            }
        }
    }
    Ok(dir.to_string())
}
