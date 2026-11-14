//! Which Java executables and JVM arguments a server may be started with.

use std::path::{Path, PathBuf};

use crate::managed_path::is_link_or_reparse_point;

/// Accepts `java`/`java.exe` (resolved through PATH), a java binary inside
/// MC-Vector's managed `java/` folder, or a java binary from a well-known
/// system location. Links are refused.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jvm_arguments_allow_tuning_flags_and_refuse_agents_and_classpaths() {
        assert!(validate_jvm_extra_args("-Dfile.encoding=UTF-8 -XX:+UseG1GC").is_ok());
        for arg in ["-javaagent:evil.jar", "-cp evil.jar", "-XX:OnError=cmd"] {
            assert!(validate_jvm_extra_args(arg).is_err(), "{arg}");
        }
        assert!(validate_jvm_extra_args(&"-Da=b ".repeat(33)).is_err());
    }

    #[test]
    fn plain_java_resolves_through_path() {
        assert_eq!(
            validate_java_executable_path("java", Path::new("/nonexistent")).unwrap(),
            PathBuf::from("java")
        );
    }
}
