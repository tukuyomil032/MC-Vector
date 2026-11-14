//! File operations inside managed storage (the Files view).
//!
//! Callers resolve paths with `managed_path::resolve_managed_request`, so
//! every path here is already inside a managed root. These functions refuse
//! symbolic links and reparse points, never overwrite an existing entry when
//! moving or creating, and write files through a temporary file and a rename.

use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::external_copy::{
    copy_external_entry, preflight_import_tree, ImportBudget, ImportError, StagingGuard,
    MAX_IMPORT_DURATION,
};
use crate::managed_path::{is_link_or_reparse_point, ManagedPathRequest, ManagedRoot};

/// Largest text file the editor reads or writes.
pub const MAX_TEXT_BYTES: u64 = 16 * 1024 * 1024;
/// Most entries one import may pick.
pub const MAX_IMPORT_TOP_LEVEL_ENTRIES: usize = 1024;
/// Longest a folder-size walk may run before it reports a partial total.
pub const DIRECTORY_SIZE_BUDGET: Duration = Duration::from_secs(3);

/// Why a file operation failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilesErrorKind {
    AlreadyExists,
    TooLarge,
    NotText,
    InvalidName,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilesError {
    pub kind: FilesErrorKind,
    pub message: String,
}

impl FilesError {
    fn new(kind: FilesErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
    fn io(message: impl Into<String>) -> Self {
        Self::new(FilesErrorKind::Io, message)
    }
}

impl fmt::Display for FilesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl From<FilesError> for String {
    fn from(error: FilesError) -> Self {
        error.message
    }
}

impl From<ImportError> for FilesError {
    fn from(error: ImportError) -> Self {
        Self::io(error.message)
    }
}

/// One entry of a listed folder (Tauri `list_dir_with_metadata` shape).
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct FileEntry {
    pub name: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub size: u64,
    /// Modification time, seconds since the Unix epoch.
    pub modified: u64,
}

/// The folder a managed root lives in.
pub fn managed_root_dir(data_dir: &Path, root: ManagedRoot) -> PathBuf {
    match root {
        ManagedRoot::Servers => data_dir.join("servers"),
        ManagedRoot::Java => data_dir.join("java"),
        ManagedRoot::Ngrok => data_dir.join("ngrok"),
        ManagedRoot::Backups => data_dir.join("backups"),
    }
}

/// Refuses an operation on the managed root itself (it needs a child entry).
pub fn reject_managed_root_target(
    data_dir: &Path,
    request: &ManagedPathRequest,
    target: &Path,
) -> Result<(), FilesError> {
    if target == managed_root_dir(data_dir, request.root) {
        return Err(FilesError::new(
            FilesErrorKind::InvalidName,
            "Managed path must identify a child entry",
        ));
    }
    Ok(())
}

/// A new file or folder name: not empty, no separators or control characters.
pub fn validate_entry_name(name: &str) -> Result<String, FilesError> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.len() > 255
        || trimmed
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\' | ':'))
    {
        return Err(FilesError::new(
            FilesErrorKind::InvalidName,
            "The name is empty or uses unsupported characters",
        ));
    }
    Ok(trimmed.to_owned())
}

fn directory_metadata_error(error: &std::io::Error) -> FilesError {
    if error.kind() == std::io::ErrorKind::NotFound {
        FilesError::io("Directory does not exist")
    } else {
        FilesError::io(format!("Failed to inspect directory metadata: {error}"))
    }
}

/// Lists a folder: folders first, then files, each by name (case-insensitive).
pub fn list_directory(dir_path: &Path) -> Result<Vec<FileEntry>, FilesError> {
    let metadata =
        std::fs::symlink_metadata(dir_path).map_err(|error| directory_metadata_error(&error))?;
    if is_link_or_reparse_point(&metadata) {
        return Err(FilesError::io(
            "Refusing to list a symbolic link or reparse point",
        ));
    }
    if !metadata.is_dir() {
        return Err(FilesError::io("Path is not a directory"));
    }

    let mut entries = Vec::new();
    for entry in std::fs::read_dir(dir_path)
        .map_err(|error| FilesError::io(format!("Failed to read directory: {error}")))?
    {
        let entry =
            entry.map_err(|error| FilesError::io(format!("Failed to read entry: {error}")))?;
        let metadata = entry
            .path()
            .symlink_metadata()
            .map_err(|error| FilesError::io(format!("Failed to get metadata: {error}")))?;
        let is_directory = metadata.is_dir() && !is_link_or_reparse_point(&metadata);
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_directory,
            size: if is_directory { 0 } else { metadata.len() },
            modified,
        });
    }
    entries.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

/// Writes `content` through a temporary file and a rename, keeping the old
/// file until the new one is in place.
pub fn atomic_write(destination: &Path, content: &[u8]) -> Result<(), FilesError> {
    if content.len() as u64 > MAX_TEXT_BYTES {
        return Err(FilesError::new(
            FilesErrorKind::TooLarge,
            "Managed text file exceeds the write size limit",
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| FilesError::io("Managed file has no parent"))?;
    let parent_metadata = std::fs::symlink_metadata(parent).map_err(|error| {
        FilesError::io(format!("Failed to inspect managed file parent: {error}"))
    })?;
    if is_link_or_reparse_point(&parent_metadata) || !parent_metadata.is_dir() {
        return Err(FilesError::io(
            "Managed file parent is not a real directory",
        ));
    }

    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("managed-file");
    let temp = destination.with_file_name(format!(".{name}.write-{}", Uuid::new_v4()));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| {
            FilesError::io(format!(
                "Failed to create managed file staging path: {error}"
            ))
        })?;
    let write_result = file
        .write_all(content)
        .and_then(|()| file.flush())
        .and_then(|()| file.sync_all())
        .map_err(|error| FilesError::io(format!("Failed to write managed file: {error}")));
    drop(file);
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }

    let rollback = destination.with_file_name(format!(".{name}rollback-{}", Uuid::new_v4()));
    let existing = match std::fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
                let _ = std::fs::remove_file(&temp);
                return Err(FilesError::io("Managed destination is not a regular file"));
            }
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            return Err(FilesError::io(format!(
                "Failed to inspect managed destination: {error}"
            )));
        }
    };
    if existing {
        std::fs::rename(destination, &rollback).map_err(|error| {
            let _ = std::fs::remove_file(&temp);
            FilesError::io(format!("Failed to stage existing managed file: {error}"))
        })?;
    }
    match std::fs::rename(&temp, destination) {
        Ok(()) => {
            if existing {
                let _ = std::fs::remove_file(rollback);
            }
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_file(&temp);
            if existing && std::fs::rename(&rollback, destination).is_err() {
                return Err(FilesError::io(format!(
                    "Failed to write managed file and restore the previous file; manual recovery required: {error}"
                )));
            }
            Err(FilesError::io(format!(
                "Failed to commit managed file: {error}"
            )))
        }
    }
}

fn exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn already_exists(path: &Path) -> FilesError {
    FilesError::new(
        FilesErrorKind::AlreadyExists,
        format!(
            "An item with the same name already exists: {}",
            path.file_name()
                .map(|name| name.to_string_lossy())
                .unwrap_or_default()
        ),
    )
}

/// Creates a folder (and missing parents). With `must_be_new`, an existing
/// entry at `target` is an error instead of a silent success.
pub fn create_directory(target: &Path, must_be_new: bool) -> Result<(), FilesError> {
    if must_be_new && exists(target) {
        return Err(already_exists(target));
    }
    std::fs::create_dir_all(target)
        .map_err(|error| FilesError::io(format!("Failed to create managed directory: {error}")))
}

/// Creates an empty file; never replaces an existing entry.
pub fn create_file(target: &Path) -> Result<(), FilesError> {
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map(|_| ())
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                already_exists(target)
            } else {
                FilesError::io(format!("Failed to create managed file: {error}"))
            }
        })
}

/// Deletes a file or a folder tree; refuses links.
pub fn delete_entry(target: &Path) -> Result<(), FilesError> {
    let metadata = std::fs::symlink_metadata(target)
        .map_err(|error| FilesError::io(format!("Failed to inspect managed path: {error}")))?;
    if is_link_or_reparse_point(&metadata) {
        return Err(FilesError::io(
            "Refusing to delete a symbolic link or reparse point",
        ));
    }
    if metadata.is_dir() {
        std::fs::remove_dir_all(target)
            .map_err(|error| FilesError::io(format!("Failed to delete managed directory: {error}")))
    } else {
        std::fs::remove_file(target)
            .map_err(|error| FilesError::io(format!("Failed to delete managed file: {error}")))
    }
}

/// Moves or renames an entry. An existing destination is never replaced
/// (rename(2) would silently overwrite a file).
pub fn move_entry(source: &Path, destination: &Path) -> Result<(), FilesError> {
    let source_metadata = std::fs::symlink_metadata(source)
        .map_err(|error| FilesError::io(format!("Failed to inspect managed source: {error}")))?;
    if is_link_or_reparse_point(&source_metadata) {
        return Err(FilesError::io(
            "Refusing to move a symbolic link or reparse point",
        ));
    }
    if source == destination {
        return Ok(());
    }
    // A case-only rename on a case-insensitive volume reports the source itself.
    let same_entry = destination
        .canonicalize()
        .ok()
        .zip(source.canonicalize().ok())
        .is_some_and(|(left, right)| left == right);
    if exists(destination) && !same_entry {
        return Err(already_exists(destination));
    }
    if source_metadata.is_dir() && destination.starts_with(source) {
        return Err(FilesError::new(
            FilesErrorKind::InvalidName,
            "A folder cannot be moved into itself",
        ));
    }
    std::fs::rename(source, destination)
        .map_err(|error| FilesError::io(format!("Failed to move managed path: {error}")))
}

/// Folder size, as React shows it: bytes, and whether the walk finished.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySize {
    pub bytes: u64,
    /// False when the time budget ran out or part of the tree could not be read.
    pub complete: bool,
}

/// Sums the regular files under `root`, skipping (never following) links.
pub fn directory_size_within(root: &Path, budget: Duration) -> Result<DirectorySize, FilesError> {
    let metadata =
        std::fs::symlink_metadata(root).map_err(|error| directory_metadata_error(&error))?;
    if is_link_or_reparse_point(&metadata) {
        return Err(FilesError::io(
            "Refusing to measure a symbolic link or reparse point",
        ));
    }
    if !metadata.is_dir() {
        return Err(FilesError::io("Path is not a directory"));
    }
    let deadline = Instant::now() + budget;
    let mut bytes = 0_u64;
    let mut complete = true;
    let mut pending = vec![root.to_path_buf()];
    'walk: while let Some(directory) = pending.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if directory.as_path() == root => {
                return Err(FilesError::io(format!("Failed to read directory: {error}")));
            }
            Err(_) => {
                complete = false;
                continue;
            }
        };
        for entry in entries {
            if Instant::now() >= deadline {
                complete = false;
                break 'walk;
            }
            let Ok(entry) = entry else {
                complete = false;
                continue;
            };
            let Ok(metadata) = entry.metadata() else {
                complete = false;
                continue;
            };
            if is_link_or_reparse_point(&metadata) {
                continue;
            }
            if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                bytes = bytes.saturating_add(metadata.len());
            }
        }
    }
    Ok(DirectorySize { bytes, complete })
}

// ---------------------------------------------------------------------------
// Text documents (the editor)

/// The line endings a document uses.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineEnding {
    Lf,
    Crlf,
    /// Both appear; the document is saved with LF where the editor joined lines.
    Mixed,
}

/// A text file as the editor shows it: without a BOM, with `\n` line breaks,
/// plus what it takes to write it back byte-for-byte compatible.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextDocument {
    pub text: String,
    pub has_bom: bool,
    pub line_ending: LineEnding,
}

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

/// Reads a text file of at most [`MAX_TEXT_BYTES`]; files that are not UTF-8
/// are refused as `NotText`.
pub fn read_text_document(path: &Path) -> Result<TextDocument, FilesError> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| FilesError::io(format!("Failed to read file: {error}")))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_file() {
        return Err(FilesError::io("Path is not a regular file"));
    }
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(FilesError::new(
            FilesErrorKind::TooLarge,
            "The file is too large to edit",
        ));
    }
    let bytes = std::fs::read(path)
        .map_err(|error| FilesError::io(format!("Failed to read file: {error}")))?;
    let (has_bom, body) = match bytes.strip_prefix(UTF8_BOM) {
        Some(rest) => (true, rest),
        None => (false, bytes.as_slice()),
    };
    let raw = String::from_utf8(body.to_vec())
        .map_err(|_| FilesError::new(FilesErrorKind::NotText, "The file is not UTF-8 text"))?;
    let crlf = raw.matches("\r\n").count();
    let lf = raw.matches('\n').count() - crlf;
    let line_ending = match (crlf, lf) {
        (0, _) => LineEnding::Lf,
        (_, 0) => LineEnding::Crlf,
        _ => LineEnding::Mixed,
    };
    let text = if crlf > 0 {
        raw.replace("\r\n", "\n")
    } else {
        raw
    };
    Ok(TextDocument {
        text,
        has_bom,
        line_ending,
    })
}

/// Writes an edited document back with its BOM and line endings.
pub fn write_text_document(path: &Path, document: &TextDocument) -> Result<(), FilesError> {
    let body = match document.line_ending {
        LineEnding::Crlf => document.text.replace("\r\n", "\n").replace('\n', "\r\n"),
        LineEnding::Lf | LineEnding::Mixed => document.text.clone(),
    };
    let mut bytes = Vec::with_capacity(body.len() + 3);
    if document.has_bom {
        bytes.extend_from_slice(UTF8_BOM);
    }
    bytes.extend_from_slice(body.as_bytes());
    atomic_write(path, &bytes)
}

/// Reads a managed text file as a string (Tauri `read_managed_text_file`),
/// with the same size limit as writing.
pub fn read_text_file(path: &Path) -> Result<String, FilesError> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| FilesError::io(format!("Failed to read file: {error}")))?;
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(FilesError::new(
            FilesErrorKind::TooLarge,
            "The file is too large to read",
        ));
    }
    std::fs::read_to_string(path)
        .map_err(|error| FilesError::io(format!("Failed to read file: {error}")))
}

// ---------------------------------------------------------------------------
// Import

/// One imported entry, relative to the folder it was imported into.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImportedEntry {
    pub name: String,
    pub is_directory: bool,
    pub size: u64,
}

fn rollback_import_entries(committed: &[(PathBuf, PathBuf)]) -> bool {
    let mut success = true;
    for (destination, staged) in committed.iter().rev() {
        if std::fs::rename(destination, staged).is_err() {
            success = false;
        }
    }
    success
}

/// Copies picked files and folders into `destination` (a managed folder under
/// the canonical `managed_root`). Everything is staged first; nothing is
/// placed if a name already exists there.
pub fn import_entries(
    destination: &Path,
    managed_root: &Path,
    sources: Vec<PathBuf>,
) -> Result<Vec<ImportedEntry>, FilesError> {
    if sources.len() > MAX_IMPORT_TOP_LEVEL_ENTRIES {
        return Err(FilesError::new(
            FilesErrorKind::TooLarge,
            "Import exceeds the selected-entry limit",
        ));
    }
    let destination_metadata = std::fs::symlink_metadata(destination).map_err(|error| {
        FilesError::io(format!("Failed to inspect import destination: {error}"))
    })?;
    if is_link_or_reparse_point(&destination_metadata) || !destination_metadata.is_dir() {
        return Err(FilesError::io(
            "Import destination must be a managed directory",
        ));
    }
    let staging = destination.with_file_name(format!(".import-{}", Uuid::new_v4()));
    std::fs::create_dir(&staging).map_err(|error| {
        FilesError::io(format!(
            "Failed to create import staging directory: {error}"
        ))
    })?;
    let mut staging_guard = StagingGuard::new(staging.clone());
    let deadline = Instant::now() + MAX_IMPORT_DURATION;
    let mut budget = ImportBudget::with_deadline(deadline);
    let mut imported = Vec::with_capacity(sources.len());
    let mut staged_entries = Vec::with_capacity(sources.len());
    for source in sources {
        budget.check_deadline()?;
        let name = source
            .file_name()
            .ok_or_else(|| FilesError::io("Selected source has no file name"))?
            .to_os_string();
        if exists(&destination.join(&name)) {
            return Err(already_exists(&destination.join(&name)));
        }
        preflight_import_tree(&source, &mut ImportBudget::with_deadline(deadline))?;
        let staged_path = staging.join(&name);
        let (is_directory, size, _) =
            copy_external_entry(&source, &staged_path, managed_root, &mut budget)?;
        imported.push(ImportedEntry {
            name: name.to_string_lossy().to_string(),
            is_directory,
            size,
        });
        staged_entries.push((name, staged_path));
    }

    let mut committed = Vec::with_capacity(staged_entries.len());
    for (name, staged_path) in staged_entries {
        budget.check_deadline()?;
        let destination_path = destination.join(&name);
        if exists(&destination_path) {
            if !rollback_import_entries(&committed) {
                staging_guard.disarm();
                return Err(FilesError::io(
                    "Import destination changed and rollback failed; manual recovery required",
                ));
            }
            return Err(already_exists(&destination_path));
        }
        if let Err(error) = std::fs::rename(&staged_path, &destination_path) {
            if !rollback_import_entries(&committed) {
                staging_guard.disarm();
                return Err(FilesError::io(format!(
                    "Import commit failed and rollback also failed; manual recovery required: {error}"
                )));
            }
            return Err(FilesError::io(format!(
                "Failed to commit imported entry: {error}"
            )));
        }
        committed.push((destination_path, staged_path));
    }
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().canonicalize().unwrap();
        (dir, path)
    }

    #[test]
    fn lists_folders_first_then_names() {
        let (_d, root) = dir();
        std::fs::write(root.join("b.txt"), "b").unwrap();
        std::fs::write(root.join("A.txt"), "a").unwrap();
        std::fs::create_dir(root.join("zeta")).unwrap();
        let names: Vec<_> = list_directory(&root)
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, ["zeta", "A.txt", "b.txt"]);
    }

    #[test]
    fn move_never_replaces_an_existing_destination() {
        let (_d, root) = dir();
        std::fs::write(root.join("a.txt"), "a").unwrap();
        std::fs::write(root.join("b.txt"), "b").unwrap();
        let error = move_entry(&root.join("a.txt"), &root.join("b.txt")).unwrap_err();
        assert_eq!(error.kind, FilesErrorKind::AlreadyExists);
        assert_eq!(std::fs::read_to_string(root.join("b.txt")).unwrap(), "b");
        move_entry(&root.join("a.txt"), &root.join("c.txt")).unwrap();
        assert!(root.join("c.txt").exists());
        std::fs::create_dir(root.join("folder")).unwrap();
        assert!(move_entry(&root.join("folder"), &root.join("folder/inner")).is_err());
    }

    #[test]
    fn create_file_and_folder_do_not_overwrite() {
        let (_d, root) = dir();
        std::fs::write(root.join("keep.txt"), "keep").unwrap();
        assert_eq!(
            create_file(&root.join("keep.txt")).unwrap_err().kind,
            FilesErrorKind::AlreadyExists
        );
        assert_eq!(
            std::fs::read_to_string(root.join("keep.txt")).unwrap(),
            "keep"
        );
        create_file(&root.join("new.txt")).unwrap();
        create_directory(&root.join("dir"), true).unwrap();
        assert_eq!(
            create_directory(&root.join("dir"), true).unwrap_err().kind,
            FilesErrorKind::AlreadyExists
        );
        create_directory(&root.join("dir"), false).unwrap();
    }

    #[test]
    fn documents_keep_bom_and_crlf_byte_for_byte() {
        let (_d, root) = dir();
        let path = root.join("server.properties");
        let original = b"\xEF\xBB\xBFmotd=Hi\r\nserver-port=25565\r\n".to_vec();
        std::fs::write(&path, &original).unwrap();
        let document = read_text_document(&path).unwrap();
        assert!(document.has_bom);
        assert_eq!(document.line_ending, LineEnding::Crlf);
        assert_eq!(document.text, "motd=Hi\nserver-port=25565\n");
        write_text_document(&path, &document).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), original);

        let edited = TextDocument {
            text: "motd=Bye\nserver-port=25565\n".into(),
            ..document
        };
        write_text_document(&path, &edited).unwrap();
        assert_eq!(
            std::fs::read(&path).unwrap(),
            b"\xEF\xBB\xBFmotd=Bye\r\nserver-port=25565\r\n"
        );
    }

    #[test]
    fn documents_refuse_binary_and_mixed_endings_are_reported() {
        let (_d, root) = dir();
        std::fs::write(root.join("level.dat"), [0xff_u8, 0xfe, 0x00]).unwrap();
        assert_eq!(
            read_text_document(&root.join("level.dat"))
                .unwrap_err()
                .kind,
            FilesErrorKind::NotText
        );
        std::fs::write(root.join("mixed.txt"), "a\r\nb\n").unwrap();
        assert_eq!(
            read_text_document(&root.join("mixed.txt"))
                .unwrap()
                .line_ending,
            LineEnding::Mixed
        );
    }

    #[test]
    fn names_reject_separators_and_dots() {
        for bad in ["", " ", ".", "..", "a/b", "a\\b", "a:b"] {
            assert!(validate_entry_name(bad).is_err(), "{bad:?}");
        }
        assert_eq!(validate_entry_name(" plugins ").unwrap(), "plugins");
    }

    #[test]
    fn imports_copy_picked_entries_and_refuse_name_clashes() {
        let (_s, source_root) = dir();
        std::fs::write(source_root.join("plugin.jar"), "jar").unwrap();
        std::fs::create_dir(source_root.join("world")).unwrap();
        std::fs::write(source_root.join("world/level.dat"), "lvl").unwrap();
        let (_m, managed) = dir();
        let destination = managed.join("server");
        std::fs::create_dir(&destination).unwrap();
        let imported = import_entries(
            &destination,
            &managed,
            vec![source_root.join("plugin.jar"), source_root.join("world")],
        )
        .unwrap();
        assert_eq!(imported.len(), 2);
        assert_eq!(
            std::fs::read_to_string(destination.join("world/level.dat")).unwrap(),
            "lvl"
        );
        let error = import_entries(&destination, &managed, vec![source_root.join("plugin.jar")])
            .unwrap_err();
        assert_eq!(error.kind, FilesErrorKind::AlreadyExists);
    }

    #[test]
    fn directory_size_counts_files_and_skips_links() {
        let (_d, root) = dir();
        std::fs::write(root.join("a"), "12345").unwrap();
        std::fs::create_dir(root.join("sub")).unwrap();
        std::fs::write(root.join("sub/b"), "123").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc/hosts", root.join("link")).unwrap();
        let size = directory_size_within(&root, Duration::from_secs(3)).unwrap();
        assert_eq!(
            size,
            DirectorySize {
                bytes: 8,
                complete: true
            }
        );
    }
}
