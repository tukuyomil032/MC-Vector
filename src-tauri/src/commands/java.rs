use futures_util::StreamExt;
use reqwest::{redirect, Client, Url};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

const MAX_JAVA_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_JAVA_ARCHIVE_ENTRIES: usize = 100_000;
const MAX_JAVA_UNCOMPRESSED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_JAVA_ENTRY_NAME_BYTES: usize = 255;
const MAX_JAVA_ENTRY_DEPTH: usize = 32;
const MAX_JAVA_COMPRESSION_RATIO: u64 = 100;
const COPY_BUFFER_SIZE: usize = 64 * 1024;

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
const JAVA_CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const JAVA_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(60);
const JAVA_DOWNLOAD_HOSTS: &[&str] = &[
    "api.adoptium.net",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

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

fn validate_managed_java_install_dir(
    app_data_dir: &Path,
    install_dir: &str,
) -> Result<PathBuf, String> {
    let root = app_data_dir.join("java");
    let candidate = PathBuf::from(install_dir);
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
    Ok(candidate)
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
pub async fn download_java(app: AppHandle, major_version: u16) -> Result<String, String> {
    if !(1..=99).contains(&major_version) {
        return Err("Unsupported Java major version".to_string());
    }
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
    let download_url = format!(
        "https://api.adoptium.net/v3/binary/latest/{major_version}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse?project=jdk"
    );
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    let install_dir = app_data_dir
        .join("java")
        .join(format!("jdk-{major_version}"));
    let install_path =
        validate_managed_java_install_dir(&app_data_dir, &install_dir.to_string_lossy())?;
    let download_url = validate_java_download_url(&download_url)?;
    let client = java_client()?;
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    if total > MAX_JAVA_ARCHIVE_BYTES {
        return Err("Java archive exceeds the download size limit".to_string());
    }
    let temp_file = install_path.join(format!(".java_download_temp.{archive_type}"));

    // インストールディレクトリを作成
    tokio::fs::create_dir_all(&install_path)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let mut file = tokio::fs::File::create(&temp_file)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let mut archive_guard = DownloadTempGuard::new(temp_file.clone());

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = tokio::time::timeout(JAVA_INACTIVITY_TIMEOUT, stream.next())
        .await
        .map_err(|_| "Java download stalled while waiting for data".to_string())?
    {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        if downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "Java download size overflow".to_string())?
            > MAX_JAVA_ARCHIVE_BYTES
        {
            return Err("Java archive exceeds the download size limit".to_string());
        }
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let progress = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };
        let _ = app.emit(
            "java-download-progress",
            serde_json::json!({ "progress": progress }),
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;
    drop(file);

    // 2. 展開
    let install = install_path.to_string_lossy().to_string();
    let temp = temp_file.to_string_lossy().to_string();
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

    // 一時ファイル削除
    if extraction_result.is_ok() {
        if tokio::fs::remove_file(&temp_file).await.is_ok() {
            archive_guard.disarm();
        }
    }

    extraction_result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn java_download_url_is_strict() {
        assert!(validate_java_download_url("https://api.adoptium.net/v3/binary/latest/21").is_ok());
        assert!(validate_java_download_url("http://api.adoptium.net/v3/binary/latest/21").is_err());
        assert!(validate_java_download_url("https://evil.example/jdk.zip").is_err());
    }
    #[test]
    fn install_dir_and_jvm_args_are_scoped() {
        let root = Path::new("/app-data");
        assert!(validate_managed_java_install_dir(root, "/app-data/java/jdk-21").is_ok());
        assert!(validate_managed_java_install_dir(root, "/tmp/jdk-21").is_err());
        assert!(validate_jvm_extra_args("-Dfile.encoding=UTF-8 -XX:+UseG1GC").is_ok());
        for arg in ["-javaagent:evil.jar", "-cp evil.jar", "-XX:OnError=cmd"] {
            assert!(validate_jvm_extra_args(arg).is_err(), "{arg}");
        }
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
    let mut paths = HashSet::new();

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
        if paths.iter().any(|existing: &PathBuf| {
            relative.starts_with(existing) || existing.starts_with(&relative)
        }) {
            return Err("Java archive contains duplicate or colliding entries".to_string());
        }
        paths.insert(relative.clone());
        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            return Err("Java archive links are not allowed".to_string());
        }
        if entry_type.is_dir() {
            ensure_java_directory(destination, Some(&relative))?;
            continue;
        }
        if !entry_type.is_file() {
            return Err("Java archive contains an unsupported entry type".to_string());
        }
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
    let mut paths = HashSet::with_capacity(archive.len());
    let mut safe_entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| format!("Zip entry error: {error}"))?;
        let relative = safe_archive_entry_name(file.name())?;
        if file.is_symlink()
            || paths.iter().any(|existing: &PathBuf| {
                relative.starts_with(existing) || existing.starts_with(&relative)
            })
        {
            return Err("Java archive contains a link or colliding entry".to_string());
        }
        paths.insert(relative.clone());
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
