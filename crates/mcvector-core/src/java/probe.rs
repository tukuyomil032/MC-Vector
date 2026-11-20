//! Reading what a Java runtime is: the `release` file of a Java home (cheap,
//! no process) or the output of `<java> -version` (with a timeout).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

/// How long `java -version` may take before it is killed.
pub const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_PROBE_OUTPUT: usize = 64 * 1024;

/// What a runtime reported about itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaProbe {
    pub major: u16,
    /// The full version, for example `21.0.5` or `1.8.0_432`.
    pub version: String,
    pub vendor: Option<String>,
}

/// The executable file name on this OS.
pub fn executable_name() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

/// `<home>/bin/java`.
pub fn executable_in_home(home: &Path) -> PathBuf {
    home.join("bin").join(executable_name())
}

/// The Java home of `<home>/bin/java`.
pub fn home_of_executable(executable: &Path) -> Option<PathBuf> {
    let bin = executable.parent()?;
    if bin.file_name()? != "bin" {
        return None;
    }
    bin.parent().map(Path::to_path_buf)
}

/// The major version of a Java version string: `1.8.0_432` → 8,
/// `21.0.5+11` → 21, `25` → 25, `17-ea` → 17.
pub fn major_from_version(version: &str) -> Option<u16> {
    let mut parts = version
        .trim()
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty());
    let first: u16 = parts.next()?.parse().ok()?;
    let major = if first == 1 {
        parts.next()?.parse().ok()?
    } else {
        first
    };
    (1..=99).contains(&major).then_some(major)
}

/// The quoted version of `openjdk version "21.0.5" 2024-10-15` (also
/// `java version "1.8.0_432"`).
pub fn parse_version_output(output: &str) -> Option<(String, u16)> {
    output.lines().find_map(|line| {
        let line = line.trim();
        if !line.contains(" version ") {
            return None;
        }
        let start = line.find('"')? + 1;
        let end = start + line[start..].find('"')?;
        let version = line[start..end].trim().to_owned();
        let major = major_from_version(&version)?;
        Some((version, major))
    })
}

/// A vendor name recognized in `-version` output or a `release` IMPLEMENTOR.
pub fn vendor_from_text(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let vendor = [
        ("temurin", "Eclipse Adoptium"),
        ("adoptium", "Eclipse Adoptium"),
        ("adoptopenjdk", "AdoptOpenJDK"),
        ("zulu", "Azul Zulu"),
        ("azul", "Azul Zulu"),
        ("corretto", "Amazon Corretto"),
        ("amazon", "Amazon Corretto"),
        ("graalvm", "GraalVM"),
        ("microsoft", "Microsoft"),
        ("liberica", "BellSoft Liberica"),
        ("bellsoft", "BellSoft Liberica"),
        ("sapmachine", "SapMachine"),
        ("semeru", "IBM Semeru"),
        ("homebrew", "Homebrew"),
        ("java(tm)", "Oracle"),
        ("oracle", "Oracle"),
    ]
    .iter()
    .find(|(needle, _)| lower.contains(needle))
    .map(|(_, vendor)| (*vendor).to_owned());
    vendor
}

/// `JAVA_VERSION` and `IMPLEMENTOR` from `<home>/release`, when present.
pub fn read_release_file(home: &Path) -> Option<(Option<String>, Option<String>)> {
    let path = home.join("release");
    let metadata = std::fs::symlink_metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_PROBE_OUTPUT as u64 {
        return None;
    }
    let text = std::fs::read_to_string(path).ok()?;
    let value = |key: &str| {
        text.lines().find_map(|line| {
            let (name, value) = line.split_once('=')?;
            (name.trim() == key)
                .then(|| value.trim().trim_matches('"').to_owned())
                .filter(|value| !value.is_empty())
        })
    };
    Some((value("JAVA_VERSION"), value("IMPLEMENTOR")))
}

/// Runs `<executable> -version` and parses its output. The process is killed
/// when it takes longer than `timeout`.
pub async fn probe_executable(executable: &Path, timeout: Duration) -> Result<JavaProbe, String> {
    let mut command = tokio::process::Command::new(executable);
    command
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: no console window flashes up.
        command.creation_flags(0x0800_0000);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Java could not be started: {}", error.kind()))?;
    let output = tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| "Java did not report its version in time".to_string())?
        .map_err(|error| format!("Java version check failed: {}", error.kind()))?;
    let mut text = String::from_utf8_lossy(&output.stderr).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stdout));
    if !output.status.success() {
        return Err("Java exited with an error while reporting its version".into());
    }
    let (version, major) = parse_version_output(&text)
        .ok_or_else(|| "Java version output could not be read".to_string())?;
    Ok(JavaProbe {
        major,
        version,
        vendor: vendor_from_text(&text),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_strings_map_to_majors() {
        for (input, major) in [
            ("1.8.0_432", Some(8)),
            ("21.0.5+11", Some(21)),
            ("17", Some(17)),
            ("25-ea", Some(25)),
            ("11.0.2", Some(11)),
            ("abc", None),
            ("0.1", None),
        ] {
            assert_eq!(major_from_version(input), major, "{input}");
        }
    }

    #[test]
    fn version_output_is_parsed_for_openjdk_and_oracle() {
        let temurin = "openjdk version \"21.0.5\" 2024-10-15 LTS\nOpenJDK Runtime Environment Temurin-21.0.5+11 (build 21.0.5+11-LTS)\nOpenJDK 64-Bit Server VM Temurin-21.0.5+11";
        assert_eq!(
            parse_version_output(temurin),
            Some(("21.0.5".to_owned(), 21))
        );
        assert_eq!(
            vendor_from_text(temurin).as_deref(),
            Some("Eclipse Adoptium")
        );
        let oracle =
            "java version \"1.8.0_421\"\nJava(TM) SE Runtime Environment (build 1.8.0_421-b09)";
        assert_eq!(
            parse_version_output(oracle),
            Some(("1.8.0_421".to_owned(), 8))
        );
        assert_eq!(vendor_from_text(oracle).as_deref(), Some("Oracle"));
        assert_eq!(parse_version_output("no version here"), None);
    }

    #[test]
    fn release_file_is_read_and_homes_are_derived() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("release"),
            "IMPLEMENTOR=\"Eclipse Adoptium\"\nJAVA_VERSION=\"21.0.5\"\n",
        )
        .unwrap();
        assert_eq!(
            read_release_file(dir.path()),
            Some((Some("21.0.5".into()), Some("Eclipse Adoptium".into())))
        );
        let executable = executable_in_home(dir.path());
        assert_eq!(home_of_executable(&executable).as_deref(), Some(dir.path()));
        assert_eq!(home_of_executable(Path::new("/usr/java")), None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn probe_reads_a_scripted_java_and_times_out_a_stalled_one() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let java = dir.path().join("java");
        std::fs::write(
            &java,
            "#!/bin/sh\necho 'openjdk version \"17.0.13\" 2024-10-15' >&2\necho 'OpenJDK Runtime Environment Corretto-17.0.13.11.1' >&2\n",
        )
        .unwrap();
        std::fs::set_permissions(&java, std::fs::Permissions::from_mode(0o755)).unwrap();
        let probe = probe_executable(&java, PROBE_TIMEOUT).await.unwrap();
        assert_eq!(
            probe,
            JavaProbe {
                major: 17,
                version: "17.0.13".into(),
                vendor: Some("Amazon Corretto".into()),
            }
        );

        let slow = dir.path().join("slow-java");
        std::fs::write(&slow, "#!/bin/sh\nsleep 5\n").unwrap();
        std::fs::set_permissions(&slow, std::fs::Permissions::from_mode(0o755)).unwrap();
        let error = probe_executable(&slow, Duration::from_millis(200))
            .await
            .unwrap_err();
        assert!(error.contains("in time"), "{error}");
    }
}
