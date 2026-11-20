//! Safe extraction of Java runtime archives (`.tar.gz` on macOS and Linux,
//! `.zip` on Windows). Entries must be strict relative paths, links are
//! refused, entry count, depth, name length, total size and compression ratio
//! are capped, and only execute bits are restored from archive modes.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use crate::download::CancelFlag;
use crate::managed_path::is_link_or_reparse_point;

const MAX_JAVA_ARCHIVE_ENTRIES: usize = 100_000;
const MAX_JAVA_UNCOMPRESSED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_JAVA_ENTRY_NAME_BYTES: usize = 255;
const MAX_JAVA_ENTRY_DEPTH: usize = 32;
const MAX_JAVA_COMPRESSION_RATIO: u64 = 100;
const COPY_BUFFER_SIZE: usize = 64 * 1024;

/// Archive formats Adoptium publishes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArchiveKind {
    TarGz,
    Zip,
}

impl ArchiveKind {
    pub fn for_os(os: &str) -> Self {
        if os == "windows" {
            Self::Zip
        } else {
            Self::TarGz
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::TarGz => "tar.gz",
            Self::Zip => "zip",
        }
    }
}

pub(crate) const CANCELLED_MESSAGE: &str = "Java installation was cancelled";

fn check_cancel(cancel: Option<&CancelFlag>) -> Result<(), String> {
    if cancel.is_some_and(CancelFlag::is_cancelled) {
        Err(CANCELLED_MESSAGE.to_string())
    } else {
        Ok(())
    }
}

/// Extracts `archive_path` into the existing directory `dest_dir` and returns
/// the Java home found inside it.
pub fn extract(
    kind: ArchiveKind,
    archive_path: &Path,
    dest_dir: &Path,
    cancel: Option<&CancelFlag>,
) -> Result<PathBuf, String> {
    match kind {
        ArchiveKind::TarGz => extract_tar_gz(archive_path, dest_dir, cancel),
        ArchiveKind::Zip => extract_zip_archive(archive_path, dest_dir, cancel),
    }
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

fn output_file(parent: &Path, relative: &Path) -> Result<PathBuf, String> {
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
    Ok(output)
}

fn extract_tar_gz(
    archive_path: &Path,
    destination: &Path,
    cancel: Option<&CancelFlag>,
) -> Result<PathBuf, String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let compressed_size = std::fs::metadata(archive_path)
        .map_err(|error| format!("Failed to inspect Java archive: {error}"))?
        .len();
    let file = std::fs::File::open(archive_path)
        .map_err(|error| format!("Failed to open archive: {error}"))?;
    let mut archive = Archive::new(GzDecoder::new(file));
    let mut total = 0_u64;
    let mut entries = 0_usize;
    let mut paths = HashMap::new();

    for entry in archive
        .entries()
        .map_err(|error| format!("Failed to read tar archive: {error}"))?
    {
        check_cancel(cancel)?;
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
        if is_directory {
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
        let output = output_file(&parent, &relative)?;
        let mut output_file = std::fs::File::create(&output)
            .map_err(|error| format!("Failed to create Java file: {error}"))?;
        let expected_size = entry.size();
        copy_java_entry(&mut entry, &mut output_file, expected_size, &mut total)?;
        restore_java_execute_bits(&output, archive_mode)?;
    }
    if archive_ratio_exceeded(total, compressed_size) {
        return Err("Java archive compression ratio exceeds the limit".to_string());
    }
    Ok(find_java_home(destination))
}

fn extract_zip_archive(
    archive_path: &Path,
    destination: &Path,
    cancel: Option<&CancelFlag>,
) -> Result<PathBuf, String> {
    let compressed_size = std::fs::metadata(archive_path)
        .map_err(|error| format!("Failed to inspect Java archive: {error}"))?
        .len();
    let file = std::fs::File::open(archive_path)
        .map_err(|error| format!("Failed to open archive: {error}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|error| format!("Failed to read zip: {error}"))?;
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

    let mut actual_total = 0_u64;
    for (index, relative) in safe_entries.into_iter().enumerate() {
        check_cancel(cancel)?;
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Zip entry error: {error}"))?;
        if entry.is_dir() {
            ensure_java_directory(destination, Some(&relative))?;
            continue;
        }
        let archive_mode = entry.unix_mode().unwrap_or(0);
        let parent = ensure_java_directory(destination, relative.parent())?;
        let output = output_file(&parent, &relative)?;
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

    Ok(find_java_home(destination))
}

/// The JDK folder inside an extracted archive (`Contents/Home` on macOS), or
/// the extraction folder itself when no JDK folder is recognized.
fn find_java_home(dir: &Path) -> PathBuf {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("jdk") || name.contains("java") || name.contains("temurin") {
                    let contents_home = entry_path.join("Contents").join("Home");
                    if contents_home.exists() {
                        return contents_home;
                    }
                    return entry_path;
                }
            }
        }
    }
    dir.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn unsafe_entry_names_are_refused() {
        for name in ["../evil", "/abs/path", "a\\b", "c:evil", "", "a/../../b"] {
            assert!(safe_archive_entry_name(name).is_err(), "{name}");
        }
        assert!(safe_archive_entry_name("jdk-21/bin/java").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn archive_execute_bits_are_restored_without_special_permissions() {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};

        assert_eq!(safe_java_file_mode(0o7600, 0o7777), 0o711);
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("java");
        std::fs::write(&path, "java binary").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o7600)).unwrap();
        restore_java_execute_bits(&path, 0o7777).unwrap();
        let mode = std::fs::metadata(&path).unwrap().mode() & 0o7777;
        assert_eq!(
            mode, 0o711,
            "setuid, setgid, and sticky bits must be removed"
        );
    }

    #[test]
    fn tar_links_are_refused_and_cancellation_stops_extraction() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("jdk.tar.gz");
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
            std::fs::File::create(&archive).unwrap(),
            flate2::Compression::default(),
        ));
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        builder
            .append_link(&mut header, "jdk-21/bin/java", "/bin/sh")
            .unwrap();
        builder.into_inner().unwrap().finish().unwrap();
        let out = dir.path().join("out");
        std::fs::create_dir(&out).unwrap();
        let error = extract(ArchiveKind::TarGz, &archive, &out, None).unwrap_err();
        assert!(error.contains("links"), "{error}");

        let cancel = CancelFlag::new();
        cancel.cancel();
        let error = extract(ArchiveKind::TarGz, &archive, &out, Some(&cancel)).unwrap_err();
        assert_eq!(error, CANCELLED_MESSAGE);
    }
}
