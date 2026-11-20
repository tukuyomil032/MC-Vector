//! The managed install layout (`<data>/java/jdk-<major>`) and its atomic
//! placement: a staged folder replaces the old one by rename, and the old one
//! stays as a rollback copy until the registry is saved.

use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::managed_path::is_link_or_reparse_point;
use crate::server_process::ServerManager;

/// `<data>/java`.
pub fn managed_java_root(data_dir: &Path) -> PathBuf {
    data_dir.join("java")
}

/// `<data>/java/jdk-<major>`.
pub fn managed_install_dir(data_dir: &Path, major: u16) -> PathBuf {
    managed_java_root(data_dir).join(format!("jdk-{major}"))
}

/// Removes a file when dropped unless disarmed.
pub(crate) struct FileGuard {
    path: PathBuf,
    armed: bool,
}

impl FileGuard {
    pub fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for FileGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

/// Removes a directory tree when dropped unless disarmed.
pub(crate) struct DirectoryGuard {
    path: PathBuf,
    armed: bool,
}

impl DirectoryGuard {
    pub fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for DirectoryGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

pub(crate) fn validate_managed_java_install_dir(
    data_dir: &Path,
    install_dir: &Path,
) -> Result<PathBuf, String> {
    let root = managed_java_root(data_dir);
    let candidate = install_dir;
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
    if let Ok(metadata) = std::fs::symlink_metadata(candidate) {
        if is_link_or_reparse_point(&metadata) {
            return Err(
                "Java install directory must not be a symbolic link or reparse point".to_string(),
            );
        }
    }
    Ok(candidate.to_path_buf())
}

/// Err when a running server's Java executable lives inside `install_dir`.
pub(crate) async fn reject_mutation_of_running_runtime(
    servers: &ServerManager,
    install_dir: &Path,
) -> Result<(), RuntimeInUse> {
    let runtime_path = match tokio::fs::canonicalize(install_dir).await {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => install_dir.to_path_buf(),
        Err(error) => {
            return Err(RuntimeInUse::Inspect(format!(
                "Failed to resolve Java installation before mutation: {error}"
            )));
        }
    };
    if servers.is_java_runtime_in_use(&runtime_path).await {
        return Err(RuntimeInUse::Running);
    }
    Ok(())
}

pub(crate) enum RuntimeInUse {
    Running,
    Inspect(String),
}

pub(crate) fn install_java_with_rollback(
    staging: &Path,
    destination: &Path,
    managed_root: &Path,
) -> Result<Option<PathBuf>, String> {
    let staging = staging
        .canonicalize()
        .map_err(|error| format!("Failed to resolve staged Java installation: {error}"))?;
    let root = managed_root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve managed Java root: {error}"))?;
    if !staging.starts_with(&root) || !destination.starts_with(&root) {
        return Err("Java installation must remain inside managed storage".to_string());
    }
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                return Err("Existing Java installation is not a real directory".to_string());
            }
            let name = destination
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("java");
            let rollback =
                destination.with_file_name(format!(".{name}.rollback-{}", Uuid::new_v4()));
            std::fs::rename(destination, &rollback)
                .map_err(|error| format!("Failed to stage existing Java installation: {error}"))?;
            match std::fs::rename(&staging, destination) {
                Ok(()) => Ok(Some(rollback)),
                Err(error) => {
                    if std::fs::rename(&rollback, destination).is_ok() {
                        Err(format!(
                            "Failed to install Java and restored the existing installation: {error}"
                        ))
                    } else {
                        Err(format!(
                            "Failed to install Java and restore the existing installation; manual recovery required: {error}"
                        ))
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::rename(staging, destination)
                .map(|()| None)
                .map_err(|error| format!("Failed to install Java: {error}"))
        }
        Err(error) => Err(format!(
            "Failed to inspect existing Java installation: {error}"
        )),
    }
}

pub(crate) fn rollback_java_install(
    destination: &Path,
    previous_install: Option<&Path>,
) -> Result<(), String> {
    match std::fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
                return Err(
                    "Refusing to remove an unexpected Java installation during rollback".into(),
                );
            }
            std::fs::remove_dir_all(destination).map_err(|error| {
                format!("Failed to remove the unregistered Java installation: {error}")
            })?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Failed to inspect Java installation during rollback: {error}"
            ))
        }
    }
    if let Some(previous_install) = previous_install {
        restore_java_install_backup(previous_install, destination)?;
    }
    Ok(())
}

pub(crate) fn restore_java_install_backup(backup: &Path, destination: &Path) -> Result<(), String> {
    match std::fs::symlink_metadata(destination) {
        Ok(_) => return Err("Java installation path is occupied during rollback".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Failed to inspect Java rollback destination: {error}"
            ))
        }
    }
    let metadata = std::fs::symlink_metadata(backup)
        .map_err(|error| format!("Failed to inspect Java installation backup: {error}"))?;
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Java installation backup is not a real directory".into());
    }
    std::fs::rename(backup, destination)
        .map_err(|error| format!("Failed to restore the previous Java installation: {error}"))
}

/// Moves the installation aside before its registry entry is removed. A
/// missing folder returns `Ok(None)`, so a broken entry can still be removed.
pub(crate) fn backup_java_install_for_removal(
    install_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    let metadata = match std::fs::symlink_metadata(install_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to inspect Java installation: {error}")),
    };
    if is_link_or_reparse_point(&metadata) || !metadata.is_dir() {
        return Err("Existing Java installation is not a real directory".to_string());
    }
    let name = install_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Java installation directory name is invalid".to_string())?;
    let backup = install_dir.with_file_name(format!(".{name}.delete-{}", Uuid::new_v4()));
    std::fs::rename(install_dir, &backup)
        .map_err(|error| format!("Failed to stage Java installation for deletion: {error}"))?;
    Ok(Some(backup))
}

pub(crate) fn cleanup_java_backup(path: &Path) {
    if let Err(error) = std::fs::remove_dir_all(path) {
        log::warn!(
            "Failed to remove Java installation backup {:?}: {error}",
            path
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn staged_java_install_can_rollback_to_the_previous_directory() {
        let dir = tempfile::tempdir().unwrap();
        let managed_root = dir.path().canonicalize().unwrap().join("java");
        let install_dir = managed_root.join("jdk-21");
        let staging_dir = managed_root.join(".jdk-21.staging");
        std::fs::create_dir_all(&install_dir).unwrap();
        std::fs::create_dir_all(&staging_dir).unwrap();
        std::fs::write(install_dir.join("release"), "old").unwrap();
        std::fs::write(staging_dir.join("release"), "new").unwrap();

        let backup = install_java_with_rollback(&staging_dir, &install_dir, &managed_root)
            .expect("staged install should replace current install");
        assert_eq!(
            std::fs::read_to_string(install_dir.join("release")).unwrap(),
            "new"
        );
        assert_eq!(
            std::fs::read_to_string(backup.as_ref().unwrap().join("release")).unwrap(),
            "old"
        );

        rollback_java_install(&install_dir, backup.as_deref())
            .expect("failed registry save should restore prior installation");
        assert_eq!(
            std::fs::read_to_string(install_dir.join("release")).unwrap(),
            "old"
        );
        assert!(!backup.unwrap().exists());
    }

    #[test]
    fn java_delete_backup_can_be_restored_before_registry_commit() {
        let dir = tempfile::tempdir().unwrap();
        let install_dir = dir.path().join("java").join("jdk-17");
        std::fs::create_dir_all(&install_dir).unwrap();
        std::fs::write(install_dir.join("release"), "old").unwrap();

        let backup = backup_java_install_for_removal(&install_dir)
            .unwrap()
            .expect("deletion should first move the installation to backup");
        assert!(!install_dir.exists());
        restore_java_install_backup(&backup, &install_dir).unwrap();
        assert_eq!(
            std::fs::read_to_string(install_dir.join("release")).unwrap(),
            "old"
        );
        assert!(!backup.exists());
        assert_eq!(
            backup_java_install_for_removal(&dir.path().join("missing")),
            Ok(None)
        );
    }

    #[test]
    fn install_dir_is_scoped_to_the_managed_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("data");
        assert!(validate_managed_java_install_dir(&root, &managed_install_dir(&root, 21)).is_ok());
        assert!(validate_managed_java_install_dir(&root, &dir.path().join("outside")).is_err());
        assert!(validate_managed_java_install_dir(&root, &managed_java_root(&root)).is_err());
        assert!(
            validate_managed_java_install_dir(&root, &root.join("java").join("..").join("x"))
                .is_err()
        );
    }
}
