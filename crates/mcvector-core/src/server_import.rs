//! Importing an existing server folder.
//!
//! [`ImportManager::begin`] analyzes a folder the user picked and returns an
//! [`ImportAnalysis`] with an opaque token; the folder path stays in the
//! manager. [`ImportManager::import_step`] turns the token into the
//! [`ImportStep`] that `server_creation::create_server` runs to copy the folder
//! into the new `servers/<uuid>`.
//!
//! Tokens expire after [`TOKEN_TTL`], at most [`MAX_PENDING_IMPORTS`] are kept,
//! and a token is given back when a copy fails (other than by cancellation),
//! so the user can retry without picking the folder again.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::download::CancelFlag;
use crate::error::{CoreError, CoreErrorCode};
use crate::external_copy::{
    copy_external_entry, preflight_import_tree, read_import_text, ImportBudget, ImportError,
    ImportErrorKind, StagingGuard, MAX_IMPORT_DURATION,
};
use crate::managed_path::{
    is_link_or_reparse_point, resolve_managed_request, validate_server_id, ManagedPathRequest,
    ManagedRoot,
};
use crate::server_creation::ImportStep;

/// How long a picked folder stays importable.
pub const TOKEN_TTL: Duration = Duration::from_secs(30 * 60);
/// How many picked folders can wait at once; the oldest is dropped beyond it.
pub const MAX_PENDING_IMPORTS: usize = 16;

/// What MC-Vector found in a picked folder.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImportAnalysis {
    pub token: String,
    pub folder_name: String,
    /// The server jar used for detection (sorted by name; `bundler.jar` excluded).
    pub jar_name: Option<String>,
    /// `None` when the jar name does not name a known software.
    pub detected_software: Option<String>,
    pub detected_version: Option<String>,
    /// `server-port` from `server.properties`.
    pub detected_port: Option<u32>,
    pub eula_accepted: bool,
}

struct PendingImport {
    source: PathBuf,
    expires_at: Instant,
}

/// Picked folders waiting to be imported.
#[derive(Clone, Default)]
pub struct ImportManager {
    pending: Arc<Mutex<HashMap<String, PendingImport>>>,
}

fn session_expired() -> CoreError {
    CoreError::new(
        CoreErrorCode::ImportSessionExpired,
        "The selected folder is no longer available for import; choose it again",
    )
}

/// Maps a copy or analysis failure to a user-facing code.
pub fn import_error(error: ImportError) -> CoreError {
    let code = match error.kind {
        ImportErrorKind::TooLarge => CoreErrorCode::ImportTooLarge,
        ImportErrorKind::InvalidSource => CoreErrorCode::ImportInvalidFolder,
        ImportErrorKind::TimedOut => CoreErrorCode::ImportTimedOut,
        ImportErrorKind::Cancelled => CoreErrorCode::OperationCancelled,
        ImportErrorKind::Io => CoreErrorCode::ServerOperationFailed,
    };
    CoreError::new(code, error.message)
}

impl ImportManager {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, PendingImport>> {
        self.pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Analyzes `source` (blocking: it walks the folder) and keeps it under a
    /// new token.
    pub fn begin(&self, source: &Path) -> Result<ImportAnalysis, CoreError> {
        let mut analysis = analyze_import_folder(source).map_err(import_error)?;
        let token = Uuid::new_v4().to_string();
        analysis.token = token.clone();
        self.insert(token, source.to_owned());
        Ok(analysis)
    }

    fn insert(&self, token: String, source: PathBuf) {
        let now = Instant::now();
        let mut pending = self.lock();
        pending.retain(|_, import| import.expires_at > now);
        while pending.len() >= MAX_PENDING_IMPORTS {
            let Some(oldest) = pending
                .iter()
                .min_by_key(|(_, import)| import.expires_at)
                .map(|(token, _)| token.clone())
            else {
                break;
            };
            pending.remove(&oldest);
        }
        pending.insert(
            token,
            PendingImport {
                source,
                expires_at: now + TOKEN_TTL,
            },
        );
    }

    /// Forgets a token. Unknown tokens are ignored.
    pub fn cancel(&self, token: &str) {
        self.lock().remove(token.trim());
    }

    /// Drops expired tokens.
    pub fn sweep_expired(&self) {
        let now = Instant::now();
        self.lock().retain(|_, import| import.expires_at > now);
    }

    fn take(&self, token: &str) -> Result<PathBuf, CoreError> {
        let now = Instant::now();
        let import = self
            .lock()
            .remove(token.trim())
            .ok_or_else(session_expired)?;
        if import.expires_at <= now {
            return Err(session_expired());
        }
        Ok(import.source)
    }

    /// True while `token` can still be imported.
    pub fn contains(&self, token: &str) -> bool {
        let now = Instant::now();
        self.lock()
            .get(token.trim())
            .is_some_and(|import| import.expires_at > now)
    }

    /// The step `create_server` runs to fill the new server folder. A failed
    /// copy gives the token back; success and cancellation consume it.
    pub fn import_step(&self, token: String, cancel: Option<CancelFlag>) -> ImportStep {
        let manager = self.clone();
        Box::new(move |data_dir: &Path, server_id: &str| {
            let source = manager.take(&token)?;
            let result = copy_import_into_server(data_dir, &source, server_id, cancel);
            if let Err(error) = &result {
                if error.code != CoreErrorCode::OperationCancelled {
                    manager.insert(token, source);
                }
            }
            result
        })
    }
}

// ---------------------------------------------------------------------------
// Analysis

/// Software named by a jar file, checked in this order (`neoforge` before `forge`).
const SOFTWARE_PATTERNS: [(&str, &str); 13] = [
    ("paper", "Paper"),
    ("purpur", "Purpur"),
    ("leaf", "LeafMC"),
    ("spigot", "Spigot"),
    ("craftbukkit", "CraftBukkit"),
    ("neoforge", "NeoForge"),
    ("fabric", "Fabric"),
    ("forge", "Forge"),
    ("velocity", "Velocity"),
    ("waterfall", "Waterfall"),
    ("bungeecord", "BungeeCord"),
    ("vanilla", "Vanilla"),
    ("minecraft_server", "Vanilla"),
];

pub fn detect_import_software(jar_name: &str) -> Option<&'static str> {
    let lower = jar_name.to_ascii_lowercase();
    SOFTWARE_PATTERNS
        .iter()
        .find(|(pattern, _)| lower.contains(pattern))
        .map(|(_, software)| *software)
}

/// The first `1.N[.M]` in `value`.
pub fn detect_import_version(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    for start in 0..bytes.len().saturating_sub(2) {
        if bytes[start] != b'1' || bytes[start + 1] != b'.' {
            continue;
        }
        let mut end = start + 2;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
        if end > start + 2 {
            if end < bytes.len() && bytes[end] == b'.' {
                let second_start = end + 1;
                let mut second_end = second_start;
                while second_end < bytes.len() && bytes[second_end].is_ascii_digit() {
                    second_end += 1;
                }
                if second_end > second_start {
                    end = second_end;
                }
            }
            return Some(value[start..end].to_string());
        }
    }
    None
}

/// `key=value` from a properties text, ignoring comments.
fn property<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    content.lines().find_map(|line| {
        let line = line.trim();
        if line.starts_with('#') || line.starts_with('!') {
            return None;
        }
        let (name, value) = line.split_once('=')?;
        (name.trim() == key).then(|| value.trim())
    })
}

/// Analyzes a picked folder without copying it. The returned token is empty;
/// [`ImportManager::begin`] fills it in.
pub fn analyze_import_folder(source: &Path) -> Result<ImportAnalysis, ImportError> {
    preflight_import_tree(source, &mut ImportBudget::new())?;
    let source_metadata = std::fs::symlink_metadata(source).map_err(|error| {
        ImportError::io(format!("Failed to inspect selected server folder: {error}"))
    })?;
    if is_link_or_reparse_point(&source_metadata) || !source_metadata.is_dir() {
        return Err(ImportError::invalid(
            "Selected server folder must be a real directory",
        ));
    }

    let folder_name = source
        .file_name()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| ImportError::invalid("Selected server folder has no usable name"))?;

    let mut jar_names = Vec::new();
    for entry in std::fs::read_dir(source).map_err(|error| {
        ImportError::io(format!("Failed to read selected server folder: {error}"))
    })? {
        let entry = entry
            .map_err(|error| ImportError::io(format!("Failed to read selected entry: {error}")))?;
        let metadata = entry.metadata().map_err(|error| {
            ImportError::io(format!("Failed to inspect selected entry: {error}"))
        })?;
        if is_link_or_reparse_point(&metadata) {
            return Err(ImportError::invalid(
                "Selected server folder contains a symbolic link or reparse point",
            ));
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if metadata.is_file()
            && name.to_ascii_lowercase().ends_with(".jar")
            && name != "bundler.jar"
        {
            jar_names.push(name);
        }
    }
    // Deterministic choice: a jar that names its software wins, then by name.
    jar_names.sort();
    let jar_name = jar_names
        .iter()
        .find(|name| detect_import_software(name).is_some())
        .or_else(|| jar_names.first())
        .cloned();

    let properties = read_import_text(&source.join("server.properties"));
    let detected_version = jar_name
        .as_deref()
        .and_then(detect_import_version)
        .or_else(|| properties.as_deref().and_then(detect_import_version));
    let detected_port = properties
        .as_deref()
        .and_then(|content| property(content, "server-port"))
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|port| (1..=65_535).contains(port));

    let eula_accepted = read_import_text(&source.join("eula.txt"))
        .and_then(|content| {
            property(&content, "eula").map(|value| value.eq_ignore_ascii_case("true"))
        })
        .unwrap_or(false);

    Ok(ImportAnalysis {
        token: String::new(),
        folder_name,
        detected_software: jar_name
            .as_deref()
            .and_then(detect_import_software)
            .map(str::to_owned),
        jar_name,
        detected_version,
        detected_port,
        eula_accepted,
    })
}

// ---------------------------------------------------------------------------
// Copy

/// Copies `source` into the empty, freshly created `servers/<serverId>`
/// through a sibling staging folder, then swaps it into place.
fn copy_import_into_server(
    data_dir: &Path,
    source: &Path,
    server_id: &str,
    cancel: Option<CancelFlag>,
) -> Result<(), CoreError> {
    let io = |message: String| CoreError::new(CoreErrorCode::ServerOperationFailed, message);
    let server_id = validate_server_id(server_id).map_err(io)?;
    let destination_request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.clone()),
        relative_path: String::new(),
    };
    let destination = resolve_managed_request(data_dir, &destination_request, false).map_err(io)?;
    let managed_root = std::fs::canonicalize(data_dir.join("servers"))
        .map_err(|error| io(format!("Failed to resolve managed servers root: {error}")))?;
    let destination_metadata = std::fs::symlink_metadata(&destination).map_err(|error| {
        io(format!(
            "Failed to inspect managed import destination: {error}"
        ))
    })?;
    if is_link_or_reparse_point(&destination_metadata) || !destination_metadata.is_dir() {
        return Err(io(
            "Managed import destination must be a real directory".to_string()
        ));
    }
    let is_empty = |path: &Path| -> Result<bool, CoreError> {
        Ok(std::fs::read_dir(path)
            .map_err(|error| {
                io(format!(
                    "Failed to inspect managed import destination: {error}"
                ))
            })?
            .next()
            .is_none())
    };
    if !is_empty(&destination)? {
        return Err(io("Managed import destination must be empty".to_string()));
    }

    let deadline = Instant::now() + MAX_IMPORT_DURATION;
    preflight_import_tree(
        source,
        &mut ImportBudget::with_deadline(deadline).with_cancel(cancel.clone()),
    )
    .map_err(import_error)?;
    let staging = destination.with_file_name(format!(".{server_id}.import-{}", Uuid::new_v4()));
    std::fs::create_dir(&staging).map_err(|error| {
        io(format!(
            "Failed to create import staging directory: {error}"
        ))
    })?;
    let mut staging_guard = StagingGuard::new(staging.clone());
    let mut budget = ImportBudget::with_deadline(deadline).with_cancel(cancel);
    for entry in std::fs::read_dir(source)
        .map_err(|error| io(format!("Failed to read selected server folder: {error}")))?
    {
        budget.check_deadline().map_err(import_error)?;
        let entry = entry.map_err(|error| io(format!("Failed to read selected entry: {error}")))?;
        copy_external_entry(
            &entry.path(),
            &staging.join(entry.file_name()),
            &managed_root,
            &mut budget,
        )
        .map_err(import_error)?;
    }
    budget.check_deadline().map_err(import_error)?;

    if !is_empty(&destination)? {
        return Err(io(
            "Managed import destination changed during import".to_string()
        ));
    }
    let rollback =
        destination.with_file_name(format!(".{server_id}.import-rollback-{}", Uuid::new_v4()));
    std::fs::rename(&destination, &rollback)
        .map_err(|error| io(format!("Failed to stage empty import destination: {error}")))?;
    match std::fs::rename(&staging, &destination) {
        Ok(()) => {
            staging_guard.disarm();
            let _ = std::fs::remove_dir_all(rollback);
            Ok(())
        }
        Err(error) => {
            if std::fs::rename(&rollback, &destination).is_err() {
                staging_guard.disarm();
                return Err(io(format!(
                    "Import commit failed and destination recovery also failed; manual recovery required: {error}"
                )));
            }
            Err(io(format!("Failed to commit server import: {error}")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(files: &[(&str, &[u8])]) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap().join("my-server");
        std::fs::create_dir(&root).unwrap();
        for (name, content) in files {
            let path = root.join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, content).unwrap();
        }
        (dir, root)
    }

    fn data_dir() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().canonicalize().unwrap();
        std::fs::create_dir(path.join("servers")).unwrap();
        (dir, path)
    }

    #[test]
    fn detects_software_version_port_and_eula() {
        let (_dir, root) = folder(&[
            ("paper-1.21.4-123.jar", b"jar"),
            (
                "server.properties",
                b"#comment\nserver-port=25600\nmotd=1.8 server\n",
            ),
            ("eula.txt", b"eula=TRUE\n"),
        ]);
        let analysis = analyze_import_folder(&root).unwrap();
        assert_eq!(analysis.folder_name, "my-server");
        assert_eq!(analysis.jar_name.as_deref(), Some("paper-1.21.4-123.jar"));
        assert_eq!(analysis.detected_software.as_deref(), Some("Paper"));
        assert_eq!(analysis.detected_version.as_deref(), Some("1.21.4"));
        assert_eq!(analysis.detected_port, Some(25_600));
        assert!(analysis.eula_accepted);
    }

    #[test]
    fn a_plain_server_jar_is_unknown_and_named_jars_win_deterministically() {
        let (_dir, root) = folder(&[("server.jar", b"jar"), ("bundler.jar", b"x")]);
        let analysis = analyze_import_folder(&root).unwrap();
        assert_eq!(analysis.jar_name.as_deref(), Some("server.jar"));
        assert_eq!(analysis.detected_software, None);
        assert_eq!(analysis.detected_version, None);
        assert!(!analysis.eula_accepted);

        let (_dir, root) = folder(&[
            ("server.jar", b"jar"),
            ("purpur-1.20.6.jar", b"jar"),
            ("fabric-server-launch.jar", b"jar"),
        ]);
        let analysis = analyze_import_folder(&root).unwrap();
        assert_eq!(
            analysis.jar_name.as_deref(),
            Some("fabric-server-launch.jar")
        );
        assert_eq!(analysis.detected_software.as_deref(), Some("Fabric"));
    }

    #[test]
    fn version_falls_back_to_server_properties() {
        let (_dir, root) = folder(&[
            ("server.jar", b"jar"),
            (
                "server.properties",
                b"motd=Running 1.20.1\nserver-port=99999\n",
            ),
        ]);
        let analysis = analyze_import_folder(&root).unwrap();
        assert_eq!(analysis.detected_version.as_deref(), Some("1.20.1"));
        assert_eq!(analysis.detected_port, None);
    }

    #[test]
    fn tokens_are_single_use_expire_and_are_capped() {
        let (_dir, root) = folder(&[("paper.jar", b"jar")]);
        let manager = ImportManager::default();
        let analysis = manager.begin(&root).unwrap();
        assert!(manager.contains(&analysis.token));
        manager.cancel(&analysis.token);
        assert!(!manager.contains(&analysis.token));

        for _ in 0..MAX_PENDING_IMPORTS + 4 {
            manager.begin(&root).unwrap();
        }
        assert_eq!(manager.lock().len(), MAX_PENDING_IMPORTS);

        let expired = manager.begin(&root).unwrap().token;
        manager.lock().get_mut(&expired).unwrap().expires_at = Instant::now();
        assert_eq!(
            manager.take(&expired).unwrap_err().code,
            CoreErrorCode::ImportSessionExpired
        );
    }

    #[test]
    fn imports_into_the_new_server_folder_and_consumes_the_token() {
        let (_source_dir, root) = folder(&[("paper.jar", b"jar"), ("world/level.dat", b"level")]);
        let (_data, data) = data_dir();
        std::fs::create_dir(data.join("servers/server-id")).unwrap();
        let manager = ImportManager::default();
        let token = manager.begin(&root).unwrap().token;

        manager.import_step(token.clone(), None)(&data, "server-id").unwrap();
        assert_eq!(
            std::fs::read(data.join("servers/server-id/world/level.dat")).unwrap(),
            b"level"
        );
        assert!(
            root.join("paper.jar").exists(),
            "the source is left untouched"
        );
        assert!(!manager.contains(&token));
        let leftovers: Vec<_> = std::fs::read_dir(data.join("servers"))
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.file_name())
            .collect();
        assert_eq!(leftovers, ["server-id"]);
    }

    #[test]
    fn a_failed_copy_gives_the_token_back_and_a_cancel_consumes_it() {
        let (_source_dir, root) = folder(&[("paper.jar", b"jar")]);
        let (_data, data) = data_dir();
        let manager = ImportManager::default();
        let token = manager.begin(&root).unwrap().token;

        // The destination folder does not exist: the copy fails.
        assert!(manager.import_step(token.clone(), None)(&data, "missing").is_err());
        assert!(manager.contains(&token), "the user can retry");

        std::fs::create_dir(data.join("servers/server-id")).unwrap();
        let cancel = CancelFlag::new();
        cancel.cancel();
        let error =
            manager.import_step(token.clone(), Some(cancel))(&data, "server-id").unwrap_err();
        assert_eq!(error.code, CoreErrorCode::OperationCancelled);
        assert!(!manager.contains(&token));
        let names: Vec<_> = std::fs::read_dir(data.join("servers"))
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.file_name())
            .collect();
        assert_eq!(names, ["server-id"], "no staging folder is left behind");
        assert!(std::fs::read_dir(data.join("servers/server-id"))
            .unwrap()
            .next()
            .is_none());
    }
}
