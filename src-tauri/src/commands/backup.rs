use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager};

use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};

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

fn validate_output_file_name(name: &str, policy: ArchivePolicy) -> Result<(), String> {
    let path = validate_archive_entry_name(name, policy)?;
    if path.components().count() != 1 {
        return Err("Output file name must not contain a directory".to_string());
    }
    Ok(())
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

fn validate_zip_entry(
    file: &zip::read::ZipFile<'_>,
    totals: &mut ResourceTotals,
    policy: ArchivePolicy,
) -> Result<PathBuf, String> {
    validate_entry_limits(
        file.name(),
        file.is_symlink(),
        file.compressed_size(),
        file.size(),
        totals,
        policy,
    )
}

fn copy_limited<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    entry_limit: u64,
    total: &mut u64,
    total_limit: u64,
) -> io::Result<u64> {
    let mut buffer = [0_u8; COPY_BUFFER_SIZE];
    let mut copied = 0_u64;
    loop {
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

fn temp_file_for(destination: &Path) -> io::Result<(File, PathBuf)> {
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Destination has no file name"))?
        .to_string_lossy();
    for _ in 0..32 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = parent.join(format!(".{file_name}.tmp-{}-{counter}", std::process::id()));
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

fn atomic_replace(temp: &Path, destination: &Path) -> io::Result<()> {
    match fs::rename(temp, destination) {
        Ok(()) => Ok(()),
        Err(rename_error) if destination.exists() => {
            fs::remove_file(destination).map_err(|error| {
                io::Error::new(
                    error.kind(),
                    format!(
                        "Failed to replace existing archive: {error}; initial error: {rename_error}"
                    ),
                )
            })?;
            fs::rename(temp, destination).map_err(|error| {
                io::Error::new(
                    error.kind(),
                    format!(
                        "Failed to atomically move archive: {error}; initial error: {rename_error}"
                    ),
                )
            })
        }
        Err(error) => Err(error),
    }
}

fn write_zip_atomically<F>(destination: &Path, build: F) -> Result<u64, String>
where
    F: FnOnce(&mut zip::ZipWriter<LimitedWriter<File>>, &mut ResourceTotals) -> Result<(), String>,
{
    let (file, temp_path) = temp_file_for(destination)
        .map_err(|error| format!("Failed to create temporary zip: {error}"))?;
    let mut temp_guard = TempFileGuard::new(temp_path.clone());
    let limited_file = LimitedWriter::new(file, ARCHIVE_POLICY.max_archive_compressed_bytes);
    let mut zip = zip::ZipWriter::new(limited_file);
    let mut totals = ResourceTotals::default();

    build(&mut zip, &mut totals)?;
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
    atomic_replace(&temp_path, destination)
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
) -> Result<(), String> {
    let (safe_name, metadata) =
        validate_source_entry(entry, containment_root, archive_root, totals)?;
    if metadata.is_dir() {
        zip.add_directory(format!("{}/", safe_name.to_string_lossy()), options)
            .map_err(|error| format!("Failed to add directory: {error}"))?;
        return Ok(());
    }

    zip.start_file(safe_name.to_string_lossy(), options)
        .map_err(|error| format!("Failed to start file in zip: {error}"))?;
    let mut file =
        File::open(entry).map_err(|error| format!("Failed to open source file: {error}"))?;
    let mut actual_total = totals.uncompressed_bytes.saturating_sub(metadata.len());
    let copied = copy_limited(
        &mut file,
        zip,
        ARCHIVE_POLICY.max_entry_uncompressed_bytes,
        &mut actual_total,
        ARCHIVE_POLICY.max_archive_uncompressed_bytes,
    )
    .map_err(|error| format!("Failed to stream source file: {error}"))?;
    if copied != metadata.len() {
        return Err(format!(
            "Source file changed while being archived: {}",
            entry.display()
        ));
    }
    totals.uncompressed_bytes = actual_total;
    Ok(())
}

pub async fn create_backup(
    app: AppHandle,
    server_id: String,
    backup_name: String,
    source_dir: String,
    backup_dir: String,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
) -> Result<String, String> {
    let source = source_dir.clone();
    let backup = backup_dir.clone();
    let sid = server_id.clone();
    let backup_name = backup_name.clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        let source_path = Path::new(&source);
        let source_metadata = fs::symlink_metadata(source_path)
            .map_err(|error| format!("Failed to inspect source directory: {error}"))?;
        if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
            return Err("Source path must be a real directory".to_string());
        }
        let source_canonical = fs::canonicalize(source_path)
            .map_err(|error| format!("Failed to resolve source directory: {error}"))?;
        let backup_path = Path::new(&backup);
        fs::create_dir_all(backup_path)
            .map_err(|error| format!("Failed to create backup directory: {error}"))?;
        let zip_name = if backup_name.ends_with(".zip") {
            backup_name.clone()
        } else {
            format!("{backup_name}.zip")
        };
        validate_output_file_name(&zip_name, ARCHIVE_POLICY)?;
        let zip_path = backup_path.join(&zip_name);
        let options = compression_options(compression_level);

        let entries = if let Some(selected) = sources {
            let mut files = Vec::new();
            for rel in selected {
                let relative = validate_archive_entry_name(&rel, ARCHIVE_POLICY)?;
                let full_path = source_path.join(relative);
                let full_canonical = fs::canonicalize(&full_path)
                    .map_err(|error| format!("Failed to resolve selected source: {error}"))?;
                if !full_canonical.starts_with(&source_canonical) {
                    return Err(format!("Selected source escapes source directory: {rel}"));
                }
                let metadata = fs::symlink_metadata(&full_path)
                    .map_err(|error| format!("Failed to inspect selected source: {error}"))?;
                if is_link_or_reparse_point(&metadata) {
                    return Err(format!("Symlink source entry is not allowed: {rel}"));
                }
                if metadata.is_dir() {
                    files.push(full_path.clone());
                    files.extend(
                        collect_files(&full_path)
                            .map_err(|error| format!("Failed to collect files: {error}"))?,
                    );
                } else if metadata.is_file() {
                    files.push(full_path);
                } else {
                    return Err(format!("Unsupported selected source type: {rel}"));
                }
            }
            files
        } else {
            collect_files(source_path)
                .map_err(|error| format!("Failed to collect files: {error}"))?
        };
        let total = entries.len() as f32;
        write_zip_atomically(&zip_path, |zip, totals| {
            for (index, entry) in entries.iter().enumerate() {
                append_source_entry(
                    zip,
                    entry,
                    &source_canonical,
                    &source_canonical,
                    totals,
                    options,
                )?;
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
            Ok(())
        })?;
        Ok(zip_name)
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

fn preflight_archive(
    archive: &mut zip::ZipArchive<File>,
    policy: ArchivePolicy,
) -> Result<(), String> {
    let entry_count = u64::try_from(archive.len()).map_err(|_| "Archive entry count overflow")?;
    if entry_count > policy.max_entries {
        return Err("Archive entry count exceeds the configured limit".to_string());
    }
    let mut totals = ResourceTotals::default();
    let mut paths = HashSet::with_capacity(archive.len());
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read zip entry: {error}"))?;
        let safe_path = validate_zip_entry(&file, &mut totals, policy)?;
        if !paths_are_non_conflicting(&mut paths, &safe_path) {
            return Err(format!(
                "Archive contains duplicate or colliding entries: {}",
                file.name()
            ));
        }
    }
    Ok(())
}

fn paths_are_non_conflicting(paths: &mut HashSet<PathBuf>, candidate: &Path) -> bool {
    if paths.contains(candidate)
        || paths
            .iter()
            .any(|existing| candidate.starts_with(existing) || existing.starts_with(candidate))
    {
        return false;
    }
    paths.insert(candidate.to_path_buf());
    true
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

fn extract_archive_to_directory(archive_path: &str, destination: &str) -> Result<(), String> {
    let file =
        File::open(archive_path).map_err(|error| format!("Failed to open archive: {error}"))?;
    validate_archive_file_size(&file, ARCHIVE_POLICY)?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Failed to read zip: {error}"))?;
    preflight_archive(&mut archive, ARCHIVE_POLICY)?;

    let destination_path = Path::new(destination);
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
                entry.name()
            ));
        }
        output
            .sync_all()
            .map_err(|error| format!("Failed to sync extracted file: {error}"))?;
    }
    cleanup.commit();
    Ok(())
}

pub async fn restore_backup(
    _app: AppHandle,
    backup_path: String,
    target_dir: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || extract_archive_to_directory(&backup_path, &target_dir))
        .await
        .map_err(|error| format!("Task join error: {error}"))?
}

pub async fn compress_item(sources: Vec<String>, dest: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let destination = PathBuf::from(&dest);
        write_zip_atomically(&destination, |zip, totals| {
            for source in &sources {
                let source_path = Path::new(source);
                let metadata = fs::symlink_metadata(source_path)
                    .map_err(|error| format!("Failed to inspect source: {error}"))?;
                if is_link_or_reparse_point(&metadata) {
                    return Err(format!("Symlink source entry is not allowed: {source}"));
                }
                if metadata.is_dir() {
                    let containment_root = fs::canonicalize(source_path)
                        .map_err(|error| format!("Failed to resolve source: {error}"))?;
                    let archive_root =
                        fs::canonicalize(source_path.parent().unwrap_or_else(|| Path::new(".")))
                            .map_err(|error| format!("Failed to resolve archive root: {error}"))?;
                    let entries = collect_files(source_path)
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
                        fs::canonicalize(source_path.parent().unwrap_or_else(|| Path::new(".")))
                            .map_err(|error| format!("Failed to resolve archive root: {error}"))?;
                    let containment_root = archive_root.clone();
                    append_source_entry(
                        zip,
                        source_path,
                        &containment_root,
                        &archive_root,
                        totals,
                        zip::write::SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Deflated),
                    )?;
                } else {
                    return Err(format!("Unsupported source type: {source}"));
                }
            }
            Ok(())
        })?;
        Ok(dest)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

pub async fn extract_item(archive: String, dest: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || extract_archive_to_directory(&archive, &dest))
        .await
        .map_err(|error| format!("Task join error: {error}"))?
}

#[tauri::command]
pub async fn create_managed_backup(
    app: AppHandle,
    server_id: String,
    backup_name: String,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
) -> Result<String, String> {
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
    create_backup(
        app,
        server_id,
        backup_name,
        source.to_string_lossy().to_string(),
        backup.to_string_lossy().to_string(),
        sources,
        compression_level,
    )
    .await
}

#[tauri::command]
pub async fn restore_managed_backup(
    app: AppHandle,
    server_id: String,
    backup_name: String,
) -> Result<(), String> {
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
        server_id: Some(server_id),
        relative_path: String::new(),
    };
    let archive = resolve_managed_request(&app_data_dir, &archive_request, false)?;
    let target = resolve_managed_request(&app_data_dir, &target_request, false)?;
    restore_backup(
        app,
        archive.to_string_lossy().to_string(),
        target.to_string_lossy().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn compress_managed_items(
    app: AppHandle,
    sources: Vec<ManagedPathRequest>,
    destination: ManagedPathRequest,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let source_paths = sources
        .iter()
        .map(|request| {
            resolve_managed_request(&app_data_dir, request, false)
                .map(|path| path.to_string_lossy().to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let destination = resolve_managed_request(&app_data_dir, &destination, true)?;
    compress_item(source_paths, destination.to_string_lossy().to_string()).await
}

#[tauri::command]
pub async fn extract_managed_item(
    app: AppHandle,
    archive: ManagedPathRequest,
    destination: ManagedPathRequest,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let archive = resolve_managed_request(&app_data_dir, &archive, false)?;
    let destination = resolve_managed_request(&app_data_dir, &destination, true)?;
    extract_item(
        archive.to_string_lossy().to_string(),
        destination.to_string_lossy().to_string(),
    )
    .await
}

/// Recursively collect regular files and directories without following symlinks.
fn collect_files(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let root_canonical = fs::canonicalize(dir)?;
    let mut files = Vec::new();
    collect_files_internal(dir, &root_canonical, &mut files)?;
    Ok(files)
}

fn collect_files_internal(dir: &Path, root: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    let directory_metadata = fs::symlink_metadata(dir)?;
    if is_link_or_reparse_point(&directory_metadata) || !directory_metadata.is_dir() {
        return Err(limit_error("source directory is not a real directory"));
    }
    let canonical = fs::canonicalize(dir)?;
    if !canonical.starts_with(root) {
        return Err(limit_error("source entry escapes source directory"));
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if is_link_or_reparse_point(&metadata) {
            return Err(limit_error("symlink source entry is not allowed"));
        }
        let entry_canonical = fs::canonicalize(&path)?;
        if !entry_canonical.starts_with(root) {
            return Err(limit_error("source entry escapes source directory"));
        }
        files.push(path.clone());
        if u64::try_from(files.len()).unwrap_or(u64::MAX) > ARCHIVE_POLICY.max_entries {
            return Err(limit_error(
                "archive entry count exceeds the configured limit",
            ));
        }
        if metadata.is_dir() {
            collect_files_internal(&path, root, files)?;
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
}
