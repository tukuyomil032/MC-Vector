//! Copying user-selected files and folders into managed storage.
//!
//! Sources come from outside MC-Vector (a folder picker), so every step is
//! defensive: sources must be real files or folders (no symbolic links or
//! reparse points at any depth), are re-checked while copying, and are bounded
//! by an [`ImportBudget`] (file count, total and per-file size, depth, time).
//! Destinations must stay inside the canonical managed root and are created
//! with `create_new`, so nothing existing is overwritten.

use std::fmt;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use crate::download::CancelFlag;
use crate::managed_path::{
    canonical_path_starts_with, has_link_or_reparse_point_component, is_link_or_reparse_point,
};

pub const MAX_IMPORT_TEXT_BYTES: u64 = 1024 * 1024;
pub const MAX_IMPORT_FILES: u64 = 100_000;
pub const MAX_IMPORT_TOTAL_BYTES: u64 = 8 * 1024 * 1024 * 1024;
pub const MAX_IMPORT_SINGLE_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const MAX_IMPORT_DEPTH: usize = 32;
pub const MAX_IMPORT_DURATION: Duration = Duration::from_secs(5 * 60);

/// Why a copy from outside managed storage failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportErrorKind {
    /// Too many files, too many bytes, or too deep.
    TooLarge,
    /// The source is not a real file or folder, contains links, or changed.
    InvalidSource,
    /// The copy took longer than [`MAX_IMPORT_DURATION`].
    TimedOut,
    /// The caller cancelled the copy.
    Cancelled,
    /// A file operation failed.
    Io,
}

/// A failed import. The message is English and may be logged.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportError {
    pub kind: ImportErrorKind,
    pub message: String,
}

impl ImportError {
    pub fn new(kind: ImportErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
    pub fn too_large(message: impl Into<String>) -> Self {
        Self::new(ImportErrorKind::TooLarge, message)
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(ImportErrorKind::InvalidSource, message)
    }
    pub fn io(message: impl Into<String>) -> Self {
        Self::new(ImportErrorKind::Io, message)
    }
}

impl fmt::Display for ImportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ImportError {}

impl From<ImportError> for String {
    fn from(error: ImportError) -> Self {
        error.message
    }
}

/// Limits shared by one import: files, bytes, the deadline and cancellation.
pub struct ImportBudget {
    pub file_count: u64,
    pub byte_size: u64,
    deadline: Instant,
    cancel: Option<CancelFlag>,
}

impl ImportBudget {
    /// A budget that ends [`MAX_IMPORT_DURATION`] from now.
    pub fn new() -> Self {
        Self::with_deadline(Instant::now() + MAX_IMPORT_DURATION)
    }

    pub fn with_deadline(deadline: Instant) -> Self {
        Self {
            file_count: 0,
            byte_size: 0,
            deadline,
            cancel: None,
        }
    }

    /// Stops the copy between files when `cancel` is set.
    pub fn with_cancel(mut self, cancel: Option<CancelFlag>) -> Self {
        self.cancel = cancel;
        self
    }

    pub fn check_deadline(&self) -> Result<(), ImportError> {
        if self.cancel.as_ref().is_some_and(CancelFlag::is_cancelled) {
            return Err(ImportError::new(
                ImportErrorKind::Cancelled,
                "Import was cancelled",
            ));
        }
        if Instant::now() > self.deadline {
            Err(ImportError::new(
                ImportErrorKind::TimedOut,
                "Import exceeded the time limit",
            ))
        } else {
            Ok(())
        }
    }

    pub fn reserve_file(&mut self, size: u64) -> Result<(), ImportError> {
        self.check_deadline()?;
        if size > MAX_IMPORT_SINGLE_FILE_BYTES {
            return Err(ImportError::too_large(
                "Import file exceeds the single-file size limit",
            ));
        }
        let next_count = self
            .file_count
            .checked_add(1)
            .ok_or_else(|| ImportError::too_large("Import file count overflowed"))?;
        if next_count > MAX_IMPORT_FILES {
            return Err(ImportError::too_large(
                "Import exceeds the file count limit",
            ));
        }
        let next_bytes = self
            .byte_size
            .checked_add(size)
            .ok_or_else(|| ImportError::too_large("Import byte count overflowed"))?;
        if next_bytes > MAX_IMPORT_TOTAL_BYTES {
            return Err(ImportError::too_large(
                "Import exceeds the aggregate size limit",
            ));
        }
        self.file_count = next_count;
        self.byte_size = next_bytes;
        Ok(())
    }
}

impl Default for ImportBudget {
    fn default() -> Self {
        Self::new()
    }
}

/// Removes a staging folder unless disarmed.
pub struct StagingGuard {
    path: PathBuf,
    armed: bool,
}

impl StagingGuard {
    pub fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for StagingGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

/// Reads a small text file from an import source; `None` for links,
/// non-files, files over [`MAX_IMPORT_TEXT_BYTES`] and unreadable files.
pub fn read_import_text(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if is_link_or_reparse_point(&metadata)
        || !metadata.is_file()
        || metadata.len() > MAX_IMPORT_TEXT_BYTES
    {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// A picker selection resolved without following links.
pub struct ResolvedPickerEntry {
    pub path: PathBuf,
    pub metadata: std::fs::Metadata,
}

/// Resolves a picked path: absolute, normalized, a real file or folder, with
/// a parent that is not a link.
pub fn resolve_picker_entry(source: &Path) -> Result<ResolvedPickerEntry, ImportError> {
    if !source.is_absolute()
        || source
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(ImportError::invalid(
            "Selected source must be an absolute, normalized path",
        ));
    }
    let source_name = source
        .file_name()
        .ok_or_else(|| ImportError::invalid("Selected source has no file name"))?;
    if source_name.is_empty()
        || source_name == "."
        || source_name == ".."
        || source_name.to_string_lossy().chars().any(char::is_control)
    {
        return Err(ImportError::invalid(
            "Selected source has an unsafe file name",
        ));
    }
    let source_parent = source
        .parent()
        .ok_or_else(|| ImportError::invalid("Selected source has no parent"))?;
    if has_link_or_reparse_point_component(source_parent).map_err(|error| {
        ImportError::io(format!("Failed to inspect selected source parent: {error}"))
    })? {
        return Err(ImportError::invalid(
            "Selected source parent must not be a symbolic link or reparse point",
        ));
    }
    let canonical_parent = std::fs::canonicalize(source_parent).map_err(|error| {
        ImportError::io(format!("Failed to resolve selected source parent: {error}"))
    })?;
    if !canonical_parent.is_absolute() {
        return Err(ImportError::invalid(
            "Selected source parent must resolve to an absolute path",
        ));
    }

    let entry = std::fs::read_dir(&canonical_parent)
        .map_err(|error| {
            ImportError::io(format!("Failed to inspect selected source parent: {error}"))
        })?
        .find_map(|entry| {
            let entry = entry.ok()?;
            (entry.file_name() == source_name).then_some(entry)
        })
        .ok_or_else(|| ImportError::invalid("Selected source no longer exists"))?;
    let metadata = std::fs::symlink_metadata(entry.path())
        .map_err(|error| ImportError::io(format!("Failed to inspect selected source: {error}")))?;
    if is_link_or_reparse_point(&metadata) {
        return Err(ImportError::invalid(
            "Selected source must not be a symbolic link or reparse point",
        ));
    }
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(ImportError::invalid(
            "Selected source must be a file or directory",
        ));
    }
    Ok(ResolvedPickerEntry {
        path: entry.path(),
        metadata,
    })
}

fn preflight_import_entry(
    source: &Path,
    source_root: &Path,
    metadata: std::fs::Metadata,
    depth: usize,
    budget: &mut ImportBudget,
) -> Result<(), ImportError> {
    budget.check_deadline()?;
    if depth > MAX_IMPORT_DEPTH {
        return Err(ImportError::too_large(
            "Import directory depth exceeds the limit",
        ));
    }
    if is_link_or_reparse_point(&metadata) {
        return Err(ImportError::invalid(
            "Selected source must not contain a symbolic link or reparse point",
        ));
    }
    let canonical_source = source.canonicalize().map_err(|error| {
        ImportError::io(format!("Failed to resolve selected directory: {error}"))
    })?;
    if !canonical_source.starts_with(source_root) {
        return Err(ImportError::invalid(
            "Selected source escaped its import root",
        ));
    }
    if metadata.is_dir() {
        for entry in std::fs::read_dir(&canonical_source).map_err(|error| {
            ImportError::io(format!("Failed to read selected directory: {error}"))
        })? {
            let entry = entry.map_err(|error| {
                ImportError::io(format!("Failed to read selected entry: {error}"))
            })?;
            let child_path = entry.path();
            let child_metadata = std::fs::symlink_metadata(entry.path()).map_err(|error| {
                ImportError::io(format!("Failed to inspect selected entry: {error}"))
            })?;
            preflight_import_entry(&child_path, source_root, child_metadata, depth + 1, budget)?;
        }
        Ok(())
    } else if metadata.is_file() {
        budget.reserve_file(metadata.len())
    } else {
        Err(ImportError::invalid(
            "Selected source must be a regular file or directory",
        ))
    }
}

/// Walks the whole source once before copying, so limits and links are
/// rejected before anything is written.
pub fn preflight_import_tree(source: &Path, budget: &mut ImportBudget) -> Result<(), ImportError> {
    let resolved = resolve_picker_entry(source)?;
    let source_root = resolved.path.canonicalize().map_err(|error| {
        ImportError::io(format!("Failed to resolve selected source root: {error}"))
    })?;
    preflight_import_entry(&resolved.path, &source_root, resolved.metadata, 0, budget)
}

/// Checks a new destination: inside `managed_root`, a safe name, a real parent,
/// and nothing there yet.
pub fn resolve_managed_destination(
    destination: &Path,
    managed_root: &Path,
) -> Result<PathBuf, ImportError> {
    if !destination.is_absolute()
        || !managed_root.is_absolute()
        || destination
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
        || managed_root
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(ImportError::invalid(
            "Import destination is outside the managed root",
        ));
    }
    let managed_root_metadata = std::fs::symlink_metadata(managed_root).map_err(|error| {
        ImportError::io(format!("Failed to inspect managed import root: {error}"))
    })?;
    if is_link_or_reparse_point(&managed_root_metadata) || !managed_root_metadata.is_dir() {
        return Err(ImportError::invalid(
            "Import destination root must be a real directory",
        ));
    }
    if has_link_or_reparse_point_component(managed_root).map_err(|error| {
        ImportError::io(format!("Failed to inspect managed import root: {error}"))
    })? {
        return Err(ImportError::invalid(
            "Import destination root must not contain a symbolic link or reparse point",
        ));
    }
    let canonical_root = std::fs::canonicalize(managed_root).map_err(|error| {
        ImportError::io(format!("Failed to resolve managed import root: {error}"))
    })?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| ImportError::invalid("Import destination has no parent"))?;
    if has_link_or_reparse_point_component(destination_parent).map_err(|error| {
        ImportError::io(format!(
            "Failed to inspect import destination parent: {error}"
        ))
    })? {
        return Err(ImportError::invalid(
            "Import destination parent must not contain a symbolic link or reparse point",
        ));
    }
    let canonical_parent = std::fs::canonicalize(destination_parent).map_err(|error| {
        ImportError::io(format!(
            "Failed to resolve import destination parent: {error}"
        ))
    })?;
    if !canonical_parent.is_absolute()
        || !canonical_path_starts_with(&canonical_parent, &canonical_root)
    {
        return Err(ImportError::invalid(
            "Import destination parent is outside the managed root",
        ));
    }
    let destination_name = destination
        .file_name()
        .ok_or_else(|| ImportError::invalid("Import destination has no file name"))?;
    if destination_name.is_empty()
        || destination_name == "."
        || destination_name == ".."
        || destination_name
            .to_string_lossy()
            .chars()
            .any(char::is_control)
    {
        return Err(ImportError::invalid(
            "Import destination has an unsafe file name",
        ));
    }
    if std::fs::read_dir(&canonical_parent)
        .map_err(|error| {
            ImportError::io(format!(
                "Failed to inspect import destination parent: {error}"
            ))
        })?
        .find_map(|entry| {
            let entry = entry.ok()?;
            (entry.file_name() == destination_name).then_some(entry)
        })
        .is_some()
    {
        return Err(ImportError::io(format!(
            "An item with the same name already exists: {}",
            destination_name.to_string_lossy()
        )));
    }
    let resolved = canonical_parent.join(destination_name);
    if !canonical_path_starts_with(&resolved, &canonical_root) {
        return Err(ImportError::invalid(
            "Import destination is outside the managed root",
        ));
    }
    Ok(resolved)
}

/// Copies one picked entry (file or folder tree) to `destination`. Returns
/// `(is_directory, bytes, files)`.
pub fn copy_external_entry(
    source: &Path,
    destination: &Path,
    managed_root: &Path,
    budget: &mut ImportBudget,
) -> Result<(bool, u64, u64), ImportError> {
    let source = resolve_picker_entry(source)?;
    let source_root = source.path.canonicalize().map_err(|error| {
        ImportError::io(format!("Failed to resolve selected source root: {error}"))
    })?;
    let destination = resolve_managed_destination(destination, managed_root)?;
    copy_resolved_entry(
        source.path,
        source.metadata,
        destination,
        managed_root,
        &source_root,
        budget,
        0,
    )
}

fn copy_resolved_entry(
    source: PathBuf,
    metadata: std::fs::Metadata,
    destination: PathBuf,
    managed_root: &Path,
    source_root: &Path,
    budget: &mut ImportBudget,
    depth: usize,
) -> Result<(bool, u64, u64), ImportError> {
    budget.check_deadline()?;
    if depth > MAX_IMPORT_DEPTH {
        return Err(ImportError::too_large(
            "Import directory depth exceeds the limit",
        ));
    }
    let canonical_source = source
        .canonicalize()
        .map_err(|error| ImportError::io(format!("Failed to resolve selected source: {error}")))?;
    if !canonical_source.is_absolute() {
        return Err(ImportError::invalid(
            "Selected source resolved to a non-absolute path",
        ));
    }
    if !canonical_source.starts_with(source_root) {
        return Err(ImportError::invalid(
            "Selected source escaped its import root",
        ));
    }

    let current_metadata = std::fs::symlink_metadata(&canonical_source)
        .map_err(|error| ImportError::io(format!("Failed to recheck selected source: {error}")))?;
    if is_link_or_reparse_point(&current_metadata)
        || current_metadata.is_dir() != metadata.is_dir()
        || current_metadata.is_file() != metadata.is_file()
    {
        return Err(ImportError::invalid(
            "Selected source changed during import",
        ));
    }

    if metadata.is_dir() {
        std::fs::create_dir(&destination).map_err(|error| {
            ImportError::io(format!("Failed to create imported directory: {error}"))
        })?;
        let mut byte_size = 0_u64;
        let mut file_count = 0_u64;
        for entry in std::fs::read_dir(&canonical_source).map_err(|error| {
            ImportError::io(format!("Failed to read selected directory: {error}"))
        })? {
            budget.check_deadline()?;
            let entry = entry.map_err(|error| {
                ImportError::io(format!("Failed to read selected entry: {error}"))
            })?;
            let child_metadata = std::fs::symlink_metadata(entry.path()).map_err(|error| {
                ImportError::io(format!("Failed to inspect selected entry: {error}"))
            })?;
            if is_link_or_reparse_point(&child_metadata) {
                return Err(ImportError::invalid(
                    "Selected source must not contain a symbolic link or reparse point",
                ));
            }
            let child_destination =
                resolve_managed_destination(&destination.join(entry.file_name()), managed_root)?;
            let (_, child_size, child_count) = copy_resolved_entry(
                entry.path(),
                child_metadata,
                child_destination,
                managed_root,
                source_root,
                budget,
                depth + 1,
            )?;
            byte_size = byte_size
                .checked_add(child_size)
                .ok_or_else(|| ImportError::too_large("Import byte count overflowed"))?;
            file_count = file_count
                .checked_add(child_count)
                .ok_or_else(|| ImportError::too_large("Import file count overflowed"))?;
        }
        Ok((true, byte_size, file_count))
    } else {
        let expected_size = metadata.len();
        budget.reserve_file(expected_size)?;
        let mut input = std::fs::File::open(&canonical_source)
            .map_err(|error| ImportError::io(format!("Failed to open selected file: {error}")))?;
        let mut output = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
            .map_err(|error| ImportError::io(format!("Failed to create imported file: {error}")))?;
        if let Err(error) = copy_file_contents(&mut input, &mut output, expected_size) {
            drop(output);
            let _ = std::fs::remove_file(&destination);
            return Err(error);
        }
        output
            .flush()
            .map_err(|error| ImportError::io(format!("Failed to flush imported file: {error}")))?;
        output
            .sync_all()
            .map_err(|error| ImportError::io(format!("Failed to sync imported file: {error}")))?;
        drop(output);
        let destination_metadata = std::fs::symlink_metadata(&destination)
            .map_err(|error| ImportError::io(format!("Failed to verify imported file: {error}")))?;
        if is_link_or_reparse_point(&destination_metadata) || !destination_metadata.is_file() {
            let _ = std::fs::remove_file(&destination);
            return Err(ImportError::invalid("Imported file is not a regular file"));
        }
        if destination_metadata.len() != expected_size {
            let _ = std::fs::remove_file(&destination);
            return Err(ImportError::invalid("Selected file changed during import"));
        }
        Ok((false, expected_size, 1))
    }
}

fn copy_file_contents(
    input: &mut std::fs::File,
    output: &mut std::fs::File,
    expected_size: u64,
) -> Result<(), ImportError> {
    let mut buffer = [0_u8; 64 * 1024];
    let mut copied = 0_u64;
    loop {
        let read = input
            .read(&mut buffer)
            .map_err(|error| ImportError::io(format!("Failed to read selected file: {error}")))?;
        if read == 0 {
            break;
        }
        copied = copied
            .checked_add(read as u64)
            .ok_or_else(|| ImportError::too_large("Import byte count overflowed"))?;
        if copied > MAX_IMPORT_SINGLE_FILE_BYTES || copied > expected_size {
            return Err(ImportError::invalid("Selected file changed during import"));
        }
        output
            .write_all(&buffer[..read])
            .map_err(|error| ImportError::io(format!("Failed to copy selected file: {error}")))?;
    }
    if copied != expected_size {
        return Err(ImportError::invalid("Selected file changed during import"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn ordinary_windows_spelling(path: &Path) -> PathBuf {
        let path = path.to_str().expect("temporary path should be Unicode");
        let path = if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{rest}")
        } else if let Some(rest) = path.strip_prefix(r"\\?\") {
            rest.to_owned()
        } else {
            path.to_owned()
        };
        let mut path = path.replace('\\', "/");
        if path.as_bytes().get(1) == Some(&b':') {
            let lower_drive_letter = path[..1].to_ascii_lowercase();
            path.replace_range(..1, &lower_drive_letter);
        }
        PathBuf::from(path)
    }

    #[test]
    fn picker_accepts_an_ordinary_spelling_of_a_real_directory() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("server");
        std::fs::create_dir(&source).unwrap();

        #[cfg(windows)]
        let source = ordinary_windows_spelling(&source.canonicalize().unwrap());
        #[cfg(not(windows))]
        let source = source.canonicalize().unwrap();

        let resolved = resolve_picker_entry(&source).unwrap();
        assert!(resolved.metadata.is_dir());
    }

    #[test]
    fn managed_destination_accepts_an_ordinary_spelling_of_its_root() {
        let directory = tempfile::tempdir().unwrap();
        let canonical_root = directory.path().canonicalize().unwrap();

        #[cfg(windows)]
        let destination_parent = ordinary_windows_spelling(&canonical_root);
        #[cfg(not(windows))]
        let destination_parent = canonical_root.clone();

        let destination = destination_parent.join("new-entry");
        let resolved = resolve_managed_destination(&destination, &canonical_root).unwrap();

        assert_eq!(resolved.file_name(), destination.file_name());
        assert!(canonical_path_starts_with(&resolved, &canonical_root));
    }

    #[test]
    fn import_budget_enforces_file_count_and_size_limits() {
        let mut budget = ImportBudget::new();
        assert_eq!(
            budget
                .reserve_file(MAX_IMPORT_SINGLE_FILE_BYTES + 1)
                .unwrap_err()
                .kind,
            ImportErrorKind::TooLarge
        );

        budget.file_count = MAX_IMPORT_FILES;
        assert!(budget.reserve_file(1).is_err());

        let mut budget = ImportBudget::new();
        budget.byte_size = MAX_IMPORT_TOTAL_BYTES;
        assert!(budget.reserve_file(1).is_err());
    }

    #[test]
    fn budget_reports_timeouts_and_cancellation() {
        let expired = ImportBudget::with_deadline(Instant::now() - Duration::from_secs(1));
        assert_eq!(
            expired.check_deadline().unwrap_err().kind,
            ImportErrorKind::TimedOut
        );
        let cancel = CancelFlag::new();
        let budget = ImportBudget::new().with_cancel(Some(cancel.clone()));
        assert!(budget.check_deadline().is_ok());
        cancel.cancel();
        assert_eq!(
            budget.check_deadline().unwrap_err().kind,
            ImportErrorKind::Cancelled
        );
    }

    #[test]
    fn copies_a_tree_and_refuses_existing_destinations() {
        let source_dir = tempfile::tempdir().unwrap();
        let source = source_dir.path().canonicalize().unwrap().join("server");
        std::fs::create_dir_all(source.join("world/region")).unwrap();
        std::fs::write(source.join("server.jar"), b"jar").unwrap();
        std::fs::write(source.join("world/region/r.0.0.mca"), b"region").unwrap();

        let managed_dir = tempfile::tempdir().unwrap();
        let managed = managed_dir.path().canonicalize().unwrap();
        let destination = managed.join("copy");
        let (is_directory, bytes, files) =
            copy_external_entry(&source, &destination, &managed, &mut ImportBudget::new()).unwrap();
        assert!(is_directory);
        assert_eq!((bytes, files), (9, 2));
        assert_eq!(
            std::fs::read(destination.join("world/region/r.0.0.mca")).unwrap(),
            b"region"
        );
        assert!(
            copy_external_entry(&source, &destination, &managed, &mut ImportBudget::new()).is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_symlink_in_the_selected_source_parent() {
        let parent = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let parent = parent.path().canonicalize().unwrap();
        let target = target.path().canonicalize().unwrap();
        std::fs::create_dir(target.join("server")).unwrap();
        let linked_parent = parent.join("linked-parent");
        std::os::unix::fs::symlink(&target, &linked_parent).unwrap();

        let error = resolve_picker_entry(&linked_parent.join("server"))
            .err()
            .expect("a symlink parent must be refused");
        assert_eq!(error.kind, ImportErrorKind::InvalidSource);
    }

    #[cfg(windows)]
    #[test]
    fn rejects_a_junction_in_the_selected_source_parent() {
        use std::process::Command;

        let parent_dir = tempfile::tempdir().unwrap();
        let target_dir = tempfile::tempdir().unwrap();
        // cmd's mklink does not accept the \\?\ form that canonicalize returns,
        // so the junction is made from the plain temp paths.
        let parent = parent_dir.path().to_path_buf();
        let target = target_dir.path().to_path_buf();
        std::fs::create_dir(target.join("server")).unwrap();
        let junction = parent.join("linked-parent");
        // Separate arguments: Rust escapes embedded quotes as \" for the C
        // runtime, which cmd.exe does not understand.
        let output = Command::new("cmd")
            .arg("/C")
            .arg("mklink")
            .arg("/J")
            .arg(&junction)
            .arg(&target)
            .output()
            .expect("cmd should run mklink");
        assert!(
            output.status.success(),
            "junction creation failed: {} stdout={} stderr={}",
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );

        let error = resolve_picker_entry(&junction.join("server"))
            .err()
            .expect("a junction parent must be refused");
        assert_eq!(error.kind, ImportErrorKind::InvalidSource);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_links_anywhere_in_the_source() {
        let source_dir = tempfile::tempdir().unwrap();
        let source = source_dir.path().canonicalize().unwrap().join("server");
        std::fs::create_dir_all(source.join("world")).unwrap();
        std::os::unix::fs::symlink("/etc", source.join("world/escape")).unwrap();
        let error = preflight_import_tree(&source, &mut ImportBudget::new()).unwrap_err();
        assert_eq!(error.kind, ImportErrorKind::InvalidSource);
    }
}
