use std::path::{Path, PathBuf};

/// The only storage roots this command module may access.
///
/// `Servers` requires a server ID and resolves below `servers/<serverId>`.
/// The other roots are application-managed shared storage locations.
#[derive(Clone, Copy, Debug, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ManagedRoot {
    Servers,
    Java,
    Ngrok,
    Backups,
}

/// An IPC-safe location. No command in this module accepts a caller-provided
/// absolute filesystem path.
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPathRequest {
    pub root: ManagedRoot,
    #[serde(default)]
    pub server_id: Option<String>,
    pub relative_path: String,
}

pub fn is_link_or_reparse_point(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }

    #[cfg(not(windows))]
    false
}

/// Removes the verbatim prefix that `canonicalize` adds on Windows, so the result
/// can be compared with a path spelled the usual way (`\\?\UNC\host` → `\\host`).
#[cfg_attr(not(windows), allow(dead_code))]
fn strip_verbatim_prefix(path: &str) -> std::borrow::Cow<'_, str> {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        std::borrow::Cow::Owned(format!(r"\\{rest}"))
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        std::borrow::Cow::Borrowed(rest)
    } else {
        std::borrow::Cow::Borrowed(path)
    }
}

/// Reports whether `canonicalize(original)` produced the same path as `original`,
/// meaning no component was a link. Windows paths are compared without the
/// verbatim prefix and case-insensitively; non-Unicode paths never match.
pub fn canonical_path_matches(canonical: &Path, original: &Path) -> bool {
    #[cfg(windows)]
    {
        match (canonical.to_str(), original.to_str()) {
            (Some(canonical), Some(original)) => {
                strip_verbatim_prefix(canonical).eq_ignore_ascii_case(original)
            }
            _ => false,
        }
    }

    #[cfg(not(windows))]
    {
        canonical == original
    }
}

pub fn validate_server_id(server_id: &str) -> Result<String, String> {
    let normalized = server_id.trim();
    if normalized.is_empty() {
        return Err("Server ID is empty".to_string());
    }
    if normalized.len() > 128 {
        return Err("Server ID is too long".to_string());
    }
    if normalized.chars().any(char::is_control) {
        return Err("Server ID contains control characters".to_string());
    }
    if matches!(normalized, "." | "..")
        || normalized.contains('/')
        || normalized.contains('\\')
        || normalized.contains(':')
    {
        return Err("Server ID must not contain path separators".to_string());
    }

    Ok(normalized.to_string())
}

fn is_absolute_like(path: &str) -> bool {
    let bytes = path.as_bytes();
    path.starts_with('/')
        || path.starts_with('\\')
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
}

#[cfg(test)]
fn validated_relative_path(path: &str) -> Result<PathBuf, String> {
    if path.chars().any(char::is_control) {
        return Err("Relative path contains control characters".to_string());
    }
    if is_absolute_like(path) {
        return Err("Absolute paths are not allowed".to_string());
    }

    let mut relative = PathBuf::new();
    for segment in path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
    {
        if matches!(segment, "." | "..") {
            return Err("Path traversal is not allowed".to_string());
        }
        relative.push(segment);
    }

    Ok(relative)
}

pub fn resolve_managed_request(
    app_data_dir: &Path,
    request: &ManagedPathRequest,
    create_root: bool,
) -> Result<PathBuf, String> {
    let root = request.root;
    let managed_root = match root {
        ManagedRoot::Servers => app_data_dir.join("servers"),
        ManagedRoot::Java => app_data_dir.join("java"),
        ManagedRoot::Ngrok => app_data_dir.join("ngrok"),
        ManagedRoot::Backups => app_data_dir.join("backups"),
    };

    let mut components = Vec::new();
    match root {
        ManagedRoot::Servers | ManagedRoot::Backups => {
            let server_id = request
                .server_id
                .as_deref()
                .ok_or_else(|| "This managed path requires a server ID".to_string())?;
            let server_id = server_id.trim();
            if server_id.is_empty() {
                return Err("Server ID is empty".to_string());
            }
            if server_id.len() > 128 {
                return Err("Server ID is too long".to_string());
            }
            if server_id.chars().any(char::is_control)
                || server_id == "."
                || server_id == ".."
                || server_id.contains('/')
                || server_id.contains('\\')
                || server_id.contains(':')
            {
                return Err("Server ID must be a single safe path component".to_string());
            }
            components.push(server_id.to_string());
        }
        _ => {
            if request.server_id.is_some() {
                return Err("Only server paths may include a server ID".to_string());
            }
        }
    }

    let relative_path = request.relative_path.trim();
    if relative_path.chars().any(char::is_control) {
        return Err("Relative path contains control characters".to_string());
    }
    if is_absolute_like(relative_path) {
        return Err("Absolute paths are not allowed".to_string());
    }
    for segment in relative_path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
    {
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.contains('/')
            || segment.contains('\\')
            || segment.chars().any(char::is_control)
        {
            return Err("Managed path contains an unsafe component".to_string());
        }
        components.push(segment.to_string());
    }

    if create_root {
        std::fs::create_dir_all(&managed_root)
            .map_err(|error| format!("Failed to prepare managed root: {error}"))?;
    }

    let metadata = std::fs::symlink_metadata(&managed_root)
        .map_err(|error| format!("Failed to inspect managed root: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Refusing to access a symbolic-link or reparse-point managed root".to_string());
    }
    if !metadata.is_dir() {
        return Err("Managed root is not a directory".to_string());
    }

    let canonical_root = std::fs::canonicalize(&managed_root)
        .map_err(|error| format!("Failed to resolve managed root: {error}"))?;

    let mut current = canonical_root.clone();
    for (index, component) in components.iter().enumerate() {
        let is_final = index + 1 == components.len();
        let entry = std::fs::read_dir(&current)
            .map_err(|error| format!("Failed to inspect managed path parent: {error}"))?
            .find_map(|entry| {
                let entry = entry.ok()?;
                (entry.file_name() == component.as_str()).then_some(entry)
            });

        if let Some(entry) = entry {
            let metadata = entry
                .metadata()
                .map_err(|error| format!("Failed to inspect managed path component: {error}"))?;
            if is_link_or_reparse_point(&metadata) {
                return Err("Managed path contains a symbolic link or reparse point".to_string());
            }
            if !is_final && !metadata.is_dir() {
                return Err("Managed path parent is not a directory".to_string());
            }
            current = entry.path();
            continue;
        }

        if !is_final {
            return Err("Managed path parent does not exist".to_string());
        }

        // A missing final component is returned for the caller to create. The
        // parent came from a trusted directory entry (or the fixed root), and
        // the component was checked above as one normal path component.
        let candidate = current.join(component);
        if !candidate.starts_with(&canonical_root) {
            return Err("Path is outside the managed root".to_string());
        }
        return Ok(candidate);
    }

    if !current.starts_with(&canonical_root) {
        return Err("Path is outside the managed root".to_string());
    }
    Ok(current)
}

fn resolve_managed_copy_path(
    path: &Path,
    managed_root: &Path,
    allow_missing_final: bool,
) -> Result<PathBuf, String> {
    if !path.is_absolute() || !managed_root.is_absolute() || !path.starts_with(managed_root) {
        return Err("Managed copy path is outside the managed root".to_string());
    }

    let relative = path
        .strip_prefix(managed_root)
        .map_err(|_| "Managed copy path is outside the managed root".to_string())?;
    let components = relative.components().collect::<Vec<_>>();
    if components
        .iter()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("Managed copy path contains an unsafe component".to_string());
    }

    let canonical_root = std::fs::canonicalize(managed_root)
        .map_err(|error| format!("Failed to resolve managed copy root: {error}"))?;
    let mut current = canonical_root.clone();
    for (index, component) in components.iter().enumerate() {
        let is_final = index + 1 == components.len();
        let entry = std::fs::read_dir(&current)
            .map_err(|error| format!("Failed to inspect managed copy parent: {error}"))?
            .find_map(|entry| {
                let entry = entry.ok()?;
                (entry.file_name() == component.as_os_str()).then_some(entry)
            });

        if let Some(entry) = entry {
            let metadata = entry
                .metadata()
                .map_err(|error| format!("Failed to inspect managed copy entry: {error}"))?;
            if is_link_or_reparse_point(&metadata) {
                return Err(
                    "Managed copy path contains a symbolic link or reparse point".to_string(),
                );
            }
            if !is_final && !metadata.is_dir() {
                return Err("Managed copy path parent is not a directory".to_string());
            }
            current = entry.path();
            continue;
        }

        if !is_final || !allow_missing_final {
            return Err("Managed copy path does not exist".to_string());
        }
        let candidate = current.join(component.as_os_str());
        if !candidate.starts_with(&canonical_root) {
            return Err("Managed copy path is outside the managed root".to_string());
        }
        return Ok(candidate);
    }

    if !current.starts_with(&canonical_root) {
        return Err("Managed copy path is outside the managed root".to_string());
    }
    Ok(current)
}

pub fn copy_managed_tree(
    source: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<(), String> {
    let source = resolve_managed_copy_path(source, managed_root, false)?;
    let destination = resolve_managed_copy_path(destination, managed_root, true)?;
    copy_managed_tree_resolved(source, destination, managed_root)
}

fn copy_managed_tree_resolved(
    source: PathBuf,
    destination: PathBuf,
    managed_root: &Path,
) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(&source)
        .map_err(|error| format!("Failed to inspect source entry: {error}"))?;
    if is_link_or_reparse_point(&metadata) {
        return Err("Managed source must not contain a symbolic link or reparse point".to_string());
    }
    if metadata.is_dir() {
        std::fs::create_dir(&destination)
            .map_err(|error| format!("Failed to create copied directory: {error}"))?;
        for entry in std::fs::read_dir(&source)
            .map_err(|error| format!("Failed to read source directory: {error}"))?
        {
            let entry = entry.map_err(|error| format!("Failed to read source entry: {error}"))?;
            let child_name = entry.file_name();
            let child_destination =
                resolve_managed_copy_path(&destination.join(&child_name), managed_root, true)?;
            let child_source =
                resolve_managed_copy_path(&source.join(&child_name), managed_root, false)?;
            copy_managed_tree_resolved(child_source, child_destination, managed_root)?;
        }
    } else if metadata.is_file() {
        std::fs::copy(&source, &destination)
            .map_err(|error| format!("Failed to copy managed file: {error}"))?;
    } else {
        return Err("Managed source must be a regular file or directory".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_path_matches, resolve_managed_request, strip_verbatim_prefix,
        validated_relative_path, ManagedPathRequest, ManagedRoot,
    };

    #[cfg(windows)]
    use std::path::PathBuf;

    #[test]
    fn strip_verbatim_prefix_handles_disk_unc_and_plain_paths() {
        assert_eq!(strip_verbatim_prefix(r"\\?\C:\Users\me"), r"C:\Users\me");
        assert_eq!(
            strip_verbatim_prefix(r"\\?\UNC\host\share\dir"),
            r"\\host\share\dir"
        );
        assert_eq!(strip_verbatim_prefix(r"C:\Users\me"), r"C:\Users\me");
        assert_eq!(strip_verbatim_prefix("/tmp/me"), "/tmp/me");
    }

    #[test]
    fn canonical_path_matches_accepts_the_canonical_form_of_a_real_directory() {
        let directory = tempfile::tempdir().expect("test directory should be created");
        let absolute = std::fs::canonicalize(directory.path()).expect("directory should resolve");
        #[cfg(windows)]
        let original = PathBuf::from(strip_verbatim_prefix(absolute.to_str().unwrap()).as_ref());
        #[cfg(not(windows))]
        let original = absolute.clone();
        assert!(canonical_path_matches(&absolute, &original));
        assert!(!canonical_path_matches(&absolute, &original.join("child")));
    }

    fn server_request(server_id: &str, relative_path: &str) -> ManagedPathRequest {
        ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: Some(server_id.to_string()),
            relative_path: relative_path.to_string(),
        }
    }

    #[test]
    fn resolves_server_relative_path_below_server_id() {
        let app_data = tempfile::tempdir().expect("test directory should be created");
        std::fs::create_dir_all(app_data.path().join("servers/alpha/world"))
            .expect("managed server parent should be created");
        let resolved = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "world/level.dat"),
            true,
        )
        .expect("managed server path should resolve");

        let canonical_app_data = std::fs::canonicalize(app_data.path()).unwrap();
        assert_eq!(
            resolved,
            canonical_app_data.join("servers/alpha/world/level.dat")
        );
    }

    #[test]
    fn resolves_each_shared_managed_root() {
        let app_data = tempfile::tempdir().expect("test directory should be created");
        for root in [ManagedRoot::Java, ManagedRoot::Ngrok] {
            let request = ManagedPathRequest {
                root,
                server_id: None,
                relative_path: "artifact.bin".to_string(),
            };
            let resolved = resolve_managed_request(app_data.path(), &request, true)
                .expect("shared managed root should resolve");
            assert!(resolved.starts_with(std::fs::canonicalize(app_data.path()).unwrap()));
        }
        let request = ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some("alpha".to_string()),
            relative_path: "artifact.bin".to_string(),
        };
        std::fs::create_dir_all(app_data.path().join("backups/alpha"))
            .expect("managed backup parent should be created");
        let resolved = resolve_managed_request(app_data.path(), &request, true)
            .expect("backup managed root should resolve");
        assert!(resolved.starts_with(std::fs::canonicalize(app_data.path()).unwrap()));
    }

    #[test]
    fn server_root_requires_server_id() {
        let request = ManagedPathRequest {
            root: ManagedRoot::Servers,
            server_id: None,
            relative_path: "server.properties".to_string(),
        };
        let test_dir = tempfile::tempdir().expect("test directory should be created");
        let error = resolve_managed_request(test_dir.path(), &request, true)
            .expect_err("server path without ID must fail");
        assert_eq!(error, "This managed path requires a server ID");
    }

    #[test]
    fn shared_roots_reject_server_id() {
        let request = ManagedPathRequest {
            root: ManagedRoot::Java,
            server_id: Some("alpha".to_string()),
            relative_path: "bin/java".to_string(),
        };
        let test_dir = tempfile::tempdir().expect("test directory should be created");
        let error = resolve_managed_request(test_dir.path(), &request, true)
            .expect_err("shared root with server ID must fail");
        assert_eq!(error, "Only server paths may include a server ID");
    }

    #[test]
    fn rejects_absolute_paths_and_traversal_in_both_separator_styles() {
        for input in [
            "/etc/passwd",
            r"C:\\Windows\\System32",
            "../outside",
            r"..\\outside",
        ] {
            assert!(
                validated_relative_path(input).is_err(),
                "{input} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_control_characters_and_unsafe_server_ids() {
        assert!(validated_relative_path("world/level\u{0000}.dat").is_err());
        let test_dir = tempfile::tempdir().expect("test directory should be created");
        assert!(resolve_managed_request(
            test_dir.path(),
            &server_request("alpha/../outside", "server.properties"),
            true,
        )
        .is_err());
    }

    #[tokio::test]
    async fn resolves_jar_destination_below_the_requested_server_id() {
        let app_data = tempfile::tempdir().expect("test directory should be created");
        std::fs::create_dir_all(app_data.path().join("servers/server-1/plugins"))
            .expect("server one plugin directory should be created");
        std::fs::create_dir_all(app_data.path().join("servers/server-2/plugins"))
            .expect("server two plugin directory should be created");
        let source = resolve_managed_request(
            app_data.path(),
            &server_request("server-1", "plugins/example.jar.part-valid.jar"),
            true,
        )
        .expect("managed source should resolve");
        let destination = resolve_managed_request(
            app_data.path(),
            &server_request("server-2", "plugins/example.jar"),
            true,
        )
        .expect("managed destination should resolve");
        std::fs::create_dir_all(source.parent().expect("source should have a parent"))
            .expect("managed plugin directory should be created");
        std::fs::write(&source, b"server one plugin").expect("source should be written");

        let canonical_app_data = std::fs::canonicalize(app_data.path()).unwrap();
        assert!(source.starts_with(canonical_app_data.join("servers/server-1")));
        assert!(destination.starts_with(canonical_app_data.join("servers/server-2")));
        assert_ne!(source.parent(), destination.parent());
        assert!(destination.parent().unwrap().ends_with("server-2/plugins"));
    }

    #[test]
    fn rejects_missing_non_final_component() {
        let app_data = tempfile::tempdir().expect("test directory should be created");
        let error = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "missing/level.dat"),
            true,
        )
        .expect_err("only the final managed path component may be new");

        assert_eq!(error, "Managed path parent does not exist");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_link_managed_root() {
        use std::os::unix::fs::symlink;

        let app_data = tempfile::tempdir().expect("test directory should be created");
        let outside = tempfile::tempdir().expect("test directory should be created");
        symlink(outside.path(), app_data.path().join("servers"))
            .expect("test symlink should be created");

        let error = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "server.properties"),
            false,
        )
        .expect_err("symlink managed root must fail");
        assert_eq!(
            error,
            "Refusing to access a symbolic-link or reparse-point managed root"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_link_path_component() {
        use std::os::unix::fs::symlink;

        let app_data = tempfile::tempdir().expect("test directory should be created");
        let server_root = app_data.path().join("servers/alpha");
        let outside = tempfile::tempdir().expect("test directory should be created");
        std::fs::create_dir_all(&server_root).expect("managed server should be created");
        symlink(outside.path(), server_root.join("link"))
            .expect("test symlink component should be created");

        let error = resolve_managed_request(
            app_data.path(),
            &server_request("alpha", "link/server.properties"),
            false,
        )
        .expect_err("symlink path component must fail");
        assert_eq!(
            error,
            "Managed path contains a symbolic link or reparse point"
        );
    }
}
