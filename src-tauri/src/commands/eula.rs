use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::file_utils::{resolve_managed_request, ManagedPathRequest, ManagedRoot};

const EULA_FILE_NAME: &str = "eula.txt";
pub const EULA_REQUIRED_ERROR: &str = "eula-required";

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerEulaStatus {
    pub accepted: bool,
    pub file_exists: bool,
}

fn resolve_server_eula_path(app_data_dir: &Path, server_id: &str) -> Result<PathBuf, String> {
    let request = ManagedPathRequest {
        root: ManagedRoot::Servers,
        server_id: Some(server_id.to_string()),
        relative_path: EULA_FILE_NAME.to_string(),
    };
    resolve_managed_request(app_data_dir, &request, false)
}

fn strip_line_ending(line: &str) -> (&str, &str) {
    if let Some(body) = line.strip_suffix("\r\n") {
        return (body, "\r\n");
    }
    if let Some(body) = line.strip_suffix('\n') {
        return (body, "\n");
    }
    (line, "")
}

fn active_eula_assignment(line: &str) -> Option<(usize, bool)> {
    let (body, _) = strip_line_ending(line);
    let trimmed = body.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
        return None;
    }

    let equals_index = body.find('=')?;
    if body[..equals_index].trim() != "eula" {
        return None;
    }

    Some((
        equals_index + 1,
        body[equals_index + 1..].trim().eq_ignore_ascii_case("true"),
    ))
}

fn parse_eula_content(content: &str) -> ServerEulaStatus {
    let mut active_lines = 0;
    let mut all_true = true;

    for line in content.split_inclusive('\n') {
        if let Some((_, accepted)) = active_eula_assignment(line) {
            active_lines += 1;
            all_true &= accepted;
        }
    }

    ServerEulaStatus {
        accepted: active_lines > 0 && all_true,
        file_exists: true,
    }
}

fn read_eula_content(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read eula.txt: {error}")),
    }
}

fn read_eula_status(path: &Path) -> Result<ServerEulaStatus, String> {
    let Some(content) = read_eula_content(path)? else {
        return Ok(ServerEulaStatus {
            accepted: false,
            file_exists: false,
        });
    };

    Ok(parse_eula_content(&content))
}

fn accepted_eula_content(content: &str) -> String {
    let mut output = String::with_capacity(content.len() + 10);
    let mut has_active_assignment = false;
    let default_newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };

    for line in content.split_inclusive('\n') {
        if let Some((equals_end, _)) = active_eula_assignment(line) {
            let (body, newline) = strip_line_ending(line);
            output.push_str(&body[..equals_end]);
            output.push_str("true");
            output.push_str(newline);
            has_active_assignment = true;
        } else {
            output.push_str(line);
        }
    }

    if !has_active_assignment {
        if !output.is_empty() && !output.ends_with('\n') {
            output.push_str(default_newline);
        }
        output.push_str("eula=true");
        output.push_str(default_newline);
    }

    output
}

fn accept_eula_file(path: &Path) -> Result<(), String> {
    let content = read_eula_content(path)?.unwrap_or_default();
    std::fs::write(path, accepted_eula_content(&content))
        .map_err(|error| format!("Failed to write eula.txt: {error}"))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

pub(crate) fn ensure_server_eula_accepted(
    app_data_dir: &Path,
    server_id: &str,
) -> Result<(), String> {
    let path = resolve_server_eula_path(app_data_dir, server_id)?;
    let status = read_eula_status(&path)?;
    if status.accepted {
        Ok(())
    } else {
        Err(EULA_REQUIRED_ERROR.to_string())
    }
}

#[tauri::command]
pub async fn get_server_eula_status(
    app: AppHandle,
    server_id: String,
) -> Result<ServerEulaStatus, String> {
    let app_data_dir = app_data_dir(&app)?;
    let path = resolve_server_eula_path(&app_data_dir, &server_id)?;
    read_eula_status(&path)
}

#[tauri::command]
pub async fn accept_server_eula(app: AppHandle, server_id: String) -> Result<(), String> {
    let app_data_dir = app_data_dir(&app)?;
    let path = resolve_server_eula_path(&app_data_dir, &server_id)?;
    accept_eula_file(&path)
}

#[cfg(test)]
mod tests {
    use super::{
        accept_eula_file, accepted_eula_content, ensure_server_eula_accepted, parse_eula_content,
        read_eula_status, ServerEulaStatus, EULA_REQUIRED_ERROR,
    };
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let sequence = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = PathBuf::from("target")
                .join("mc-vector-eula")
                .join(format!("{}-{sequence}", std::process::id()));
            std::fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reports_missing_eula_file() {
        let directory = TestDirectory::new();
        let status = read_eula_status(&directory.path().join("eula.txt"))
            .expect("missing file should be a valid status");
        assert_eq!(
            status,
            ServerEulaStatus {
                accepted: false,
                file_exists: false,
            }
        );
    }

    #[test]
    fn parses_false_and_true_values() {
        assert!(!parse_eula_content("eula=false\n").accepted);
        assert!(parse_eula_content("eula=true\n").accepted);
    }

    #[test]
    fn accepts_case_insensitive_true_with_surrounding_whitespace() {
        assert!(parse_eula_content("  eula =  TRUE  \n").accepted);
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let status = parse_eula_content("# eula=false\n; eula=false\n\n");
        assert_eq!(
            status,
            ServerEulaStatus {
                accepted: false,
                file_exists: true,
            }
        );
    }

    #[test]
    fn updates_active_assignments_and_preserves_comments() {
        let content = "# keep this\neula=false\nlevel-name=world\n";
        assert_eq!(
            accepted_eula_content(content),
            "# keep this\neula=true\nlevel-name=world\n"
        );
    }

    #[test]
    fn preserves_lf_and_crlf_line_endings() {
        assert_eq!(
            accepted_eula_content("eula=false\nname=world\n"),
            "eula=true\nname=world\n"
        );
        assert_eq!(
            accepted_eula_content("eula=false\r\nname=world\r\n"),
            "eula=true\r\nname=world\r\n"
        );
    }

    #[test]
    fn appends_eula_assignment_when_missing() {
        assert_eq!(
            accepted_eula_content("motd=hello\n"),
            "motd=hello\neula=true\n"
        );
    }

    #[test]
    fn requires_all_active_assignments_to_be_true() {
        assert!(!parse_eula_content("eula=true\neula=false\n").accepted);
        assert!(parse_eula_content("eula=true\neula=TRUE\n").accepted);
    }

    #[test]
    fn returns_read_error_for_non_file_path() {
        let directory = TestDirectory::new();
        let eula_path = directory.path().join("eula.txt");
        std::fs::create_dir(&eula_path).expect("directory should be created");
        let error = read_eula_status(&eula_path).expect_err("directory should not be read as text");
        assert!(error.contains("Failed to read eula.txt"));
    }

    #[test]
    fn returns_write_error_when_parent_is_missing() {
        let directory = TestDirectory::new();
        let eula_path = directory.path().join("missing/eula.txt");
        let error = accept_eula_file(&eula_path).expect_err("missing parent should reject write");
        assert!(error.contains("Failed to write eula.txt"));
    }

    #[test]
    fn blocks_start_until_the_managed_eula_is_accepted() {
        let directory = TestDirectory::new();
        let server_directory = directory.path().join("servers/server-1");
        std::fs::create_dir_all(&server_directory).expect("server directory should be created");

        assert_eq!(
            ensure_server_eula_accepted(directory.path(), "server-1"),
            Err(EULA_REQUIRED_ERROR.to_string())
        );

        std::fs::write(server_directory.join("eula.txt"), "eula=true\n")
            .expect("accepted EULA should be written");
        assert!(ensure_server_eula_accepted(directory.path(), "server-1").is_ok());
    }
}
