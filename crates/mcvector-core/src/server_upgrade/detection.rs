use std::fs::{self, File};
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use serde_json::Value;
use zip::ZipArchive;

use super::{load_server, normalized_server_id, UpgradeError, UpgradeErrorKind};
use crate::managed_path::{
    is_link_or_reparse_point, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};
use crate::operations::{OperationGuard, OperationKind, ServerOperationManager};
use crate::registry::{MinecraftServer, ServerRegistry};
use crate::server_jar::MAX_JAR_BYTES;

const MAX_METADATA_BYTES: u64 = 64 * 1024;
const MAX_ARCHIVE_READ_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VersionStatus {
    pub registered_version: String,
    pub detected_version: Option<String>,
    pub mismatch: bool,
}

/// Reads version metadata from a registered server's launcher archive.
pub fn detected_version(server: &MinecraftServer) -> Option<String> {
    detect_at(&Path::new(&server.path).join("server.jar"))
}

pub(super) fn detect_at(path: &Path) -> Option<String> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() || metadata.len() > MAX_JAR_BYTES
    {
        return None;
    }
    let file = File::open(path).ok()?;
    let mut jar = ZipArchive::new(ReadBudget {
        reader: BufReader::new(file),
        remaining: MAX_ARCHIVE_READ_BYTES,
    })
    .ok()?;
    if let Some(version) = read_entry(&mut jar, "version.json")
        .and_then(|json| serde_json::from_str::<Value>(&json).ok())
        .and_then(|json| {
            ["inheritsFrom", "id", "name"]
                .into_iter()
                .filter_map(|field| json[field].as_str())
                .find_map(valid_version)
        })
    {
        return Some(version);
    }
    if let Some(list) = read_entry(&mut jar, "META-INF/versions.list") {
        let mut lines = list.lines().filter(|line| !line.trim().is_empty());
        if let Some(line) = lines.next().filter(|_| lines.next().is_none()) {
            if let Some((_, entry)) = line.split_once('\t') {
                if let Some((id, _path)) = entry.split_once('\t') {
                    if let Some(version) = valid_version(id) {
                        return Some(version);
                    }
                }
            }
        }
    }
    // Mod loaders can ship a launcher without any Minecraft version metadata.
    read_entry(&mut jar, "install_profile.json")
        .and_then(|json| serde_json::from_str::<Value>(&json).ok())
        .and_then(|json| valid_version(json["minecraft"].as_str()?))
        .or_else(|| {
            read_entry(&mut jar, "META-INF/MANIFEST.MF")?
                .lines()
                .take_while(|line| !line.is_empty())
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    key.eq_ignore_ascii_case("Minecraft-Version")
                        .then(|| valid_version(value.trim()))
                        .flatten()
                })
        })
}

fn valid_version(value: &str) -> Option<String> {
    let value = value.trim();
    (value.len() <= 128
        && value
            .bytes()
            .next()
            .is_some_and(|byte| byte.is_ascii_digit())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_')))
    .then(|| value.to_owned())
}

fn read_entry(jar: &mut ZipArchive<ReadBudget>, name: &str) -> Option<String> {
    let entry = jar.by_name(name).ok()?;
    if !entry.is_file() || entry.size().max(entry.compressed_size()) > MAX_METADATA_BYTES {
        return None;
    }
    let mut text = String::new();
    let read = entry
        .take(MAX_METADATA_BYTES + 1)
        .read_to_string(&mut text)
        .ok()?;
    (read as u64 <= MAX_METADATA_BYTES).then_some(text)
}

struct ReadBudget {
    reader: BufReader<File>,
    remaining: u64,
}

impl Read for ReadBudget {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let limit = buf.len().min(self.remaining as usize);
        if limit == 0 && !buf.is_empty() {
            return Err(std::io::Error::other(
                "Server jar metadata read budget exceeded",
            ));
        }
        let read = self.reader.read(&mut buf[..limit])?;
        self.remaining -= read as u64;
        Ok(read)
    }
}

impl Seek for ReadBudget {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        self.reader.seek(pos)
    }
}

pub async fn version_status(
    data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
) -> Result<VersionStatus, UpgradeError> {
    version_status_inner(data_dir, registry, &normalized_server_id(server_id)?, None).await
}

pub async fn sync_version_from_jar(
    data_dir: &Path,
    registry: &ServerRegistry,
    operations: &ServerOperationManager,
    server_id: &str,
) -> Result<VersionStatus, UpgradeError> {
    let server_id = normalized_server_id(server_id)?;
    let operation = operations
        .acquire(&server_id, OperationKind::ArtifactInstall)
        .await
        .map_err(|error| UpgradeError::new(UpgradeErrorKind::InvalidRequest, error))?;
    version_status_inner(data_dir, registry, &server_id, Some(operation)).await
}

async fn version_status_inner(
    data_dir: &Path,
    registry: &ServerRegistry,
    server_id: &str,
    operation: Option<OperationGuard>,
) -> Result<VersionStatus, UpgradeError> {
    let mut server = load_server(registry, server_id).await?;
    let registry = registry.clone();
    let data_dir = data_dir.to_owned();
    tokio::task::spawn_blocking(move || {
        let sync = operation.is_some();
        let _operation = operation;
        let detected_version = detect_managed(&data_dir, &server.id);
        if let Some(version) = detected_version
            .as_ref()
            .filter(|version| sync && **version != server.version)
        {
            server.version.clone_from(version);
            if !registry
                .update_server(&server)
                .map_err(|error| UpgradeError::new(UpgradeErrorKind::Registry, error))?
            {
                return Err(UpgradeError::new(
                    UpgradeErrorKind::NotFound,
                    "Server disappeared during version sync",
                ));
            }
        }
        Ok(VersionStatus {
            mismatch: detected_version
                .as_ref()
                .is_some_and(|version| version != &server.version),
            registered_version: server.version,
            detected_version,
        })
    })
    .await
    .map_err(|error| UpgradeError::new(UpgradeErrorKind::Registry, error.to_string()))?
}

pub(super) fn detect_managed(data_dir: &Path, server_id: &str) -> Option<String> {
    let path = resolve_managed_request(
        data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_owned()),
            relative_path: "server.jar".to_owned(),
        },
        false,
    )
    .ok()?;
    detect_at(&path)
}
