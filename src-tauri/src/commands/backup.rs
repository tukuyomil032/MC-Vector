use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use super::file_utils::{
    managed_operation_scope, resolve_managed_request, ManagedPathRequest, ManagedRoot,
};
use super::server::{
    start_registered_server_with_guard, stop_server_with_guard_recovery, validate_server_id,
    CommandLimiter, ServerManager, StopErrorRecoveryState, StopServerError,
};
use super::server_registry::ServerRegistry;
use crate::state::operation_manager::{OperationGuard, OperationKind, ServerOperationManager};

const MAX_ARCHIVE_ENTRIES: u64 = 100_000;
const MAX_ARCHIVE_COMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_ENTRY_COMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_UNCOMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ENTRY_NAME_BYTES: u64 = 255;
const MAX_PATH_COMPONENT_BYTES: u64 = 255;
const MAX_PATH_DEPTH: u64 = 32;
const MAX_COMPRESSION_RATIO: u64 = 100;
const COPY_BUFFER_SIZE: usize = 64 * 1024;
pub(crate) const AUTOMATIC_BACKUP_CANCELLED_ERROR: &str = "automatic-backup-cancelled";

#[derive(Clone, Copy, Debug)]
struct ArchivePolicy {
    max_entries: u64,
    max_archive_compressed_bytes: u64,
    max_archive_uncompressed_bytes: u64,
    max_entry_compressed_bytes: u64,
    max_entry_uncompressed_bytes: u64,
    max_entry_name_bytes: u64,
    max_path_component_bytes: u64,
    max_path_depth: u64,
    max_compression_ratio: u64,
}

const ARCHIVE_POLICY: ArchivePolicy = ArchivePolicy {
    max_entries: MAX_ARCHIVE_ENTRIES,
    max_archive_compressed_bytes: MAX_ARCHIVE_COMPRESSED_BYTES,
    max_archive_uncompressed_bytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
    max_entry_compressed_bytes: MAX_ENTRY_COMPRESSED_BYTES,
    max_entry_uncompressed_bytes: MAX_ENTRY_UNCOMPRESSED_BYTES,
    max_entry_name_bytes: MAX_ENTRY_NAME_BYTES,
    max_path_component_bytes: MAX_PATH_COMPONENT_BYTES,
    max_path_depth: MAX_PATH_DEPTH,
    max_compression_ratio: MAX_COMPRESSION_RATIO,
};

#[derive(Default, Debug)]
struct ResourceTotals {
    entries: u64,
    compressed_bytes: u64,
    uncompressed_bytes: u64,
}

fn is_link_or_reparse_point(metadata: &fs::Metadata) -> bool {
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

#[derive(serde::Serialize, Clone)]
struct BackupProgress {
    #[serde(rename = "serverId")]
    server_id: String,
    progress: f32,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format_version: u32,
    backup_id: String,
    server_id: String,
    kind: String,
    consistency: String,
    origin: String,
    created_at: String,
    root_fingerprint: String,
    file_count: u64,
    total_bytes: u64,
    entries: Vec<BackupManifestEntry>,
    /// How long the archive took to build, in milliseconds. Archives written before this field existed have none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifestEntry {
    path: String,
    kind: String,
    size: u64,
    sha256: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub backup_id: String,
    pub server_id: String,
    pub archive_path: String,
    pub kind: String,
    pub consistency: String,
    pub origin: String,
    pub created_at: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub archive_sha256: String,
    pub manifest_version: u32,
    pub restore_eligible: bool,
    /// How long the archive took to build, in milliseconds. Records from before durations were kept have none.
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRetentionReport {
    pub deleted_names: Vec<String>,
    pub failed_delete_count: u32,
    pub records: Vec<BackupRecord>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ManagedBackupOutcome {
    ConfirmationRequired,
    Created {
        #[serde(rename = "backupName")]
        backup_name: String,
        #[serde(rename = "catalogError")]
        catalog_error: Option<String>,
        restart: BackupRestartOutcome,
    },
    Failed {
        stage: BackupFailureStage,
        error: String,
        #[serde(rename = "restartError")]
        restart_error: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BackupRestartOutcome {
    NotNeeded,
    Restarted,
    Failed { error: String },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupFailureStage {
    Stop,
    Backup,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedBackupArchive {
    pub(crate) backup_name: String,
    pub(crate) catalog_error: Option<String>,
}

fn managed_backup_archive_from_catalog_result(
    backup_name: String,
    catalog_result: Result<(), String>,
) -> ManagedBackupArchive {
    ManagedBackupArchive {
        backup_name,
        catalog_error: catalog_result.err(),
    }
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupCatalogFile {
    format_version: u32,
    server_id: String,
    records: Vec<BackupRecord>,
}

struct HashingWriter<'a, W> {
    inner: &'a mut W,
    hasher: Sha256,
}

impl<'a, W: Write> HashingWriter<'a, W> {
    fn new(inner: &'a mut W) -> Self {
        Self {
            inner,
            hasher: Sha256::new(),
        }
    }

    fn finalize(self) -> String {
        hex_encode(&self.hasher.finalize())
    }
}

impl<W: Write> Write for HashingWriter<'_, W> {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        let written = self.inner.write(buffer)?;
        self.hasher.update(&buffer[..written]);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

async fn wait_for_backup_cancellation(cancellation: Arc<AtomicBool>) {
    while !cancellation.load(Ordering::SeqCst) {
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
}

pub(crate) async fn acquire_backup_operation(
    operations: &ServerOperationManager,
    server_id: &str,
    kind: OperationKind,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<OperationGuard, String> {
    let Some(cancellation) = cancellation else {
        return operations.acquire(server_id, kind).await;
    };
    if cancellation.load(Ordering::SeqCst) {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    tokio::select! {
        result = operations.acquire(server_id, kind) => result,
        _ = wait_for_backup_cancellation(cancellation) => {
            Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string())
        }
    }
}

fn timestamp_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

/// Whole milliseconds since `started`, saturating instead of overflowing.
fn elapsed_millis_since(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn archive_hash(path: &Path) -> Result<String, String> {
    hash_file(path)
}

fn backup_record_from_manifest(
    manifest: BackupManifest,
    archive_path: &Path,
    archive_sha256: String,
) -> Result<BackupRecord, String> {
    let archive_name = archive_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Backup archive has no valid file name".to_string())?;
    Ok(BackupRecord {
        backup_id: manifest.backup_id,
        server_id: manifest.server_id,
        archive_path: archive_name.to_string(),
        kind: manifest.kind,
        consistency: manifest.consistency.clone(),
        origin: manifest.origin,
        created_at: manifest.created_at,
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
        archive_sha256,
        manifest_version: manifest.format_version,
        restore_eligible: manifest.consistency == "quiesced",
        duration_ms: manifest.duration_ms,
    })
}

fn manifest_fingerprint(entries: &[BackupManifestEntry]) -> Result<String, String> {
    let encoded = serde_json::to_vec(entries)
        .map_err(|error| format!("Failed to serialize manifest entries: {error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(encoded);
    Ok(hex_encode(hasher.finalize()))
}

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TempFileGuard {
    path: PathBuf,
    armed: bool,
}

impl TempFileGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

struct LimitedWriter<W> {
    inner: W,
    written: u64,
    limit: u64,
}

impl<W> LimitedWriter<W> {
    fn new(inner: W, limit: u64) -> Self {
        Self {
            inner,
            written: 0,
            limit,
        }
    }

    fn into_inner(self) -> W {
        self.inner
    }
}

impl<W: Write> Write for LimitedWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let requested = u64::try_from(buf.len()).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidInput, "write buffer length overflow")
        })?;
        if requested > self.limit.saturating_sub(self.written) {
            return Err(limit_error("archive compressed size limit exceeded"));
        }
        let written = self.inner.write(buf)?;
        self.written = self
            .written
            .checked_add(
                u64::try_from(written).map_err(|_| {
                    io::Error::new(io::ErrorKind::Other, "written byte count overflow")
                })?,
            )
            .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "written byte count overflow"))?;
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

impl<W: Seek> Seek for LimitedWriter<W> {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        self.inner.seek(position)
    }
}

fn limit_error(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message)
}

fn validate_archive_entry_name(name: &str, policy: ArchivePolicy) -> Result<PathBuf, String> {
    let name_bytes = u64::try_from(name.len()).map_err(|_| "Archive entry name is too long")?;
    if name_bytes == 0 || name_bytes > policy.max_entry_name_bytes {
        return Err("Archive entry name length exceeds the configured limit".to_string());
    }
    if name.contains('\0') {
        return Err("Archive entry contains a NUL byte".to_string());
    }
    if name.contains('\\') {
        return Err("Archive entry contains a backslash separator".to_string());
    }
    if name.starts_with('/') || name.starts_with("//") {
        return Err("Absolute archive entry paths are not allowed".to_string());
    }
    if name.contains(':') {
        return Err("Archive entry contains a drive or stream separator".to_string());
    }
    for component in name.split('/') {
        let component_bytes = component.as_bytes();
        if component_bytes.len() == 2
            && component_bytes[1] == b':'
            && component_bytes[0].is_ascii_alphabetic()
        {
            return Err("Drive-qualified archive entry paths are not allowed".to_string());
        }
    }

    let components: Vec<&str> = name.split('/').collect();
    let mut depth = 0_u64;
    for (index, component) in components.iter().enumerate() {
        let is_trailing_separator = index + 1 == components.len() && component.is_empty();
        if is_trailing_separator {
            continue;
        }
        if component.is_empty() || *component == "." || *component == ".." {
            return Err("Archive entry contains an unsafe path component".to_string());
        }
        let component_bytes = u64::try_from(component.len())
            .map_err(|_| "Archive entry component name is too long")?;
        if component_bytes > policy.max_path_component_bytes {
            return Err("Archive entry component name exceeds the configured limit".to_string());
        }
        depth = depth
            .checked_add(1)
            .ok_or_else(|| "Archive entry path depth overflow".to_string())?;
    }
    if depth == 0 || depth > policy.max_path_depth {
        return Err("Archive entry path depth exceeds the configured limit".to_string());
    }

    let path = Path::new(name);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::Prefix(_)
                    | Component::RootDir
                    | Component::ParentDir
                    | Component::CurDir
            )
        })
    {
        return Err("Archive entry path is not a strict relative path".to_string());
    }
    Ok(path.to_path_buf())
}

fn validate_output_file_name(name: &str, policy: ArchivePolicy) -> Result<PathBuf, String> {
    let path = validate_archive_entry_name(name, policy)?;
    if path.components().count() != 1 {
        return Err("Output file name must not contain a directory".to_string());
    }
    if name
        .chars()
        .any(|character| matches!(character, '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err("Output file name contains a Windows-invalid character".to_string());
    }
    Ok(path)
}

fn exceeds_compression_ratio(uncompressed: u64, compressed: u64, ratio: u64) -> bool {
    uncompressed > 0 && (compressed == 0 || uncompressed > compressed.saturating_mul(ratio))
}

fn validate_entry_limits(
    name: &str,
    is_symlink: bool,
    compressed: u64,
    uncompressed: u64,
    totals: &mut ResourceTotals,
    policy: ArchivePolicy,
) -> Result<PathBuf, String> {
    let safe_name = validate_archive_entry_name(name, policy)?;
    if is_symlink {
        return Err(format!("Symlink archive entry is not allowed: {name}"));
    }
    if compressed > policy.max_entry_compressed_bytes {
        return Err(format!("Compressed archive entry is too large: {name}"));
    }
    if uncompressed > policy.max_entry_uncompressed_bytes {
        return Err(format!("Uncompressed archive entry is too large: {name}"));
    }
    if exceeds_compression_ratio(uncompressed, compressed, policy.max_compression_ratio) {
        return Err(format!(
            "Archive entry compression ratio is too high: {name}"
        ));
    }
    totals.entries = totals
        .entries
        .checked_add(1)
        .ok_or_else(|| "Archive entry count overflow".to_string())?;
    if totals.entries > policy.max_entries {
        return Err("Archive entry count exceeds the configured limit".to_string());
    }
    totals.compressed_bytes = totals
        .compressed_bytes
        .checked_add(compressed)
        .ok_or_else(|| "Compressed archive size overflow".to_string())?;
    if totals.compressed_bytes > policy.max_archive_compressed_bytes {
        return Err("Compressed archive size exceeds the configured limit".to_string());
    }
    totals.uncompressed_bytes = totals
        .uncompressed_bytes
        .checked_add(uncompressed)
        .ok_or_else(|| "Uncompressed archive size overflow".to_string())?;
    if totals.uncompressed_bytes > policy.max_archive_uncompressed_bytes {
        return Err("Uncompressed archive size exceeds the configured limit".to_string());
    }
    if exceeds_compression_ratio(
        totals.uncompressed_bytes,
        totals.compressed_bytes,
        policy.max_compression_ratio,
    ) {
        return Err("Archive compression ratio exceeds the configured limit".to_string());
    }
    Ok(safe_name)
}

fn validate_zip_entry<R: Read + ?Sized>(
    file: &zip::read::ZipFile<'_, R>,
    totals: &mut ResourceTotals,
    policy: ArchivePolicy,
) -> Result<PathBuf, String> {
    let entry_name = file
        .name()
        .map_err(|error| format!("Failed to read zip entry name: {error}"))?;
    let validated_name = validate_entry_limits(
        &entry_name,
        file.is_symlink(),
        file.compressed_size(),
        file.size(),
        totals,
        policy,
    )?;
    let enclosed_name = file
        .enclosed_name()
        .ok_or_else(|| "Archive entry is not enclosed by the extraction root".to_string())?;
    if validated_name != enclosed_name {
        return Err("Archive entry path normalization changed its meaning".to_string());
    }
    Ok(enclosed_name)
}

fn copy_limited<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    entry_limit: u64,
    total: &mut u64,
    total_limit: u64,
) -> io::Result<u64> {
    copy_limited_with_cancellation(reader, writer, entry_limit, total, total_limit, None)
}

fn copy_limited_with_cancellation<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    entry_limit: u64,
    total: &mut u64,
    total_limit: u64,
    cancellation: Option<&AtomicBool>,
) -> io::Result<u64> {
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    let mut copied = 0_u64;
    loop {
        if is_backup_cancelled(cancellation) {
            return Err(backup_cancelled_io_error());
        }
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let read = u64::try_from(read)
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "read byte count overflow"))?;
        let next_entry = copied
            .checked_add(read)
            .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "entry byte count overflow"))?;
        let next_total = total
            .checked_add(read)
            .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "archive byte count overflow"))?;
        if next_entry > entry_limit {
            return Err(limit_error("uncompressed entry size limit exceeded"));
        }
        if next_total > total_limit {
            return Err(limit_error("uncompressed archive size limit exceeded"));
        }
        writer.write_all(
            &buffer[..usize::try_from(read).map_err(|_| {
                io::Error::new(io::ErrorKind::Other, "read buffer length overflow")
            })?],
        )?;
        copied = next_entry;
        *total = next_total;
    }
    Ok(copied)
}

fn is_backup_cancelled(cancellation: Option<&AtomicBool>) -> bool {
    cancellation.is_some_and(|token| token.load(Ordering::SeqCst))
}

fn check_backup_cancellation(cancellation: Option<&AtomicBool>) -> Result<(), String> {
    if is_backup_cancelled(cancellation) {
        Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string())
    } else {
        Ok(())
    }
}

fn backup_cancelled_io_error() -> io::Error {
    io::Error::new(io::ErrorKind::Interrupted, AUTOMATIC_BACKUP_CANCELLED_ERROR)
}

fn is_backup_cancelled_io_error(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::Interrupted
        && error.to_string() == AUTOMATIC_BACKUP_CANCELLED_ERROR
}

fn temp_file_for(destination: &Path) -> io::Result<(File, PathBuf)> {
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let canonical_parent = fs::canonicalize(parent)?;
    if !canonical_parent.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Temporary file parent must be absolute",
        ));
    }
    let file_name = destination
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Destination has no file name"))?
        .to_string_lossy()
        .into_owned();
    if file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.chars().any(char::is_control)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Destination has an unsafe file name",
        ));
    }
    for _ in 0..32 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path =
            canonical_parent.join(format!(".{file_name}.tmp-{}-{counter}", std::process::id()));
        if !path.starts_with(&canonical_parent) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Temporary file escaped its parent",
            ));
        }
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((file, path)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "Could not allocate a unique temporary archive path",
    ))
}

fn atomic_install_new(temp: &Path, destination: &Path) -> io::Result<()> {
    let canonical_temp = fs::canonicalize(temp)?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Destination has no parent"))?;
    let canonical_parent = fs::canonicalize(destination_parent)?;
    let destination_name = destination
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Destination has no file name"))?
        .to_string_lossy()
        .into_owned();
    if destination_name.is_empty()
        || destination_name == "."
        || destination_name == ".."
        || destination_name.contains('/')
        || destination_name.contains('\\')
        || destination_name.chars().any(char::is_control)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Destination has an unsafe file name",
        ));
    }
    let safe_destination = canonical_parent.join(destination_name);
    if !safe_destination.starts_with(&canonical_parent)
        || canonical_temp.parent() != Some(canonical_parent.as_path())
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Atomic install paths must share a canonical parent",
        ));
    }
    // A hard link creates the destination directory entry without replacing an
    // existing file. Both paths are allocated in the same directory, so the
    // operation stays on one filesystem and the fully synced temporary file is
    // never exposed as a partial archive.
    fs::hard_link(&canonical_temp, &safe_destination)?;
    fs::remove_file(&canonical_temp)
}

fn write_zip_atomically<F>(destination: &Path, build: F) -> Result<u64, String>
where
    F: FnOnce(&mut zip::ZipWriter<LimitedWriter<File>>, &mut ResourceTotals) -> Result<(), String>,
{
    write_zip_atomically_with_cancellation(destination, None, build)
}

fn write_zip_atomically_with_cancellation<F>(
    destination: &Path,
    cancellation: Option<&AtomicBool>,
    build: F,
) -> Result<u64, String>
where
    F: FnOnce(&mut zip::ZipWriter<LimitedWriter<File>>, &mut ResourceTotals) -> Result<(), String>,
{
    check_backup_cancellation(cancellation)?;
    let (file, temp_path) = temp_file_for(destination)
        .map_err(|error| format!("Failed to create temporary zip: {error}"))?;
    let mut temp_guard = TempFileGuard::new(temp_path.clone());
    let limited_file = LimitedWriter::new(file, ARCHIVE_POLICY.max_archive_compressed_bytes);
    let mut zip = zip::ZipWriter::new(limited_file);
    let mut totals = ResourceTotals::default();

    build(&mut zip, &mut totals)?;
    check_backup_cancellation(cancellation)?;
    let writer = zip
        .finish()
        .map_err(|error| format!("Failed to finish zip: {error}"))?;
    let output_bytes = writer.written;
    if exceeds_compression_ratio(
        totals.uncompressed_bytes,
        output_bytes,
        ARCHIVE_POLICY.max_compression_ratio,
    ) {
        return Err("Created archive compression ratio exceeds the configured limit".to_string());
    }
    let file = writer.into_inner();
    file.sync_all()
        .map_err(|error| format!("Failed to sync temporary zip: {error}"))?;
    drop(file);
    check_backup_cancellation(cancellation)?;
    atomic_install_new(&temp_path, destination)
        .map_err(|error| format!("Failed to install zip atomically: {error}"))?;
    temp_guard.disarm();
    Ok(output_bytes)
}

fn compression_options(level: Option<i64>) -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(level.unwrap_or(5).clamp(0, 9)))
}

fn validate_source_entry(
    entry: &Path,
    containment_root: &Path,
    archive_root: &Path,
    totals: &mut ResourceTotals,
) -> Result<(PathBuf, fs::Metadata), String> {
    let metadata = fs::symlink_metadata(entry)
        .map_err(|error| format!("Failed to inspect source entry: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err(format!(
            "Symlink source entry is not allowed: {}",
            entry.display()
        ));
    }
    if !metadata.is_dir() && !metadata.is_file() {
        return Err(format!(
            "Unsupported source entry type: {}",
            entry.display()
        ));
    }
    let canonical = fs::canonicalize(entry)
        .map_err(|error| format!("Failed to resolve source entry: {error}"))?;
    if !canonical.starts_with(containment_root) {
        return Err(format!(
            "Source entry escapes source directory: {}",
            entry.display()
        ));
    }
    let relative = canonical
        .strip_prefix(archive_root)
        .map_err(|_| {
            format!(
                "Source entry is not below archive root: {}",
                entry.display()
            )
        })
        .map(|path| path.to_string_lossy())
        .map(|path| path.replace('\\', "/"))?;
    let safe_name = validate_archive_entry_name(&relative, ARCHIVE_POLICY)?;

    totals.entries = totals
        .entries
        .checked_add(1)
        .ok_or_else(|| "Archive entry count overflow".to_string())?;
    if totals.entries > ARCHIVE_POLICY.max_entries {
        return Err("Archive entry count exceeds the configured limit".to_string());
    }
    if metadata.is_file() {
        totals.uncompressed_bytes = totals
            .uncompressed_bytes
            .checked_add(metadata.len())
            .ok_or_else(|| "Uncompressed archive size overflow".to_string())?;
        if metadata.len() > ARCHIVE_POLICY.max_entry_uncompressed_bytes {
            return Err(format!("Source file is too large: {}", entry.display()));
        }
        if totals.uncompressed_bytes > ARCHIVE_POLICY.max_archive_uncompressed_bytes {
            return Err("Uncompressed archive size exceeds the configured limit".to_string());
        }
    }
    Ok((safe_name, metadata))
}

fn append_source_entry(
    zip: &mut zip::ZipWriter<LimitedWriter<File>>,
    entry: &Path,
    containment_root: &Path,
    archive_root: &Path,
    totals: &mut ResourceTotals,
    options: zip::write::SimpleFileOptions,
) -> Result<Option<BackupManifestEntry>, String> {
    append_source_entry_with_cancellation(
        zip,
        entry,
        containment_root,
        archive_root,
        totals,
        options,
        None,
    )
}

fn append_source_entry_with_cancellation(
    zip: &mut zip::ZipWriter<LimitedWriter<File>>,
    entry: &Path,
    containment_root: &Path,
    archive_root: &Path,
    totals: &mut ResourceTotals,
    options: zip::write::SimpleFileOptions,
    cancellation: Option<&AtomicBool>,
) -> Result<Option<BackupManifestEntry>, String> {
    check_backup_cancellation(cancellation)?;
    let (safe_name, metadata) =
        validate_source_entry(entry, containment_root, archive_root, totals)?;
    if metadata.is_dir() {
        zip.add_directory(format!("{}/", safe_name.to_string_lossy()), options)
            .map_err(|error| format!("Failed to add directory: {error}"))?;
        return Ok(None);
    }

    zip.start_file(safe_name.to_string_lossy(), options)
        .map_err(|error| format!("Failed to start file in zip: {error}"))?;
    let mut file =
        File::open(entry).map_err(|error| format_source_file_error("open", entry, &error))?;
    let mut actual_total = totals.uncompressed_bytes.saturating_sub(metadata.len());
    let mut hashing_zip = HashingWriter::new(zip);
    let copied = copy_limited_with_cancellation(
        &mut file,
        &mut hashing_zip,
        ARCHIVE_POLICY.max_entry_uncompressed_bytes,
        &mut actual_total,
        ARCHIVE_POLICY.max_archive_uncompressed_bytes,
        cancellation,
    )
    .map_err(|error| {
        if is_backup_cancelled_io_error(&error) {
            AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string()
        } else {
            format_source_file_error("stream", entry, &error)
        }
    })?;
    let sha256 = hashing_zip.finalize();
    if copied != metadata.len() {
        return Err(format!(
            "Source file changed while being archived: {}",
            entry.display()
        ));
    }
    totals.uncompressed_bytes = actual_total;
    Ok(Some(BackupManifestEntry {
        path: safe_name.to_string_lossy().replace('\\', "/"),
        kind: "file".to_string(),
        size: copied,
        sha256,
    }))
}

fn format_source_file_error(action: &str, entry: &Path, error: &io::Error) -> String {
    format!(
        "Failed to {action} source file: {}: {error}",
        entry.display()
    )
}

fn is_backup_runtime_file(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("session.lock"))
}

fn has_backup_files(entries: &[PathBuf]) -> io::Result<bool> {
    has_backup_files_with_cancellation(entries, None)
}

fn has_backup_files_with_cancellation(
    entries: &[PathBuf],
    cancellation: Option<&AtomicBool>,
) -> io::Result<bool> {
    for entry in entries {
        if is_backup_cancelled(cancellation) {
            return Err(backup_cancelled_io_error());
        }
        if fs::symlink_metadata(entry)?.is_file() {
            return Ok(true);
        }
    }
    Ok(false)
}

fn normalize_selected_sources(selected: Vec<String>) -> Result<Vec<PathBuf>, String> {
    let mut normalized = Vec::with_capacity(selected.len());
    for rel in selected {
        let normalized_rel = rel.replace('\\', "/");
        let safe_path = validate_archive_entry_name(&normalized_rel, ARCHIVE_POLICY)?;
        let mut path = PathBuf::new();
        for component in safe_path.components() {
            let Component::Normal(component) = component else {
                return Err("Selected source path is not a strict relative path".to_string());
            };
            path.push(component);
        }

        if matches!(
            path.components().next(),
            Some(Component::Normal(component))
                if component.to_string_lossy().eq_ignore_ascii_case("backups")
        ) {
            continue;
        }
        normalized.push(path);
    }

    normalized.sort_by(|left, right| {
        left.components()
            .count()
            .cmp(&right.components().count())
            .then_with(|| left.cmp(right))
    });
    normalized.dedup();

    let mut minimal = Vec::with_capacity(normalized.len());
    for candidate in normalized {
        if minimal
            .iter()
            .any(|ancestor: &PathBuf| candidate.starts_with(ancestor))
        {
            continue;
        }
        minimal.push(candidate);
    }
    Ok(minimal)
}

fn collect_selected_sources(
    source_path: &Path,
    source_canonical: &Path,
    selected: Vec<String>,
) -> Result<Vec<PathBuf>, String> {
    collect_selected_sources_with_cancellation(source_path, source_canonical, selected, None)
}

fn collect_selected_sources_with_cancellation(
    source_path: &Path,
    source_canonical: &Path,
    selected: Vec<String>,
    cancellation: Option<&AtomicBool>,
) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    for relative in normalize_selected_sources(selected)? {
        check_backup_cancellation(cancellation)?;
        let full_path = source_path.join(&relative);
        let full_canonical = fs::canonicalize(&full_path)
            .map_err(|error| format!("Failed to resolve selected source: {error}"))?;
        if !full_canonical.starts_with(source_canonical) {
            return Err(format!(
                "Selected source escapes source directory: {}",
                relative.display()
            ));
        }
        let metadata = fs::symlink_metadata(&full_path)
            .map_err(|error| format!("Failed to inspect selected source: {error}"))?;
        if is_link_or_reparse_point(&metadata) {
            return Err(format!(
                "Symlink source entry is not allowed: {}",
                relative.display()
            ));
        }
        if metadata.is_dir() {
            files.push(full_path.clone());
            files.extend(
                collect_backup_files_with_cancellation(&full_path, cancellation).map_err(
                    |error| {
                        if is_backup_cancelled_io_error(&error) {
                            AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string()
                        } else {
                            format!("Failed to collect files: {error}")
                        }
                    },
                )?,
            );
        } else if metadata.is_file() {
            if !is_backup_runtime_file(&full_path) {
                files.push(full_path);
            }
        } else {
            return Err(format!(
                "Unsupported selected source type: {}",
                relative.display()
            ));
        }
    }
    Ok(files)
}

pub async fn create_backup(
    app: AppHandle,
    server_id: String,
    backup_name: String,
    source_path: PathBuf,
    backup_path: PathBuf,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
    origin: String,
) -> Result<String, String> {
    create_backup_with_cancellation(
        app,
        server_id,
        backup_name,
        source_path,
        backup_path,
        sources,
        compression_level,
        origin,
        None,
    )
    .await
}

async fn create_backup_with_cancellation(
    app: AppHandle,
    server_id: String,
    backup_name: String,
    source_path: PathBuf,
    backup_path: PathBuf,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
    origin: String,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<String, String> {
    let sid = server_id.clone();
    let backup_name = backup_name.clone();
    let origin = origin.clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        // Measured up to the manifest: source collection and the archive writes. Finishing the zip and the
        // catalog rebuild are not included.
        let started = Instant::now();
        check_backup_cancellation(cancellation.as_deref())?;
        let source_metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| format!("Failed to inspect source directory: {error}"))?;
        if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
            return Err("Source path must be a real directory".to_string());
        }
        let source_canonical = fs::canonicalize(&source_path)
            .map_err(|error| format!("Failed to resolve source directory: {error}"))?;
        fs::create_dir_all(&backup_path)
            .map_err(|error| format!("Failed to create backup directory: {error}"))?;
        let zip_name = if backup_name.ends_with(".zip") {
            backup_name.clone()
        } else {
            format!("{backup_name}.zip")
        };
        let zip_name = validate_output_file_name(&zip_name, ARCHIVE_POLICY)?;
        let zip_path = backup_path.join(&zip_name);
        let options = compression_options(compression_level);

        let entries = match (sources, cancellation.as_deref()) {
            (Some(selected), Some(token)) => collect_selected_sources_with_cancellation(
                &source_path,
                &source_canonical,
                selected,
                Some(token),
            )?,
            (Some(selected), None) => {
                collect_selected_sources(&source_path, &source_canonical, selected)?
            }
            (None, Some(token)) => {
                collect_backup_files_with_cancellation(&source_path, Some(token)).map_err(
                    |error| {
                        if is_backup_cancelled_io_error(&error) {
                            AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string()
                        } else {
                            format!("Failed to collect files: {error}")
                        }
                    },
                )?
            }
            (None, None) => collect_backup_files(&source_path)
                .map_err(|error| format!("Failed to collect files: {error}"))?,
        };
        let has_files = match cancellation.as_deref() {
            Some(token) => {
                has_backup_files_with_cancellation(&entries, Some(token)).map_err(|error| {
                    if is_backup_cancelled_io_error(&error) {
                        AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string()
                    } else {
                        format!("Failed to inspect backup sources: {error}")
                    }
                })?
            }
            None => has_backup_files(&entries)
                .map_err(|error| format!("Failed to inspect backup sources: {error}"))?,
        };
        if !has_files {
            return Err(
                "No backup source files remain after excluding runtime lock files".to_string(),
            );
        }
        let mut entries = entries;
        entries.sort();
        let total = entries.len() as f32;
        write_zip_atomically_with_cancellation(
            &zip_path,
            cancellation.as_deref(),
            |zip, totals| {
                let mut manifest_entries = Vec::new();
                for (index, entry) in entries.iter().enumerate() {
                    check_backup_cancellation(cancellation.as_deref())?;
                    if let Some(manifest_entry) = append_source_entry_with_cancellation(
                        zip,
                        entry,
                        &source_canonical,
                        &source_canonical,
                        totals,
                        options,
                        cancellation.as_deref(),
                    )? {
                        manifest_entries.push(manifest_entry);
                    }
                    let progress = if total == 0.0 {
                        100.0
                    } else {
                        ((index + 1) as f32 / total) * 100.0
                    };
                    let _ = app_clone.emit(
                        "backup-progress",
                        BackupProgress {
                            server_id: sid.clone(),
                            progress,
                        },
                    );
                }
                manifest_entries.sort_by(|left, right| left.path.cmp(&right.path));
                let manifest = BackupManifest {
                    format_version: 2,
                    backup_id: Uuid::new_v4().to_string(),
                    server_id: sid.clone(),
                    kind: "full".to_string(),
                    consistency: "quiesced".to_string(),
                    origin: origin.clone(),
                    created_at: timestamp_millis(),
                    root_fingerprint: manifest_fingerprint(&manifest_entries)?,
                    file_count: manifest_entries.len() as u64,
                    total_bytes: manifest_entries.iter().map(|entry| entry.size).sum(),
                    entries: manifest_entries,
                    duration_ms: Some(elapsed_millis_since(started)),
                };
                let manifest_bytes = serde_json::to_vec(&manifest)
                    .map_err(|error| format!("Failed to serialize backup manifest: {error}"))?;
                zip.start_file("manifest.json", options)
                    .map_err(|error| format!("Failed to add backup manifest: {error}"))?;
                zip.write_all(&manifest_bytes)
                    .map_err(|error| format!("Failed to write backup manifest: {error}"))?;
                Ok(())
            },
        )?;
        Ok(zip_name.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

fn validate_archive_file_size(file: &File, policy: ArchivePolicy) -> Result<(), String> {
    let size = file
        .metadata()
        .map_err(|error| format!("Failed to inspect archive: {error}"))?
        .len();
    if size > policy.max_archive_compressed_bytes {
        return Err("Compressed archive size exceeds the configured limit".to_string());
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ArchiveEntryKind {
    File,
    Directory,
}

struct ArchiveEntryRecord {
    path: PathBuf,
    name: String,
}

fn preflight_archive<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    policy: ArchivePolicy,
) -> Result<(), String> {
    let entry_count = u64::try_from(archive.len()).map_err(|_| "Archive entry count overflow")?;
    if entry_count > policy.max_entries {
        return Err("Archive entry count exceeds the configured limit".to_string());
    }
    let mut totals = ResourceTotals::default();
    let mut paths = HashMap::with_capacity(archive.len());
    let mut entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read zip entry: {error}"))?;
        let safe_path = validate_zip_entry(&file, &mut totals, policy)?;
        let kind = if file.is_dir() {
            ArchiveEntryKind::Directory
        } else {
            ArchiveEntryKind::File
        };
        let entry_name = file
            .name()
            .map_err(|error| format!("Failed to read zip entry name: {error}"))?
            .into_owned();
        register_archive_entry(&mut paths, &safe_path, kind)
            .map_err(|reason| format!("Archive entry '{entry_name}' is invalid: {reason}"))?;
        entries.push(ArchiveEntryRecord {
            path: safe_path,
            name: entry_name,
        });
    }

    validate_archive_hierarchy(&paths, &entries)?;
    Ok(())
}

fn register_archive_entry(
    paths: &mut HashMap<PathBuf, ArchiveEntryKind>,
    candidate: &Path,
    kind: ArchiveEntryKind,
) -> Result<(), String> {
    if let Some(existing_kind) = paths.get(candidate) {
        return if *existing_kind == kind {
            Err("duplicate archive entry path".to_string())
        } else {
            Err("archive path has conflicting file and directory entries".to_string())
        };
    }

    paths.insert(candidate.to_path_buf(), kind);
    Ok(())
}

fn validate_archive_hierarchy(
    paths: &HashMap<PathBuf, ArchiveEntryKind>,
    entries: &[ArchiveEntryRecord],
) -> Result<(), String> {
    for entry in entries {
        let mut ancestor = PathBuf::new();
        let mut components = entry.path.components().peekable();
        while let Some(component) = components.next() {
            ancestor.push(component);
            if components.peek().is_none() {
                break;
            }
            if paths.get(&ancestor) == Some(&ArchiveEntryKind::File) {
                return Err(format!(
                    "Archive entry '{}' is invalid: file entry '{}' cannot be an ancestor of '{}'",
                    entry.name,
                    ancestor.display(),
                    entry.path.display()
                ));
            }
        }
    }
    Ok(())
}

struct ExtractionCleanup {
    files: Vec<PathBuf>,
    committed: bool,
}

impl ExtractionCleanup {
    fn new() -> Self {
        Self {
            files: Vec::new(),
            committed: false,
        }
    }

    fn track_file(&mut self, path: PathBuf) {
        self.files.push(path);
    }

    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for ExtractionCleanup {
    fn drop(&mut self) {
        if !self.committed {
            for path in self.files.iter().rev() {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn ensure_directory_without_symlink(
    root: &Path,
    relative: Option<&Path>,
) -> Result<PathBuf, String> {
    let root_metadata = fs::symlink_metadata(root)
        .map_err(|error| format!("Failed to inspect destination: {error}"))?;
    if is_link_or_reparse_point(&root_metadata) || !root_metadata.is_dir() {
        return Err("Destination root must be a real directory".to_string());
    }
    let mut current = root.to_path_buf();
    if let Some(relative) = relative {
        for component in relative.components() {
            let Component::Normal(component) = component else {
                return Err("Destination path is not a strict relative path".to_string());
            };
            current.push(component);
            match fs::symlink_metadata(&current) {
                Ok(metadata) if is_link_or_reparse_point(&metadata) => {
                    return Err(format!(
                        "Destination path contains a symlink: {}",
                        current.display()
                    ));
                }
                Ok(metadata) if !metadata.is_dir() => {
                    return Err(format!(
                        "Destination path component is not a directory: {}",
                        current.display()
                    ));
                }
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    fs::create_dir(&current).map_err(|error| {
                        format!("Failed to create destination directory: {error}")
                    })?;
                    let metadata = fs::symlink_metadata(&current).map_err(|error| {
                        format!("Failed to verify destination directory: {error}")
                    })?;
                    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                        return Err(format!(
                            "Created destination component is unsafe: {}",
                            current.display()
                        ));
                    }
                }
                Err(error) => {
                    return Err(format!("Failed to inspect destination component: {error}"))
                }
            }
        }
    }
    Ok(current)
}

fn extract_archive_to_directory(
    archive_path: &Path,
    destination_path: &Path,
) -> Result<(), String> {
    let file =
        File::open(archive_path).map_err(|error| format!("Failed to open archive: {error}"))?;
    validate_archive_file_size(&file, ARCHIVE_POLICY)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Failed to read zip: {error}"))?;
    preflight_archive(&mut archive, ARCHIVE_POLICY)?;

    match fs::symlink_metadata(destination_path) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) => {
            return Err("Destination root must not be a symlink".to_string());
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir_all(destination_path)
                .map_err(|error| format!("Failed to create destination directory: {error}"))?;
        }
        Err(error) => return Err(format!("Failed to inspect destination: {error}")),
    }
    ensure_directory_without_symlink(destination_path, None)?;

    let mut cleanup = ExtractionCleanup::new();
    let mut totals = ResourceTotals::default();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read zip entry: {error}"))?;
        let relative = validate_zip_entry(&entry, &mut totals, ARCHIVE_POLICY)?;
        let parent = ensure_directory_without_symlink(destination_path, relative.parent())?;
        let output_path = parent.join(
            relative
                .file_name()
                .ok_or_else(|| "Archive entry has no file name".to_string())?,
        );

        if entry.is_dir() {
            match fs::symlink_metadata(&output_path) {
                Ok(metadata) if is_link_or_reparse_point(&metadata) => {
                    return Err(format!(
                        "Destination path is a symlink: {}",
                        output_path.display()
                    ));
                }
                Ok(metadata) if !metadata.is_dir() => {
                    return Err(format!(
                        "Destination path is not a directory: {}",
                        output_path.display()
                    ));
                }
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    fs::create_dir(&output_path)
                        .map_err(|error| format!("Failed to create directory: {error}"))?;
                }
                Err(error) => return Err(format!("Failed to inspect directory: {error}")),
            }
            continue;
        }

        let existed = match fs::symlink_metadata(&output_path) {
            Ok(metadata) if is_link_or_reparse_point(&metadata) => {
                return Err(format!(
                    "Destination path is a symlink: {}",
                    output_path.display()
                ));
            }
            Ok(metadata) if metadata.is_dir() => {
                return Err(format!(
                    "Destination path is a directory: {}",
                    output_path.display()
                ));
            }
            Ok(_) => true,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(format!("Failed to inspect output path: {error}")),
        };
        let mut output = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&output_path)
            .map_err(|error| format!("Failed to create file: {error}"))?;
        if !existed {
            cleanup.track_file(output_path.clone());
        }
        let mut actual_entry_bytes = 0_u64;
        let copied = copy_limited(
            &mut entry,
            &mut output,
            ARCHIVE_POLICY.max_entry_uncompressed_bytes,
            &mut actual_entry_bytes,
            ARCHIVE_POLICY.max_entry_uncompressed_bytes,
        )
        .map_err(|error| format!("Failed to extract file: {error}"))?;
        if copied != entry.size() {
            return Err(format!(
                "Archive entry size changed while extracting: {}",
                entry.name().unwrap_or_default()
            ));
        }
        output
            .sync_all()
            .map_err(|error| format!("Failed to sync extracted file: {error}"))?;
    }
    cleanup.commit();
    Ok(())
}

const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;

fn read_backup_manifest(
    archive_path: &Path,
    expected_server_id: &str,
) -> Result<BackupManifest, String> {
    let parent = archive_path
        .parent()
        .ok_or_else(|| "Backup archive has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve backup archive parent: {error}"))?;
    let archive_name = archive_path
        .file_name()
        .ok_or_else(|| "Backup archive has no file name".to_string())?
        .to_string_lossy()
        .into_owned();
    if archive_name.is_empty()
        || archive_name == "."
        || archive_name == ".."
        || archive_name.contains('/')
        || archive_name.contains('\\')
        || archive_name.chars().any(char::is_control)
    {
        return Err("Backup archive has an unsafe file name".to_string());
    }
    let safe_archive = canonical_parent.join(archive_name);
    if !safe_archive.starts_with(&canonical_parent) {
        return Err("Backup archive escaped its parent directory".to_string());
    }
    let metadata = fs::symlink_metadata(&safe_archive)
        .map_err(|error| format!("Failed to inspect backup archive: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err("Backup archive must be a regular file".to_string());
    }
    let canonical_archive = fs::canonicalize(&safe_archive)
        .map_err(|error| format!("Failed to resolve backup archive: {error}"))?;
    if !canonical_archive.starts_with(&canonical_parent) {
        return Err("Backup archive escaped its parent directory".to_string());
    }
    let file = File::open(&canonical_archive)
        .map_err(|error| format!("Failed to open backup archive: {error}"))?;
    validate_archive_file_size(&file, ARCHIVE_POLICY)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Failed to read backup archive: {error}"))?;
    preflight_archive(&mut archive, ARCHIVE_POLICY)?;
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|_| "Backup manifest is missing".to_string())?;
    if manifest_file.size() > MAX_MANIFEST_BYTES {
        return Err("Backup manifest exceeds the configured limit".to_string());
    }
    let mut manifest_bytes = Vec::new();
    manifest_file
        .read_to_end(&mut manifest_bytes)
        .map_err(|error| format!("Failed to read backup manifest: {error}"))?;
    let manifest: BackupManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("Backup manifest is invalid JSON: {error}"))?;
    if manifest.format_version != 2
        || manifest.kind != "full"
        || !matches!(manifest.consistency.as_str(), "quiesced" | "live")
        || !matches!(manifest.origin.as_str(), "manual" | "automatic")
        || manifest.backup_id.trim().is_empty()
        || manifest.server_id.trim().is_empty()
    {
        return Err("Backup manifest contains unsupported metadata".to_string());
    }
    if manifest.server_id != expected_server_id {
        return Err("Backup manifest belongs to a different server".to_string());
    }
    if manifest.consistency == "live" {
        return Err("Live snapshots are not restoreable".to_string());
    }
    if manifest.entries.len() as u64 != manifest.file_count {
        return Err("Backup manifest file count does not match entries".to_string());
    }
    if manifest.entries.iter().any(|entry| {
        entry.kind != "file"
            || entry.sha256.len() != 64
            || !entry.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
            || validate_archive_entry_name(&entry.path, ARCHIVE_POLICY).is_err()
    }) {
        return Err("Backup manifest contains an unsafe file entry".to_string());
    }
    let mut entries = manifest.entries.clone();
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    if entries
        .windows(2)
        .any(|window| window[0].path == window[1].path)
    {
        return Err("Backup manifest contains duplicate file entries".to_string());
    }
    if manifest.root_fingerprint != manifest_fingerprint(&entries)? {
        return Err("Backup manifest fingerprint does not match entries".to_string());
    }
    let total_bytes = manifest
        .entries
        .iter()
        .try_fold(0_u64, |total, entry| total.checked_add(entry.size))
        .ok_or_else(|| "Backup manifest total size overflows".to_string())?;
    if manifest.total_bytes != total_bytes {
        return Err("Backup manifest total size does not match entries".to_string());
    }
    Ok(manifest)
}

fn hash_file(path: &Path) -> Result<String, String> {
    hash_file_with_cancellation(path, None)
}

fn hash_file_with_cancellation(
    path: &Path,
    cancellation: Option<&AtomicBool>,
) -> Result<String, String> {
    check_backup_cancellation(cancellation)?;
    let parent = path
        .parent()
        .ok_or_else(|| "File to hash has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve file parent for hashing: {error}"))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| "File to hash has no file name".to_string())?
        .to_string_lossy()
        .into_owned();
    if file_name.is_empty()
        || file_name == "."
        || file_name == ".."
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.chars().any(char::is_control)
    {
        return Err("File to hash has an unsafe file name".to_string());
    }
    let safe_path = canonical_parent.join(file_name);
    if !safe_path.starts_with(&canonical_parent) {
        return Err("File to hash escaped its parent directory".to_string());
    }
    let metadata = fs::symlink_metadata(&safe_path)
        .map_err(|error| format!("Failed to inspect file for hashing: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err("File to hash must be a regular file".to_string());
    }
    let canonical_path = fs::canonicalize(&safe_path)
        .map_err(|error| format!("Failed to resolve file for hashing: {error}"))?;
    if !canonical_path.starts_with(&canonical_parent) {
        return Err("File to hash escaped its parent directory".to_string());
    }
    let mut file = File::open(&canonical_path)
        .map_err(|error| format!("Failed to open file for hashing: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    loop {
        check_backup_cancellation(cancellation)?;
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to hash file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_encode(hasher.finalize()))
}

fn backup_catalog_path(backup_dir: &Path) -> PathBuf {
    backup_dir.join(".mc-vector-backup-catalog.json")
}

fn atomic_replace_existing_file(temp: &Path, destination: &Path) -> Result<(), String> {
    let destination_parent = destination
        .parent()
        .ok_or_else(|| "Backup catalog has no parent directory".to_string())?;
    let canonical_parent = fs::canonicalize(destination_parent)
        .map_err(|error| format!("Failed to resolve backup catalog parent: {error}"))?;
    let destination_name = destination
        .file_name()
        .ok_or_else(|| "Backup catalog has no file name".to_string())?
        .to_string_lossy()
        .into_owned();
    if destination_name.is_empty()
        || destination_name == "."
        || destination_name == ".."
        || destination_name.contains('/')
        || destination_name.contains('\\')
        || destination_name.chars().any(char::is_control)
    {
        return Err("Backup catalog has an unsafe file name".to_string());
    }
    let safe_destination = canonical_parent.join(destination_name.clone());
    if !safe_destination.starts_with(&canonical_parent) {
        return Err("Backup catalog escaped its parent directory".to_string());
    }
    let canonical_temp = fs::canonicalize(temp)
        .map_err(|error| format!("Failed to resolve temporary backup catalog: {error}"))?;
    if !canonical_temp.starts_with(&canonical_parent)
        || canonical_temp.parent() != Some(canonical_parent.as_path())
    {
        return Err("Temporary backup catalog escaped its parent directory".to_string());
    }
    let previous_path =
        canonical_parent.join(format!(".{destination_name}.old-{}", Uuid::new_v4()));
    if !previous_path.starts_with(&canonical_parent) {
        return Err("Previous backup catalog escaped its parent directory".to_string());
    }
    let previous = match fs::symlink_metadata(&safe_destination) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) => {
            return Err("Backup catalog must not be a symbolic link or reparse point".to_string())
        }
        Ok(metadata) if !metadata.is_file() => {
            return Err("Backup catalog path is not a regular file".to_string())
        }
        Ok(_) => Some(previous_path),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("Failed to inspect backup catalog: {error}")),
    };

    if let Some(previous_path) = previous.as_ref() {
        fs::rename(&safe_destination, previous_path)
            .map_err(|error| format!("Failed to stage previous backup catalog: {error}"))?;
    }

    match fs::rename(&canonical_temp, &safe_destination) {
        Ok(()) => {
            if let Some(previous_path) = previous {
                let _ = fs::remove_file(previous_path);
            }
            Ok(())
        }
        Err(error) => {
            let restore_result = previous.as_ref().map(|previous_path| {
                fs::rename(previous_path, &safe_destination)
                    .map_err(|restore_error| format!("{restore_error}"))
            });
            match restore_result {
                Some(Ok(())) | None => Err(format!(
                    "Failed to install backup catalog atomically: {error}"
                )),
                Some(Err(restore_error)) => Err(format!(
                    "Backup catalog replacement and recovery failed: {error}; {restore_error}"
                )),
            }
        }
    }
}

fn write_backup_catalog_atomically(
    backup_dir: &Path,
    server_id: &str,
    records: &[BackupRecord],
) -> Result<(), String> {
    let catalog = BackupCatalogFile {
        format_version: 1,
        server_id: server_id.to_string(),
        records: records.to_vec(),
    };
    let bytes = serde_json::to_vec_pretty(&catalog)
        .map_err(|error| format!("Failed to serialize backup catalog: {error}"))?;
    let catalog_path = backup_catalog_path(backup_dir);
    let (mut file, temp_path) = temp_file_for(&catalog_path)
        .map_err(|error| format!("Failed to create temporary backup catalog: {error}"))?;
    let mut temp_guard = TempFileGuard::new(temp_path.clone());
    file.write_all(&bytes)
        .map_err(|error| format!("Failed to write temporary backup catalog: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Failed to sync temporary backup catalog: {error}"))?;
    drop(file);
    atomic_replace_existing_file(&temp_path, &catalog_path)?;
    temp_guard.disarm();
    Ok(())
}

fn scan_backup_records(backup_dir: &Path, server_id: &str) -> Result<Vec<BackupRecord>, String> {
    scan_backup_records_with_cancellation(backup_dir, server_id, None)
}

fn scan_backup_records_with_cancellation(
    backup_dir: &Path,
    server_id: &str,
    cancellation: Option<&AtomicBool>,
) -> Result<Vec<BackupRecord>, String> {
    check_backup_cancellation(cancellation)?;
    let canonical_backup_dir = fs::canonicalize(backup_dir)
        .map_err(|error| format!("Failed to resolve backup directory: {error}"))?;
    if !canonical_backup_dir.is_absolute() {
        return Err("Backup directory must be absolute".to_string());
    }
    let mut records = Vec::new();
    let entries = fs::read_dir(&canonical_backup_dir)
        .map_err(|error| format!("Failed to scan backup directory: {error}"))?;
    for entry in entries {
        check_backup_cancellation(cancellation)?;
        let entry =
            entry.map_err(|error| format!("Failed to read backup directory entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect backup directory entry type: {error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to inspect backup directory entry: {error}"))?;
        if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
            continue;
        }
        if path.extension().and_then(|extension| extension.to_str()) != Some("zip") {
            continue;
        }
        let canonical_path = fs::canonicalize(&path)
            .map_err(|error| format!("Failed to resolve backup archive: {error}"))?;
        if !canonical_path.starts_with(&canonical_backup_dir) {
            continue;
        }

        // Invalid or incomplete archives remain on disk for repair/quarantine
        // handling, but never enter the normal restore catalog.
        let manifest = match read_backup_manifest(&canonical_path, server_id) {
            Ok(manifest) => manifest,
            Err(_) => {
                check_backup_cancellation(cancellation)?;
                continue;
            }
        };
        let archive_sha256 = match cancellation {
            Some(_) => hash_file_with_cancellation(&canonical_path, cancellation)?,
            None => archive_hash(&canonical_path)?,
        };
        records.push(backup_record_from_manifest(
            manifest,
            &canonical_path,
            archive_sha256,
        )?);
    }

    records.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| left.archive_path.cmp(&right.archive_path))
    });
    check_backup_cancellation(cancellation)?;
    Ok(records)
}

fn rebuild_backup_catalog(backup_dir: &Path, server_id: &str) -> Result<Vec<BackupRecord>, String> {
    let records = scan_backup_records(backup_dir, server_id)?;
    write_backup_catalog_atomically(backup_dir, server_id, &records)?;
    Ok(records)
}

fn rebuild_backup_catalog_with_cancellation(
    backup_dir: &Path,
    server_id: &str,
    cancellation: Option<&AtomicBool>,
) -> Result<Vec<BackupRecord>, String> {
    let records = scan_backup_records_with_cancellation(backup_dir, server_id, cancellation)?;
    check_backup_cancellation(cancellation)?;
    write_backup_catalog_atomically(backup_dir, server_id, &records)?;
    Ok(records)
}

fn backup_created_at_millis(record: &BackupRecord) -> u128 {
    record.created_at.parse::<u128>().unwrap_or(0)
}

fn apply_retention_to_backup_directory(
    backup_dir: &Path,
    server_id: &str,
    retain_count: u32,
    retain_days: u32,
    now_millis: u128,
) -> Result<BackupRetentionReport, String> {
    apply_retention_to_backup_directory_with_cancellation(
        backup_dir,
        server_id,
        retain_count,
        retain_days,
        now_millis,
        None,
    )
}

fn apply_retention_to_backup_directory_with_cancellation(
    backup_dir: &Path,
    server_id: &str,
    retain_count: u32,
    retain_days: u32,
    now_millis: u128,
    cancellation: Option<&AtomicBool>,
) -> Result<BackupRetentionReport, String> {
    check_backup_cancellation(cancellation)?;
    let canonical_backup_dir = fs::canonicalize(backup_dir)
        .map_err(|error| format!("Failed to resolve backup directory: {error}"))?;
    if !canonical_backup_dir.is_absolute() {
        return Err("Backup directory must be absolute".to_string());
    }
    let records =
        scan_backup_records_with_cancellation(&canonical_backup_dir, server_id, cancellation)?;
    let mut automatic = records
        .iter()
        .filter(|record| record.origin == "automatic")
        .collect::<Vec<_>>();
    automatic.sort_by(|left, right| {
        backup_created_at_millis(right)
            .cmp(&backup_created_at_millis(left))
            .then_with(|| left.archive_path.cmp(&right.archive_path))
    });

    let max_age_millis = u128::from(retain_days).saturating_mul(86_400_000);
    let mut deleted_names = Vec::new();
    let mut failed_delete_count = 0_u32;
    for (index, record) in automatic.iter().enumerate() {
        if is_backup_cancelled(cancellation) {
            break;
        }
        let over_count = retain_count > 0 && index >= retain_count as usize;
        let over_age = retain_days > 0
            && now_millis.saturating_sub(backup_created_at_millis(record)) > max_age_millis;
        if !over_count && !over_age {
            continue;
        }
        let archive_name = &record.archive_path;
        if archive_name.is_empty()
            || archive_name == "."
            || archive_name == ".."
            || archive_name.contains('/')
            || archive_name.contains('\\')
            || archive_name.chars().any(char::is_control)
        {
            failed_delete_count = failed_delete_count.saturating_add(1);
            continue;
        }
        let path = canonical_backup_dir.join(archive_name);
        if !path.starts_with(&canonical_backup_dir) {
            failed_delete_count = failed_delete_count.saturating_add(1);
            continue;
        }
        match fs::remove_file(&path) {
            Ok(()) => deleted_names.push(record.archive_path.clone()),
            Err(_) => failed_delete_count = failed_delete_count.saturating_add(1),
        }
    }

    let deleted_names_set = deleted_names
        .iter()
        .cloned()
        .collect::<std::collections::HashSet<_>>();
    let fallback_records = records
        .iter()
        .filter(|record| !deleted_names_set.contains(&record.archive_path))
        .cloned()
        .collect::<Vec<_>>();
    let records = if let Some(cancellation) = cancellation {
        match rebuild_backup_catalog_with_cancellation(
            &canonical_backup_dir,
            server_id,
            Some(cancellation),
        ) {
            Ok(records) => records,
            Err(error) if error == AUTOMATIC_BACKUP_CANCELLED_ERROR => {
                write_backup_catalog_atomically(
                    &canonical_backup_dir,
                    server_id,
                    &fallback_records,
                )?;
                return Err(error);
            }
            Err(error) => return Err(error),
        }
    } else {
        rebuild_backup_catalog(&canonical_backup_dir, server_id)?
    };
    check_backup_cancellation(cancellation)?;
    Ok(BackupRetentionReport {
        deleted_names,
        failed_delete_count,
        records,
    })
}

fn collect_regular_file_hashes(
    root: &Path,
    current: &Path,
    output: &mut HashMap<String, (u64, String)>,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve restore staging root: {error}"))?;
    let canonical_current = fs::canonicalize(current)
        .map_err(|error| format!("Failed to resolve restored entry: {error}"))?;
    if !canonical_current.starts_with(&canonical_root) {
        return Err("Restored entry escaped staging root".to_string());
    }
    let canonical_metadata = fs::symlink_metadata(&canonical_current)
        .map_err(|error| format!("Failed to inspect resolved restore tree: {error}"))?;
    if is_link_or_reparse_point(&canonical_metadata) {
        return Err("Restored tree contains a symbolic link or reparse point".to_string());
    }
    if canonical_metadata.is_file() {
        let relative = canonical_current
            .strip_prefix(&canonical_root)
            .map_err(|_| "Restored file escaped staging root".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        output.insert(
            relative,
            (canonical_metadata.len(), hash_file(&canonical_current)?),
        );
        return Ok(());
    }
    if !canonical_metadata.is_dir() {
        return Err("Restored tree contains an unsupported filesystem entry".to_string());
    }
    for entry in fs::read_dir(&canonical_current)
        .map_err(|error| format!("Failed to inspect restored directory: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to inspect restored entry: {error}"))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to inspect restored entry metadata: {error}"))?;
        if is_link_or_reparse_point(&metadata) {
            return Err("Restored tree contains a symbolic link or reparse point".to_string());
        }
        collect_regular_file_hashes(root, &entry.path(), output)?;
    }
    Ok(())
}

fn verify_staged_backup(staging: &Path, manifest: &BackupManifest) -> Result<(), String> {
    let manifest_path = staging.join("manifest.json");
    match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) if is_link_or_reparse_point(&metadata) || !metadata.is_file() => {
            return Err("Staged backup manifest is not a regular file".to_string());
        }
        Ok(_) => fs::remove_file(&manifest_path)
            .map_err(|error| format!("Failed to remove staged backup manifest: {error}"))?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Err("Staged backup manifest is missing".to_string())
        }
        Err(error) => return Err(format!("Failed to inspect staged manifest: {error}")),
    }

    let mut actual = HashMap::new();
    collect_regular_file_hashes(staging, staging, &mut actual)?;
    if actual.len() != manifest.entries.len() {
        return Err("Restored file set does not match the backup manifest".to_string());
    }
    for expected in &manifest.entries {
        let Some((actual_size, actual_hash)) = actual.get(&expected.path) else {
            return Err(format!("Restored file is missing: {}", expected.path));
        };
        if *actual_size != expected.size || actual_hash != &expected.sha256 {
            return Err(format!(
                "Restored file checksum mismatch: {}",
                expected.path
            ));
        }
    }
    Ok(())
}

fn create_unique_directory(parent: &Path, prefix: &str) -> Result<PathBuf, String> {
    for _ in 0..32 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{prefix}-{}-{counter}", std::process::id()));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Failed to create staging directory: {error}")),
        }
    }
    Err("Could not allocate a unique staging directory".to_string())
}

fn restore_commit_failure(
    error: impl std::fmt::Display,
    rollback: Option<&PathBuf>,
    target_dir: &Path,
    staging_guard: &mut TempDirectoryGuard,
) -> Result<(), String> {
    let rollback_result = rollback.map(|rollback_dir| {
        fs::rename(rollback_dir, target_dir).map_err(|rollback_error| format!("{rollback_error}"))
    });
    match rollback_result {
        Some(Ok(())) | None => Err(format!(
            "Failed to commit restored server directory: {error}"
        )),
        Some(Err(rollback_error)) => {
            staging_guard.disarm();
            Err(format!(
                "Restore failed and rollback also failed: {error}; {rollback_error}"
            ))
        }
    }
}

fn transactional_restore_archive(
    archive_path: &Path,
    target_dir: &Path,
    server_id: &str,
) -> Result<(), String> {
    let manifest = read_backup_manifest(archive_path, server_id)?;
    let parent = target_dir
        .parent()
        .ok_or_else(|| "Restore target has no parent directory".to_string())?;
    let staging = create_unique_directory(parent, "mc-vector-restore-staging")?;
    let mut staging_guard = TempDirectoryGuard::new(staging.clone());

    if let Err(error) = extract_archive_to_directory(archive_path, &staging)
        .and_then(|()| verify_staged_backup(&staging, &manifest))
    {
        return Err(error);
    }

    let target_metadata = fs::symlink_metadata(target_dir);
    let target_exists = match target_metadata {
        Ok(metadata) if is_link_or_reparse_point(&metadata) => {
            return Err("Restore target must not be a symbolic link or reparse point".to_string());
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err("Restore target must be a directory".to_string());
        }
        Ok(_) => true,
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("Failed to inspect restore target: {error}")),
    };

    let rollback = if target_exists {
        Some(create_unique_directory(
            parent,
            "mc-vector-restore-rollback",
        )?)
    } else {
        None
    };

    if let Some(rollback_dir) = rollback.as_ref() {
        fs::remove_dir(rollback_dir)
            .map_err(|error| format!("Failed to prepare rollback directory: {error}"))?;
        fs::rename(target_dir, rollback_dir)
            .map_err(|error| format!("Failed to stage current server directory: {error}"))?;
    }

    if cfg!(debug_assertions)
        && std::env::var("MC_VECTOR_TEST_RESTORE_FAILURE")
            .ok()
            .as_deref()
            == Some("after-current-rename")
    {
        return restore_commit_failure(
            "Injected restore failure after moving the current server directory",
            rollback.as_ref(),
            target_dir,
            &mut staging_guard,
        );
    }

    match fs::rename(&staging, target_dir) {
        Ok(()) => {
            staging_guard.disarm();
            if let Some(rollback_dir) = rollback {
                let _ = fs::remove_dir_all(rollback_dir);
            }
            Ok(())
        }
        Err(error) => {
            restore_commit_failure(error, rollback.as_ref(), target_dir, &mut staging_guard)
        }
    }
}

struct TempDirectoryGuard {
    path: PathBuf,
    armed: bool,
}

impl TempDirectoryGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempDirectoryGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

pub async fn restore_backup(
    _app: AppHandle,
    server_id: String,
    backup_path: PathBuf,
    target_dir: PathBuf,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        transactional_restore_archive(&backup_path, &target_dir, &server_id)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

pub async fn compress_item(sources: Vec<PathBuf>, destination: PathBuf) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        write_zip_atomically(&destination, |zip, totals| {
            for source in &sources {
                let metadata = fs::symlink_metadata(source)
                    .map_err(|error| format!("Failed to inspect source: {error}"))?;
                if is_link_or_reparse_point(&metadata) {
                    return Err(format!(
                        "Symlink source entry is not allowed: {}",
                        source.display()
                    ));
                }
                if metadata.is_dir() {
                    let containment_root = fs::canonicalize(source)
                        .map_err(|error| format!("Failed to resolve source: {error}"))?;
                    let archive_root =
                        fs::canonicalize(source.parent().unwrap_or_else(|| Path::new(".")))
                            .map_err(|error| format!("Failed to resolve archive root: {error}"))?;
                    let entries = collect_files(source)
                        .map_err(|error| format!("Failed to collect files: {error}"))?;
                    for entry in entries {
                        append_source_entry(
                            zip,
                            &entry,
                            &containment_root,
                            &archive_root,
                            totals,
                            zip::write::SimpleFileOptions::default()
                                .compression_method(zip::CompressionMethod::Deflated),
                        )?;
                    }
                } else if metadata.is_file() {
                    let archive_root =
                        fs::canonicalize(source.parent().unwrap_or_else(|| Path::new(".")))
                            .map_err(|error| format!("Failed to resolve archive root: {error}"))?;
                    let containment_root = archive_root.clone();
                    append_source_entry(
                        zip,
                        source,
                        &containment_root,
                        &archive_root,
                        totals,
                        zip::write::SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Deflated),
                    )?;
                } else {
                    return Err(format!("Unsupported source type: {}", source.display()));
                }
            }
            Ok(())
        })?;
        Ok(destination.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

pub async fn extract_item(archive: PathBuf, destination: PathBuf) -> Result<(), String> {
    tokio::task::spawn_blocking(move || extract_archive_to_directory(&archive, &destination))
        .await
        .map_err(|error| format!("Task join error: {error}"))?
}

#[tauri::command]
pub async fn list_managed_backups(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<Vec<BackupRecord>, String> {
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::BackupCreate)
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let backup_request = ManagedPathRequest {
        root: ManagedRoot::Backups,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let backup_dir = resolve_managed_request(&app_data_dir, &backup_request, true)?;
    tokio::task::spawn_blocking(move || rebuild_backup_catalog(&backup_dir, &server_id))
        .await
        .map_err(|error| format!("Task join error: {error}"))?
}

#[tauri::command]
pub async fn delete_managed_backup(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    backup_name: String,
) -> Result<Vec<BackupRecord>, String> {
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::BackupDelete)
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let archive_request = ManagedPathRequest {
        root: ManagedRoot::Backups,
        server_id: Some(server_id.clone()),
        relative_path: backup_name,
    };
    let archive = resolve_managed_request(&app_data_dir, &archive_request, false)?;
    let backup_dir_request = ManagedPathRequest {
        root: ManagedRoot::Backups,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let backup_dir = resolve_managed_request(&app_data_dir, &backup_dir_request, true)?;
    tokio::task::spawn_blocking(move || {
        let _manifest = read_backup_manifest(&archive, &server_id)?;
        fs::remove_file(&archive).map_err(|error| format!("Failed to delete backup: {error}"))?;
        rebuild_backup_catalog(&backup_dir, &server_id)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

#[tauri::command]
pub async fn apply_managed_backup_retention(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
) -> Result<BackupRetentionReport, String> {
    apply_managed_backup_retention_inner(
        app,
        operations.inner(),
        server_id,
        retain_count,
        retain_days,
    )
    .await
}

pub(crate) async fn apply_managed_backup_retention_inner(
    app: AppHandle,
    operations: &ServerOperationManager,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
) -> Result<BackupRetentionReport, String> {
    apply_managed_backup_retention_with_cancellation_inner(
        app,
        operations,
        server_id,
        retain_count,
        retain_days,
        None,
    )
    .await
}

async fn apply_managed_backup_retention_with_cancellation_inner(
    app: AppHandle,
    operations: &ServerOperationManager,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<BackupRetentionReport, String> {
    let _operation_guard = acquire_backup_operation(
        operations,
        &server_id,
        OperationKind::BackupDelete,
        cancellation.clone(),
    )
    .await?;
    apply_managed_backup_retention_unlocked_inner(
        app,
        server_id,
        retain_count,
        retain_days,
        cancellation,
    )
    .await
}

pub(crate) async fn apply_managed_backup_retention_cancellable_unlocked_inner(
    app: AppHandle,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
    cancellation: Arc<AtomicBool>,
) -> Result<BackupRetentionReport, String> {
    apply_managed_backup_retention_unlocked_inner(
        app,
        server_id,
        retain_count,
        retain_days,
        Some(cancellation),
    )
    .await
}

async fn apply_managed_backup_retention_unlocked_inner(
    app: AppHandle,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<BackupRetentionReport, String> {
    check_backup_cancellation(cancellation.as_deref())?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let backup_request = ManagedPathRequest {
        root: ManagedRoot::Backups,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let backup_dir = resolve_managed_request(&app_data_dir, &backup_request, true)?;
    tokio::task::spawn_blocking(move || {
        let now_millis = timestamp_millis().parse::<u128>().unwrap_or(0);
        match cancellation.as_deref() {
            Some(token) => apply_retention_to_backup_directory_with_cancellation(
                &backup_dir,
                &server_id,
                retain_count,
                retain_days,
                now_millis,
                Some(token),
            ),
            None => apply_retention_to_backup_directory(
                &backup_dir,
                &server_id,
                retain_count,
                retain_days,
                now_millis,
            ),
        }
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

async fn execute_managed_backup_with_guard<
    Stop,
    StopFuture,
    Create,
    CreateFuture,
    Restart,
    RestartFuture,
>(
    server_was_running: bool,
    stop_running_server: bool,
    operation: OperationGuard,
    stop: Stop,
    create: Create,
    restart: Restart,
) -> ManagedBackupOutcome
where
    Stop: FnOnce() -> StopFuture,
    StopFuture: Future<Output = Result<(), StopServerError>>,
    Create: FnOnce() -> CreateFuture,
    CreateFuture: Future<Output = Result<ManagedBackupArchive, String>>,
    Restart: FnOnce(OperationGuard) -> RestartFuture,
    RestartFuture: Future<Output = Result<(), String>>,
{
    if server_was_running && !stop_running_server {
        return ManagedBackupOutcome::ConfirmationRequired;
    }

    if server_was_running {
        if let Err(error) = stop().await {
            let restart_error = if error.recovery_state == StopErrorRecoveryState::Stopped {
                restart(operation).await.err()
            } else {
                drop(operation);
                None
            };
            return ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Stop,
                error: error.message,
                restart_error,
            };
        }
    }

    let backup = match create().await {
        Ok(backup) => backup,
        Err(error) => {
            let restart_error = if server_was_running {
                restart(operation).await.err()
            } else {
                None
            };
            return ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Backup,
                error,
                restart_error,
            };
        }
    };

    let restart = if server_was_running {
        match restart(operation).await {
            Ok(()) => BackupRestartOutcome::Restarted,
            Err(error) => BackupRestartOutcome::Failed { error },
        }
    } else {
        drop(operation);
        BackupRestartOutcome::NotNeeded
    };

    ManagedBackupOutcome::Created {
        backup_name: backup.backup_name,
        catalog_error: backup.catalog_error,
        restart,
    }
}

#[tauri::command]
pub async fn create_managed_backup(
    app: AppHandle,
    server_state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    registry: State<'_, ServerRegistry>,
    server_id: String,
    backup_name: String,
    stop_running_server: bool,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
    origin: Option<String>,
) -> Result<ManagedBackupOutcome, String> {
    let server_id = validate_server_id(&server_id)?;
    let operation = operations
        .acquire(&server_id, OperationKind::BackupCreate)
        .await?;
    let server_was_running = server_state.is_server_running(&server_id).await;
    let backup_app = app.clone();
    let restart_app = app;
    let backup_server_id = server_id.clone();
    let restart_server_id = server_id.clone();
    let server_state_ref = server_state.inner();
    let limiter_ref = limiter.inner();
    let operations_ref = operations.inner();
    let registry_ref = registry.inner();
    Ok(execute_managed_backup_with_guard(
        server_was_running,
        stop_running_server,
        operation,
        || stop_server_with_guard_recovery(server_state_ref, &server_id, None),
        || async move {
            create_managed_backup_unlocked_inner(
                backup_app,
                backup_server_id,
                backup_name,
                sources,
                compression_level,
                origin,
                None,
            )
            .await
        },
        |operation| async move {
            start_registered_server_with_guard(
                restart_app,
                server_state_ref,
                limiter_ref,
                operations_ref,
                registry_ref,
                restart_server_id,
                operation,
            )
            .await
        },
    )
    .await)
}

/// Creates an archive for a caller that already holds the server operation guard
/// and has stopped the server when required.
pub(crate) async fn create_managed_backup_unlocked_inner(
    app: AppHandle,
    server_id: String,
    backup_name: String,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
    origin: Option<String>,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<ManagedBackupArchive, String> {
    check_backup_cancellation(cancellation.as_deref())?;
    if sources
        .as_ref()
        .is_some_and(|selected| !selected.is_empty())
    {
        return Err("Full managed backups do not accept selected source paths".to_string());
    }
    let origin = origin.unwrap_or_else(|| "manual".to_string());
    if !matches!(origin.as_str(), "manual" | "automatic") {
        return Err("Backup origin is unsupported".to_string());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let server_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let backup_request = ManagedPathRequest {
        root: ManagedRoot::Backups,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let source = resolve_managed_request(&app_data_dir, &server_request, false)?;
    let backup = resolve_managed_request(&app_data_dir, &backup_request, true)?;
    let catalog_backup = backup.clone();
    let catalog_server_id = server_id.clone();
    let created_name = if let Some(cancellation) = cancellation.clone() {
        create_backup_with_cancellation(
            app,
            server_id,
            backup_name,
            source,
            backup,
            sources,
            compression_level,
            origin,
            Some(cancellation),
        )
        .await?
    } else {
        create_backup(
            app,
            server_id,
            backup_name,
            source,
            backup,
            sources,
            compression_level,
            origin,
        )
        .await?
    };
    let catalog_result = tokio::task::spawn_blocking(move || match cancellation.as_deref() {
        Some(token) => rebuild_backup_catalog_with_cancellation(
            &catalog_backup,
            &catalog_server_id,
            Some(token),
        ),
        None => rebuild_backup_catalog(&catalog_backup, &catalog_server_id),
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))
    .and_then(|result| result)
    .map(|_| ());
    Ok(managed_backup_archive_from_catalog_result(
        created_name,
        catalog_result,
    ))
}

#[tauri::command]
pub async fn restore_managed_backup(
    app: AppHandle,
    server_state: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    backup_name: String,
) -> Result<(), String> {
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::BackupRestore)
        .await?;
    if server_state.servers.lock().await.contains_key(&server_id) {
        return Err("Cannot restore a backup while the server is running".to_string());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let archive_request = ManagedPathRequest {
        root: ManagedRoot::Backups,
        server_id: Some(server_id.clone()),
        relative_path: backup_name,
    };
    let target_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let archive = resolve_managed_request(&app_data_dir, &archive_request, false)?;
    let target = resolve_managed_request(&app_data_dir, &target_request, false)?;
    let catalog_server_id = server_id.clone();
    restore_backup(app, server_id, archive, target).await?;
    let backup_dir = resolve_managed_request(
        &app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some(catalog_server_id.clone()),
            relative_path: String::new(),
        },
        true,
    )?;
    tokio::task::spawn_blocking(move || rebuild_backup_catalog(&backup_dir, &catalog_server_id))
        .await
        .map_err(|error| format!("Task join error: {error}"))??;
    Ok(())
}

#[tauri::command]
pub async fn compress_managed_items(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    sources: Vec<ManagedPathRequest>,
    destination: ManagedPathRequest,
) -> Result<String, String> {
    let mut scopes = sources
        .iter()
        .map(managed_operation_scope)
        .collect::<Result<Vec<_>, _>>()?;
    scopes.push(managed_operation_scope(&destination)?);
    let _operation_guards = operations
        .acquire_scopes(scopes, OperationKind::FileMutation)
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let source_paths = sources
        .iter()
        .map(|request| resolve_managed_request(&app_data_dir, request, false))
        .collect::<Result<Vec<_>, _>>()?;
    let destination = resolve_managed_request(&app_data_dir, &destination, true)?;
    compress_item(source_paths, destination).await
}

#[tauri::command]
pub async fn extract_managed_item(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    archive: ManagedPathRequest,
    destination: ManagedPathRequest,
) -> Result<(), String> {
    let archive_scope = managed_operation_scope(&archive)?;
    let destination_scope = managed_operation_scope(&destination)?;
    let _operation_guards = operations
        .acquire_scopes(
            [archive_scope, destination_scope],
            OperationKind::FileMutation,
        )
        .await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let archive = resolve_managed_request(&app_data_dir, &archive, false)?;
    let destination = resolve_managed_request(&app_data_dir, &destination, true)?;
    extract_item(archive, destination).await
}

/// Recursively collect regular files and directories without following symlinks.
fn collect_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    collect_files_with_policy(dir, false)
}

fn collect_backup_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    collect_files_with_policy(dir, true)
}

fn collect_backup_files_with_cancellation(
    dir: &Path,
    cancellation: Option<&AtomicBool>,
) -> io::Result<Vec<PathBuf>> {
    let root_canonical = fs::canonicalize(dir)?;
    let mut files = Vec::new();
    collect_files_internal(
        &root_canonical,
        &root_canonical,
        &mut files,
        true,
        cancellation,
    )?;
    Ok(files)
}

fn collect_files_with_policy(
    dir: &Path,
    exclude_backup_runtime_files: bool,
) -> io::Result<Vec<PathBuf>> {
    let root_canonical = fs::canonicalize(dir)?;
    let mut files = Vec::new();
    collect_files_internal(
        &root_canonical,
        &root_canonical,
        &mut files,
        exclude_backup_runtime_files,
        None,
    )?;
    Ok(files)
}

fn collect_files_internal(
    canonical_dir: &Path,
    root: &Path,
    files: &mut Vec<PathBuf>,
    exclude_backup_runtime_files: bool,
    cancellation: Option<&AtomicBool>,
) -> io::Result<()> {
    if is_backup_cancelled(cancellation) {
        return Err(backup_cancelled_io_error());
    }
    if !canonical_dir.is_absolute() || !canonical_dir.starts_with(root) {
        return Err(limit_error("source entry escapes source directory"));
    }
    let directory_metadata = fs::symlink_metadata(canonical_dir)?;
    if is_link_or_reparse_point(&directory_metadata) || !directory_metadata.is_dir() {
        return Err(limit_error("source directory is not a real directory"));
    }

    for entry in fs::read_dir(canonical_dir)? {
        if is_backup_cancelled(cancellation) {
            return Err(backup_cancelled_io_error());
        }
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Err(limit_error("symlink source entry is not allowed"));
        }
        let path = entry.path();
        let metadata = entry.metadata()?;
        if is_link_or_reparse_point(&metadata) {
            return Err(limit_error("symlink source entry is not allowed"));
        }
        let entry_canonical = fs::canonicalize(&path)?;
        if !entry_canonical.starts_with(root) {
            return Err(limit_error("source entry escapes source directory"));
        }
        if exclude_backup_runtime_files && metadata.is_file() && is_backup_runtime_file(&path) {
            continue;
        }
        files.push(path.clone());
        if u64::try_from(files.len()).unwrap_or(u64::MAX) > ARCHIVE_POLICY.max_entries {
            return Err(limit_error(
                "archive entry count exceeds the configured limit",
            ));
        }
        if metadata.is_dir() {
            collect_files_internal(
                &entry_canonical,
                root,
                files,
                exclude_backup_runtime_files,
                cancellation,
            )?;
        } else if !metadata.is_file() {
            return Err(limit_error("unsupported source entry type"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn test_temp_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("mc-vector-backup-tests")
    }

    fn test_backup_archive(backup_name: &str) -> ManagedBackupArchive {
        ManagedBackupArchive {
            backup_name: backup_name.to_string(),
            catalog_error: None,
        }
    }

    fn archive_with_entries(
        entries: &[(&str, ArchiveEntryKind)],
    ) -> zip::ZipArchive<Cursor<Vec<u8>>> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        for (name, kind) in entries {
            match kind {
                ArchiveEntryKind::Directory => writer
                    .add_directory(*name, options)
                    .expect("write directory entry"),
                ArchiveEntryKind::File => {
                    writer.start_file(*name, options).expect("write file entry");
                    writer.write_all(b"payload").expect("write file contents");
                }
            }
        }
        let bytes = writer.finish().expect("finish zip").into_inner();
        zip::ZipArchive::new(Cursor::new(bytes)).expect("read zip")
    }

    fn preflight_result(entries: &[(&str, ArchiveEntryKind)]) -> Result<(), String> {
        let mut archive = archive_with_entries(entries);
        preflight_archive(&mut archive, ARCHIVE_POLICY)
    }

    fn create_full_manifest_archive(source: &Path, archive: &Path, server_id: &str) {
        create_full_manifest_archive_with_metadata(
            source,
            archive,
            server_id,
            "test-backup",
            "manual",
            "2026-09-09T00:00:00.000Z",
        );
    }

    fn create_full_manifest_archive_with_metadata(
        source: &Path,
        archive: &Path,
        server_id: &str,
        backup_id: &str,
        origin: &str,
        created_at: &str,
    ) {
        let source_canonical = fs::canonicalize(source).expect("resolve source");
        let mut entries = collect_backup_files(source).expect("collect backup files");
        entries.sort();
        write_zip_atomically(archive, |zip, totals| {
            let mut manifest_entries = Vec::new();
            for entry in &entries {
                if let Some(manifest_entry) = append_source_entry(
                    zip,
                    entry,
                    &source_canonical,
                    &source_canonical,
                    totals,
                    compression_options(Some(5)),
                )? {
                    manifest_entries.push(manifest_entry);
                }
            }
            manifest_entries.sort_by(|left, right| left.path.cmp(&right.path));
            let manifest = BackupManifest {
                format_version: 2,
                backup_id: backup_id.to_string(),
                server_id: server_id.to_string(),
                kind: "full".to_string(),
                consistency: "quiesced".to_string(),
                origin: origin.to_string(),
                created_at: created_at.to_string(),
                root_fingerprint: manifest_fingerprint(&manifest_entries)?,
                file_count: manifest_entries.len() as u64,
                total_bytes: manifest_entries.iter().map(|entry| entry.size).sum(),
                entries: manifest_entries,
                duration_ms: None,
            };
            let manifest_bytes = serde_json::to_vec(&manifest)
                .map_err(|error| format!("Failed to serialize test manifest: {error}"))?;
            zip.start_file("manifest.json", compression_options(Some(5)))
                .map_err(|error| format!("Failed to add test manifest: {error}"))?;
            zip.write_all(&manifest_bytes)
                .map_err(|error| format!("Failed to write test manifest: {error}"))?;
            Ok(())
        })
        .expect("create full manifest archive");
    }

    fn test_policy() -> ArchivePolicy {
        ArchivePolicy {
            max_entries: 2,
            max_archive_compressed_bytes: 64,
            max_archive_uncompressed_bytes: 32,
            max_entry_compressed_bytes: 32,
            max_entry_uncompressed_bytes: 16,
            max_entry_name_bytes: 32,
            max_path_component_bytes: 8,
            max_path_depth: 2,
            max_compression_ratio: 4,
        }
    }

    #[test]
    fn archive_entry_names_are_strictly_relative() {
        let policy = test_policy();
        assert!(validate_archive_entry_name("world/file", policy).is_ok());
        for unsafe_name in [
            "/etc/passwd",
            "../outside",
            "world/../outside",
            "C:/outside",
            "world\\level.dat",
            "world//level.dat",
            "world/./level.dat",
        ] {
            assert!(
                validate_archive_entry_name(unsafe_name, policy).is_err(),
                "{unsafe_name}"
            );
        }
    }

    #[test]
    fn archive_entry_name_limits_cover_depth_and_component_length() {
        let policy = test_policy();
        assert!(validate_archive_entry_name("12345678/file", policy).is_ok());
        assert!(validate_archive_entry_name("123456789/file", policy).is_err());
        assert!(validate_archive_entry_name("a/b/c", policy).is_err());
    }

    #[test]
    fn output_file_names_require_safe_single_components() {
        let policy = ARCHIVE_POLICY;
        assert!(validate_output_file_name("Backup-Test-2026-09-04-12-30.zip", policy).is_ok());
        assert!(validate_archive_entry_name("archive*?\"<>|", policy).is_ok());

        for unsafe_name in [
            "Backup-Test-2026-09-04-12:30.zip",
            "Backup/Test.zip",
            "Backup\\Test.zip",
            "../Backup.zip",
            "Backup*Test.zip",
            "Backup?Test.zip",
            "Backup\"Test.zip",
            "Backup<Test.zip",
            "Backup>Test.zip",
            "Backup|Test.zip",
        ] {
            assert!(
                validate_output_file_name(unsafe_name, policy).is_err(),
                "{unsafe_name}"
            );
        }
    }

    #[test]
    fn nested_directory_and_file_entries_are_accepted() {
        let result = preflight_result(&[
            ("world/", ArchiveEntryKind::Directory),
            ("world/level.dat", ArchiveEntryKind::File),
        ]);
        assert!(result.is_ok(), "{result:?}");
    }

    #[test]
    fn duplicate_archive_paths_are_rejected() {
        let mut paths = HashMap::new();
        register_archive_entry(
            &mut paths,
            Path::new("world/level.dat"),
            ArchiveEntryKind::File,
        )
        .expect("first path should be accepted");
        let error = register_archive_entry(
            &mut paths,
            Path::new("world/level.dat"),
            ArchiveEntryKind::File,
        )
        .expect_err("duplicate paths must be rejected");
        assert!(error.contains("duplicate archive entry path"), "{error}");
    }

    #[test]
    fn file_ancestor_entries_are_rejected() {
        let error = preflight_result(&[
            ("world", ArchiveEntryKind::File),
            ("world/level.dat", ArchiveEntryKind::File),
        ])
        .expect_err("file ancestors must be rejected");
        assert!(error.contains("cannot be an ancestor"), "{error}");
    }

    #[test]
    fn same_path_file_directory_conflicts_are_rejected() {
        let error = preflight_result(&[
            ("world", ArchiveEntryKind::File),
            ("world/", ArchiveEntryKind::Directory),
        ])
        .expect_err("file and directory conflicts must be rejected");
        assert!(
            error.contains("conflicting file and directory entries"),
            "{error}"
        );
    }

    #[test]
    fn archive_conflicts_are_rejected_independent_of_zip_order() {
        let first_error = preflight_result(&[
            ("world", ArchiveEntryKind::File),
            ("world/level.dat", ArchiveEntryKind::File),
        ])
        .expect_err("file ancestor must be rejected");
        let second_error = preflight_result(&[
            ("world/level.dat", ArchiveEntryKind::File),
            ("world", ArchiveEntryKind::File),
        ])
        .expect_err("file ancestor must be rejected");

        assert!(first_error.contains("file entry"), "{first_error}");
        assert!(second_error.contains("file entry"), "{second_error}");
    }

    #[test]
    fn selected_sources_are_normalized_to_minimal_safe_paths() {
        let normalized = normalize_selected_sources(vec![
            "world/region".to_string(),
            "world".to_string(),
            "world/level.dat".to_string(),
            "world".to_string(),
            "backups".to_string(),
            "backups/old.zip".to_string(),
        ])
        .expect("safe sources should normalize");

        assert_eq!(normalized, vec![PathBuf::from("world")]);
    }

    #[test]
    fn reserved_backup_source_exclusion_is_case_insensitive() {
        let normalized = normalize_selected_sources(vec![
            "Backups".to_string(),
            "BACKUPS/old.zip".to_string(),
            "bAcKuPs/nested/file.dat".to_string(),
            "world".to_string(),
        ])
        .expect("safe sources should normalize");

        assert_eq!(normalized, vec![PathBuf::from("world")]);
    }

    #[test]
    fn backup_collection_excludes_session_locks_but_generic_collection_keeps_them() {
        let root = test_temp_dir().join(format!(
            "mc-vector-backup-lock-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(root.join("world")).expect("create world directory");
        fs::create_dir_all(root.join("world_nether")).expect("create nether directory");
        fs::write(root.join("world/session.lock"), b"lock").expect("write world lock");
        fs::write(root.join("world/level.dat"), b"level").expect("write world data");
        fs::write(root.join("world_nether/SESSION.LOCK"), b"lock").expect("write nether lock");
        fs::write(root.join("server.properties"), b"online-mode=true")
            .expect("write server properties");

        let backup_entries = collect_backup_files(&root).expect("collect backup files");
        assert!(
            backup_entries
                .iter()
                .all(|entry| !is_backup_runtime_file(entry)),
            "backup entries must omit session locks: {backup_entries:?}"
        );
        assert!(backup_entries.iter().any(|entry| entry.ends_with("world")));
        assert!(backup_entries
            .iter()
            .any(|entry| entry.ends_with("world/level.dat")));
        assert!(backup_entries
            .iter()
            .any(|entry| entry.ends_with("server.properties")));

        let generic_entries = collect_files(&root).expect("collect generic files");
        assert!(generic_entries
            .iter()
            .any(|entry| entry.ends_with("world/session.lock")));
        assert!(generic_entries
            .iter()
            .any(|entry| entry.ends_with("world_nether/SESSION.LOCK")));

        fs::remove_dir_all(root).expect("remove test tree");
    }

    #[test]
    fn selected_backup_sources_exclude_direct_and_nested_session_locks() {
        let root = test_temp_dir().join(format!(
            "mc-vector-selected-lock-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(root.join("world")).expect("create world directory");
        fs::write(root.join("world/session.lock"), b"lock").expect("write world lock");
        fs::write(root.join("world/level.dat"), b"level").expect("write world data");
        fs::write(root.join("root.lock"), b"ordinary lock file").expect("write root lock");

        let source_canonical = fs::canonicalize(&root).expect("resolve source");
        let entries = collect_selected_sources(
            &root,
            &source_canonical,
            vec!["world".to_string(), "world/session.lock".to_string()],
        )
        .expect("collect selected sources");

        assert!(
            entries.iter().all(|entry| !is_backup_runtime_file(entry)),
            "selected entries must omit session locks: {entries:?}"
        );
        assert!(entries.iter().any(|entry| entry.ends_with("world")));
        assert!(entries
            .iter()
            .any(|entry| entry.ends_with("world/level.dat")));

        let only_lock = collect_selected_sources(
            &root,
            &source_canonical,
            vec!["world/session.lock".to_string()],
        )
        .expect("collect direct session lock source");
        assert!(only_lock.is_empty());

        let world_with_only_lock = test_temp_dir().join(format!(
            "mc-vector-world-lock-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(world_with_only_lock.join("world"))
            .expect("create lock-only world directory");
        fs::write(world_with_only_lock.join("world/session.lock"), b"lock")
            .expect("write lock-only world lock");
        let lock_only_canonical =
            fs::canonicalize(&world_with_only_lock).expect("resolve lock-only source");
        let lock_only_entries = collect_selected_sources(
            &world_with_only_lock,
            &lock_only_canonical,
            vec!["world".to_string()],
        )
        .expect("collect lock-only world");
        assert!(!has_backup_files(&lock_only_entries).expect("inspect lock-only entries"));
        fs::remove_dir_all(world_with_only_lock).expect("remove lock-only test tree");

        fs::remove_dir_all(root).expect("remove test tree");
    }

    #[test]
    fn source_file_errors_include_the_failing_path() {
        let error = io::Error::new(io::ErrorKind::PermissionDenied, "access denied");
        let message = format_source_file_error("stream", Path::new("world/session.lock"), &error);

        assert_eq!(
            message,
            "Failed to stream source file: world/session.lock: access denied"
        );
    }

    #[test]
    fn selected_sources_reject_unsafe_paths() {
        for unsafe_source in ["../outside", "world/../outside"] {
            let error = normalize_selected_sources(vec![unsafe_source.to_string()])
                .expect_err("unsafe source should be rejected");
            assert!(!error.is_empty(), "{unsafe_source}");
        }
    }

    #[test]
    fn selected_source_backslashes_are_normalized_to_archive_separators() {
        let normalized = normalize_selected_sources(vec!["world\\level.dat".to_string()])
            .expect("backslash separators should normalize");
        assert_eq!(normalized, vec![PathBuf::from("world/level.dat")]);
    }

    #[test]
    fn selected_source_create_and_restore_round_trip_handles_nested_entries() {
        let root = test_temp_dir().join(format!(
            "mc-vector-backup-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(root.join("source/world/region")).expect("create source tree");
        fs::write(root.join("source/world/level.dat"), b"level data").expect("write level");
        fs::write(root.join("source/world/region/r.0.0.mca"), b"region data")
            .expect("write region");

        let source = root.join("source");
        let archive = root.join("backup.zip");
        let destination = root.join("destination");
        let source_canonical = fs::canonicalize(&source).expect("resolve source");
        let entries = collect_selected_sources(
            &source,
            &source_canonical,
            vec!["world".to_string(), "world/level.dat".to_string()],
        )
        .expect("collect normalized sources");

        write_zip_atomically(&archive, |zip, totals| {
            for entry in &entries {
                append_source_entry(
                    zip,
                    entry,
                    &source_canonical,
                    &source_canonical,
                    totals,
                    compression_options(Some(5)),
                )?;
            }
            Ok(())
        })
        .expect("create archive");

        extract_archive_to_directory(&archive, &destination).expect("restore archive");
        assert_eq!(
            fs::read(destination.join("world/level.dat")).expect("read restored level"),
            b"level data"
        );
        assert_eq!(
            fs::read(destination.join("world/region/r.0.0.mca")).expect("read restored region"),
            b"region data"
        );

        fs::remove_dir_all(root).expect("remove test tree");
    }

    #[test]
    fn full_snapshot_restore_recovers_deleted_and_stale_files() {
        let root = test_temp_dir().join(format!(
            "mc-vector-transactional-restore-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let source = root.join("source");
        let archive = root.join("backup.zip");
        let target = root.join("server");
        fs::create_dir_all(source.join("world")).expect("create source tree");
        fs::create_dir_all(target.join("world")).expect("create target tree");
        fs::write(source.join("server.properties"), b"online-mode=true")
            .expect("write source properties");
        fs::write(source.join("world/level.dat"), b"restored-level").expect("write source level");
        fs::write(source.join("session.lock"), b"runtime lock").expect("write source lock");
        fs::write(target.join("world/level.dat"), b"old-level").expect("write old level");
        fs::write(target.join("stale.txt"), b"must disappear").expect("write stale file");

        create_full_manifest_archive(&source, &archive, "server-1");
        transactional_restore_archive(&archive, &target, "server-1").expect("restore snapshot");

        assert_eq!(
            fs::read(target.join("world/level.dat")).expect("read restored level"),
            b"restored-level"
        );
        assert_eq!(
            fs::read(target.join("server.properties")).expect("read restored properties"),
            b"online-mode=true"
        );
        assert!(!target.join("stale.txt").exists());
        assert!(!target.join("session.lock").exists());

        fs::remove_dir_all(root).expect("remove test tree");
    }

    #[test]
    fn restore_rejects_a_snapshot_for_another_server_before_touching_target() {
        let root = test_temp_dir().join(format!(
            "mc-vector-transactional-server-id-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let source = root.join("source");
        let archive = root.join("backup.zip");
        let target = root.join("server");
        fs::create_dir_all(&source).expect("create source tree");
        fs::create_dir_all(&target).expect("create target tree");
        fs::write(source.join("server.properties"), b"source").expect("write source file");
        fs::write(target.join("server.properties"), b"must remain").expect("write target file");

        create_full_manifest_archive(&source, &archive, "server-a");
        let error = transactional_restore_archive(&archive, &target, "server-b")
            .expect_err("cross-server restore must be rejected");
        assert!(error.contains("different server"), "{error}");
        assert_eq!(
            fs::read(target.join("server.properties")).expect("read unchanged target"),
            b"must remain"
        );

        fs::remove_dir_all(root).expect("remove test tree");
    }

    #[test]
    fn existing_archive_is_never_clobbered_by_atomic_install() {
        let root = test_temp_dir().join(format!(
            "mc-vector-archive-clobber-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let destination = root.join("backup.zip");
        let temporary = root.join("temporary.zip");
        fs::write(&destination, b"old archive").expect("write existing archive");
        fs::write(&temporary, b"new archive").expect("write temporary archive");

        let error = atomic_install_new(&temporary, &destination)
            .expect_err("existing destination must reject installation");
        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(
            fs::read(&destination).expect("read existing archive"),
            b"old archive"
        );
        assert_eq!(
            fs::read(&temporary).expect("read temporary archive"),
            b"new archive"
        );

        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn retention_only_deletes_automatic_backups() {
        let root = test_temp_dir().join(format!(
            "mc-vector-retention-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let source = root.join("source");
        let backup_dir = root.join("backups");
        fs::create_dir_all(&source).expect("create source directory");
        fs::create_dir_all(&backup_dir).expect("create backup directory");
        fs::write(source.join("server.properties"), b"fixture").expect("write source file");

        create_full_manifest_archive_with_metadata(
            &source,
            &backup_dir.join("automatic-old.zip"),
            "server-1",
            "automatic-old",
            "automatic",
            "1000",
        );
        create_full_manifest_archive_with_metadata(
            &source,
            &backup_dir.join("automatic-new.zip"),
            "server-1",
            "automatic-new",
            "automatic",
            "2000",
        );
        create_full_manifest_archive_with_metadata(
            &source,
            &backup_dir.join("manual-old.zip"),
            "server-1",
            "manual-old",
            "manual",
            "500",
        );

        let report = apply_retention_to_backup_directory(&backup_dir, "server-1", 1, 0, 3000)
            .expect("apply retention");
        assert_eq!(report.deleted_names, vec!["automatic-old.zip"]);
        assert_eq!(report.failed_delete_count, 0);
        assert!(!backup_dir.join("automatic-old.zip").exists());
        assert!(backup_dir.join("automatic-new.zip").exists());
        assert!(backup_dir.join("manual-old.zip").exists());
        assert_eq!(report.records.len(), 2);
        assert!(backup_catalog_path(&backup_dir).is_file());

        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn catalog_rebuilds_from_archive_manifests_after_catalog_loss() {
        let root = test_temp_dir().join(format!(
            "mc-vector-catalog-rebuild-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let source = root.join("source");
        let backup_dir = root.join("backups");
        fs::create_dir_all(&source).expect("create source directory");
        fs::create_dir_all(&backup_dir).expect("create backup directory");
        fs::write(source.join("server.properties"), b"fixture").expect("write source file");
        create_full_manifest_archive(&source, &backup_dir.join("survivable.zip"), "server-1");

        let records = rebuild_backup_catalog(&backup_dir, "server-1").expect("build catalog");
        assert_eq!(records.len(), 1);
        fs::remove_file(backup_catalog_path(&backup_dir)).expect("remove catalog");

        let rebuilt = rebuild_backup_catalog(&backup_dir, "server-1").expect("rebuild catalog");
        assert_eq!(rebuilt.len(), 1);
        let catalog: BackupCatalogFile = serde_json::from_str(
            &fs::read_to_string(backup_catalog_path(&backup_dir)).expect("read rebuilt catalog"),
        )
        .expect("parse rebuilt catalog");
        assert_eq!(catalog.server_id, "server-1");
        assert_eq!(catalog.records[0].archive_path, "survivable.zip");

        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn archive_entry_limits_reject_ratio_size_and_count() {
        let policy = test_policy();
        let mut totals = ResourceTotals::default();
        assert!(validate_entry_limits("a", false, 3, 16, &mut totals, policy).is_err());

        let mut totals = ResourceTotals::default();
        assert!(validate_entry_limits("a", false, 8, 8, &mut totals, policy).is_ok());
        assert!(validate_entry_limits("b", false, 8, 8, &mut totals, policy).is_ok());
        assert!(validate_entry_limits("c", false, 8, 1, &mut totals, policy).is_err());
    }

    #[test]
    fn limited_copy_streams_and_rejects_the_next_chunk_over_limit() {
        let mut reader = Cursor::new(vec![1_u8; 17]);
        let mut output = Vec::new();
        let mut total = 0_u64;
        let result = copy_limited(&mut reader, &mut output, 16, &mut total, 32);
        assert!(result.is_err());
        assert!(output.len() <= 16);
    }

    struct CancelAfterFirstRead<'a> {
        cancellation: &'a std::sync::atomic::AtomicBool,
        remaining: usize,
    }

    impl Read for CancelAfterFirstRead<'_> {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            if self.remaining == 0 {
                return Ok(0);
            }
            let length = buffer.len().min(self.remaining);
            buffer[..length].fill(7);
            self.remaining -= length;
            self.cancellation.store(true, Ordering::SeqCst);
            Ok(length)
        }
    }

    #[test]
    fn cancellable_copy_stops_between_chunks() {
        let cancellation = std::sync::atomic::AtomicBool::new(false);
        let mut reader = CancelAfterFirstRead {
            cancellation: &cancellation,
            remaining: COPY_BUFFER_SIZE * 2,
        };
        let mut output = Vec::new();
        let mut total = 0_u64;

        let error = copy_limited_with_cancellation(
            &mut reader,
            &mut output,
            u64::MAX,
            &mut total,
            u64::MAX,
            Some(&cancellation),
        )
        .expect_err("the copy should observe cancellation after its first chunk");

        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
        assert_eq!(error.to_string(), AUTOMATIC_BACKUP_CANCELLED_ERROR);
        assert_eq!(output.len(), COPY_BUFFER_SIZE);
        assert_eq!(total, COPY_BUFFER_SIZE as u64);
    }

    #[test]
    fn cancelled_zip_removes_partial_temporary_archive() {
        let root = test_temp_dir().join(format!("cancel-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create temporary test directory");
        let archive = root.join("automatic.zip");
        let cancellation = std::sync::atomic::AtomicBool::new(false);

        let result =
            write_zip_atomically_with_cancellation(&archive, Some(&cancellation), |zip, _| {
                zip.start_file("world.dat", zip::write::SimpleFileOptions::default())
                    .map_err(|error| format!("start test entry: {error}"))?;
                zip.write_all(b"partial archive")
                    .map_err(|error| format!("write test entry: {error}"))?;
                cancellation.store(true, Ordering::SeqCst);
                Ok(())
            });

        assert_eq!(result, Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string()));
        assert!(!archive.exists(), "cancelled archive must not be installed");
        let leftovers = fs::read_dir(&root)
            .expect("read test directory")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect temporary files");
        assert!(leftovers.is_empty(), "partial temp archive must be removed");
        fs::remove_dir_all(root).expect("remove temporary test directory");
    }

    #[tokio::test]
    async fn queued_automatic_backup_operation_can_be_cancelled() {
        let operations = ServerOperationManager::default();
        let blocker = operations
            .acquire("server-1", OperationKind::BackupRestore)
            .await
            .expect("acquire blocker operation");
        let cancellation = Arc::new(AtomicBool::new(false));
        let waiting_operations = operations.clone();
        let waiting_cancellation = cancellation.clone();
        let waiting = tokio::spawn(async move {
            acquire_backup_operation(
                &waiting_operations,
                "server-1",
                OperationKind::BackupCreate,
                Some(waiting_cancellation),
            )
            .await
        });

        tokio::task::yield_now().await;
        cancellation.store(true, Ordering::SeqCst);
        let result = tokio::time::timeout(std::time::Duration::from_secs(1), waiting)
            .await
            .expect("cancellation should release the queued wait")
            .expect("operation wait task should complete");
        assert!(matches!(
            result,
            Err(error) if error == AUTOMATIC_BACKUP_CANCELLED_ERROR
        ));

        drop(blocker);
        operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("the operation lock should remain usable after cancellation");
    }

    #[tokio::test]
    async fn manual_backup_confirmation_does_not_create_an_archive() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-confirmation-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");

        let outcome = execute_managed_backup_with_guard(
            true,
            false,
            operation,
            || async { Ok(()) },
            || async {
                fs::write(&archive, b"archive").expect("write archive marker");
                Ok(test_backup_archive("backup.zip"))
            },
            |operation| async move {
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert_eq!(outcome, ManagedBackupOutcome::ConfirmationRequired);
        assert!(!archive.exists(), "confirmation must not create a file");
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn stopped_server_backup_creates_without_restart() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let outcome = execute_managed_backup_with_guard(
            false,
            false,
            operation,
            || async { panic!("an inactive server does not need to stop") },
            || async { Ok(test_backup_archive("backup.zip")) },
            move |operation| async move {
                restart_called_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Created {
                backup_name: "backup.zip".to_string(),
                catalog_error: None,
                restart: BackupRestartOutcome::NotNeeded,
            }
        );
        assert!(!restart_called.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn manual_stop_error_waits_for_exit_notification_before_restart_without_backup() {
        let servers = ServerManager::default();
        let signal_exit = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let mut status_events = servers
            .take_status_receiver()
            .expect("test status receiver should be available");
        let cleanup_signal = signal_exit.clone();
        let cleanup_servers = servers.clone();
        let (removed_tx, removed_rx) = tokio::sync::oneshot::channel();
        let (continue_cleanup_tx, continue_cleanup_rx) = tokio::sync::oneshot::channel();
        let cleanup = tokio::spawn(async move {
            cleanup_signal
                .wait_until_expected_stop_registered(&cleanup_servers)
                .await;
            cleanup_signal
                .remove_from_server_map(&cleanup_servers)
                .await;
            let _ = removed_tx.send(());
            let _ = continue_cleanup_rx.await;
            cleanup_signal.finish_cleanup(&cleanup_servers).await;
        });
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-stop-failure-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");
        let archive_for_create = archive.clone();
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let stop_servers = servers.clone();
        let backup = tokio::spawn(async move {
            execute_managed_backup_with_guard(
                true,
                true,
                operation,
                move || async move {
                    stop_server_with_guard_recovery(&stop_servers, "server-1", None).await
                },
                || async {
                    fs::write(&archive_for_create, b"archive").expect("write archive marker");
                    Ok(test_backup_archive("backup.zip"))
                },
                move |operation| async move {
                    restart_called_in_closure.store(true, Ordering::SeqCst);
                    drop(operation);
                    Ok(())
                },
            )
            .await
        });

        removed_rx
            .await
            .expect("cleanup should remove the server map entry");
        assert!(!servers.is_server_running("server-1").await);
        assert!(
            !restart_called.load(Ordering::SeqCst),
            "map removal alone must not permit recovery restart"
        );
        assert!(
            !archive.exists(),
            "map removal alone must not create a backup"
        );
        let mut backup = backup;
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), &mut backup)
                .await
                .is_err(),
            "stop recovery must wait for the exit watch after map removal"
        );
        continue_cleanup_tx
            .send(())
            .expect("release old process cleanup");
        let outcome = backup.await.expect("backup task should finish");
        cleanup.await.expect("exit cleanup task should finish");

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Stop,
                error: "Server not found or not running".to_string(),
                restart_error: None,
            }
        );
        assert!(restart_called.load(Ordering::SeqCst));
        assert!(!archive.exists(), "failed stop must not create a file");
        let old_exit = status_events
            .recv()
            .await
            .expect("old server should publish its offline event");
        assert!(
            old_exit.expected,
            "failed stop send must preserve expected marker"
        );
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn manual_stop_error_does_not_restart_without_exit_confirmation() {
        let servers = ServerManager::default();
        let hold_exit_sender = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-stop-unconfirmed-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let stop_servers = servers.clone();
        let outcome = execute_managed_backup_with_guard(
            true,
            true,
            operation,
            move || async move {
                stop_server_with_guard_recovery(&stop_servers, "server-1", None).await
            },
            || async {
                fs::write(&archive, b"archive").expect("write archive marker");
                Ok(test_backup_archive("backup.zip"))
            },
            move |operation| async move {
                restart_called_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Stop,
                error: "Server not found or not running".to_string(),
                restart_error: None,
            }
        );
        assert!(!restart_called.load(Ordering::SeqCst));
        assert!(
            !archive.exists(),
            "unconfirmed stop must not create an archive"
        );
        assert!(servers.is_server_running("server-1").await);
        hold_exit_sender.remove_from_server_map(&servers).await;
        hold_exit_sender.finish_cleanup(&servers).await;
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn failed_manual_backup_attempts_to_restore_running_server() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let outcome = execute_managed_backup_with_guard(
            true,
            true,
            operation,
            || async { Ok(()) },
            || async { Err("archive write failed".to_string()) },
            move |operation| async move {
                restart_called_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Err("restart failed".to_string())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Backup,
                error: "archive write failed".to_string(),
                restart_error: Some("restart failed".to_string()),
            }
        );
        assert!(restart_called.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn successful_manual_archive_reports_restart_failure_separately() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-restart-failure-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");

        let outcome = execute_managed_backup_with_guard(
            true,
            true,
            operation,
            || async { Ok(()) },
            || async {
                fs::write(&archive, b"archive").expect("write archive marker");
                Ok(test_backup_archive("backup.zip"))
            },
            |operation| async move {
                drop(operation);
                Err("Java executable is unavailable".to_string())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Created {
                backup_name: "backup.zip".to_string(),
                catalog_error: None,
                restart: BackupRestartOutcome::Failed {
                    error: "Java executable is unavailable".to_string(),
                },
            }
        );
        assert!(
            archive.exists(),
            "the archive remains available on restart failure"
        );
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn manual_backup_guard_blocks_same_server_start_until_restart() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let (backup_started_tx, backup_started_rx) = tokio::sync::oneshot::channel();
        let (continue_backup_tx, continue_backup_rx) = tokio::sync::oneshot::channel();
        let backup = tokio::spawn(async move {
            execute_managed_backup_with_guard(
                true,
                true,
                operation,
                || async { Ok(()) },
                || async move {
                    let _ = backup_started_tx.send(());
                    continue_backup_rx
                        .await
                        .map_err(|_| "backup test was cancelled".to_string())?;
                    Ok(test_backup_archive("backup.zip"))
                },
                |operation| async move {
                    drop(operation);
                    Ok(())
                },
            )
            .await
        });

        backup_started_rx
            .await
            .expect("backup should reach the guarded create stage");
        let waiting_operations = operations.clone();
        let mut competing_start = tokio::spawn(async move {
            waiting_operations
                .acquire("server-1", OperationKind::Start)
                .await
        });
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), &mut competing_start,)
                .await
                .is_err()
        );

        continue_backup_tx.send(()).expect("release backup stage");
        let outcome = backup.await.expect("backup task should finish");
        assert!(matches!(outcome, ManagedBackupOutcome::Created { .. }));
        competing_start
            .await
            .expect("start contender should acquire after backup completes")
            .expect("start lock should remain usable");
    }

    #[test]
    fn managed_backup_outcomes_use_the_confirmed_wire_shape() {
        assert_eq!(
            serde_json::to_value(ManagedBackupOutcome::ConfirmationRequired)
                .expect("serialize confirmation"),
            serde_json::json!({"status": "confirmation_required"})
        );
        assert_eq!(
            serde_json::to_value(ManagedBackupOutcome::Created {
                backup_name: "backup.zip".to_string(),
                catalog_error: None,
                restart: BackupRestartOutcome::Failed {
                    error: "restart failed".to_string(),
                },
            })
            .expect("serialize created outcome"),
            serde_json::json!({
                "status": "created",
                "backupName": "backup.zip",
                "catalogError": null,
                "restart": {"status": "failed", "error": "restart failed"}
            })
        );
        assert_eq!(
            serde_json::to_value(ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Backup,
                error: "archive failed".to_string(),
                restart_error: Some("restart failed".to_string()),
            })
            .expect("serialize failed outcome"),
            serde_json::json!({
                "status": "failed",
                "stage": "backup",
                "error": "archive failed",
                "restartError": "restart failed"
            })
        );
    }

    #[test]
    fn catalog_rebuild_failure_is_a_warning_after_archive_creation() {
        let archive = managed_backup_archive_from_catalog_result(
            "backup.zip".to_string(),
            Err("catalog write failed".to_string()),
        );

        assert_eq!(
            archive,
            ManagedBackupArchive {
                backup_name: "backup.zip".to_string(),
                catalog_error: Some("catalog write failed".to_string()),
            }
        );
        let outcome = ManagedBackupOutcome::Created {
            backup_name: archive.backup_name,
            catalog_error: archive.catalog_error,
            restart: BackupRestartOutcome::NotNeeded,
        };
        assert_eq!(
            serde_json::to_value(outcome).expect("serialize created outcome with warning"),
            serde_json::json!({
                "status": "created",
                "backupName": "backup.zip",
                "catalogError": "catalog write failed",
                "restart": {"status": "not_needed"}
            })
        );
    }

    #[test]
    fn zip_symlink_entries_are_rejected_before_extraction() {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .add_symlink(
                "link",
                "../../outside",
                zip::write::SimpleFileOptions::default(),
            )
            .expect("write symlink entry");
        let bytes = writer.finish().expect("finish zip").into_inner();
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("read zip");
        let mut totals = ResourceTotals::default();
        let file = archive.by_index(0).expect("read entry");
        assert!(file.is_symlink());
        assert!(validate_zip_entry(&file, &mut totals, ARCHIVE_POLICY).is_err());
    }

    #[test]
    fn backup_duration_flows_from_the_manifest_into_the_catalog_record() {
        let manifest: BackupManifest = serde_json::from_value(serde_json::json!({
            "formatVersion": 2,
            "backupId": "backup-1",
            "serverId": "server-1",
            "kind": "full",
            "consistency": "quiesced",
            "origin": "manual",
            "createdAt": "1700000000000",
            "rootFingerprint": "unused",
            "fileCount": 0,
            "totalBytes": 0,
            "entries": [],
            "durationMs": 4321
        }))
        .expect("parse manifest with a duration");
        assert_eq!(manifest.duration_ms, Some(4321));

        let record = backup_record_from_manifest(
            manifest,
            Path::new("/backups/nightly.zip"),
            "0".repeat(64),
        )
        .expect("build record from manifest");
        assert_eq!(record.duration_ms, Some(4321));
        let value = serde_json::to_value(&record).expect("serialize record");
        assert_eq!(value["durationMs"], serde_json::json!(4321));
    }

    #[test]
    fn backups_without_a_recorded_duration_still_load_and_stay_unset() {
        let legacy_manifest: BackupManifest = serde_json::from_value(serde_json::json!({
            "formatVersion": 2,
            "backupId": "backup-1",
            "serverId": "server-1",
            "kind": "full",
            "consistency": "quiesced",
            "origin": "manual",
            "createdAt": "1700000000000",
            "rootFingerprint": "unused",
            "fileCount": 0,
            "totalBytes": 0,
            "entries": []
        }))
        .expect("parse legacy manifest without a duration");
        assert_eq!(legacy_manifest.duration_ms, None);
        let manifest_value = serde_json::to_value(&legacy_manifest).expect("serialize manifest");
        assert!(manifest_value.get("durationMs").is_none());

        let legacy_record: BackupRecord = serde_json::from_value(serde_json::json!({
            "backupId": "backup-1",
            "serverId": "server-1",
            "archivePath": "nightly.zip",
            "kind": "full",
            "consistency": "quiesced",
            "origin": "manual",
            "createdAt": "1700000000000",
            "fileCount": 0,
            "totalBytes": 0,
            "archiveSha256": "0000",
            "manifestVersion": 2,
            "restoreEligible": true
        }))
        .expect("parse legacy catalog record");
        assert_eq!(legacy_record.duration_ms, None);
    }
}
