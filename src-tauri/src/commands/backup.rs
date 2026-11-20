use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use mcvector_core::backups::{
    self, BackupOrigin, BackupProgress as CoreBackupProgress, CreateBackupRequest,
};
use mcvector_core::error::CoreErrorCode;
use mcvector_core::managed_path::{resolve_managed_request, ManagedPathRequest, ManagedRoot};
use tauri::{AppHandle, Emitter, Manager, State};

use super::file_utils::managed_operation_scope;
use super::server::{
    start_registered_server_with_guard, stop_server_with_guard_recovery, validate_server_id,
    CommandLimiter, ServerManager, StopErrorRecoveryState, StopServerError,
};
use super::server_registry::ServerRegistry;
use crate::state::operation_manager::{OperationGuard, OperationKind, ServerOperationManager};

pub use mcvector_core::backups::{BackupRecord, BackupRetentionReport};
pub(crate) const AUTOMATIC_BACKUP_CANCELLED_ERROR: &str =
    mcvector_core::backups::AUTOMATIC_BACKUP_CANCELLED_ERROR;

#[derive(Clone, serde::Serialize)]
struct BackupProgressEvent {
    #[serde(rename = "serverId")]
    server_id: String,
    progress: f32,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ManagedBackupOutcome {
    ConfirmationRequired,
    Created {
        #[serde(rename = "backupName")]
        backup_name: String,
        #[serde(rename = "catalogError")]
        catalog_error: Option<String>,
        restart: BackupRestartOutcome,
    },
    Failed {
        stage: BackupFailureStage,
        error: String,
        #[serde(rename = "restartError")]
        restart_error: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BackupRestartOutcome {
    NotNeeded,
    Restarted,
    Failed { error: String },
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupFailureStage {
    Stop,
    Backup,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ManagedBackupArchive {
    pub(crate) backup_name: String,
    pub(crate) catalog_error: Option<String>,
}

fn managed_backup_archive_from_catalog_result(
    backup_name: String,
    catalog_result: Result<(), String>,
) -> ManagedBackupArchive {
    ManagedBackupArchive {
        backup_name,
        catalog_error: catalog_result.err(),
    }
}

async fn wait_for_backup_cancellation(cancellation: Arc<AtomicBool>) {
    while !cancellation.load(Ordering::SeqCst) {
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
}

pub(crate) async fn acquire_backup_operation(
    operations: &ServerOperationManager,
    server_id: &str,
    kind: OperationKind,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<OperationGuard, String> {
    let Some(cancellation) = cancellation else {
        return operations.acquire(server_id, kind).await;
    };
    if cancellation.load(Ordering::SeqCst) {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    tokio::select! {
        result = operations.acquire(server_id, kind) => result,
        _ = wait_for_backup_cancellation(cancellation) => {
            Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string())
        }
    }
}

fn core_error_message(error: mcvector_core::error::CoreError, cancellable: bool) -> String {
    if cancellable && error.code == CoreErrorCode::OperationCancelled {
        AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string()
    } else {
        error.message
    }
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

fn resolve_backup_paths(
    app: &AppHandle,
    server_id: &str,
    create_backup_dir: bool,
) -> Result<backups::ManagedBackupPaths, String> {
    backups::resolve_managed_paths(&app_data_dir(app)?, server_id, create_backup_dir)
        .map_err(|error| error.message)
}

/// Creates the archive and rebuilds its catalog for a caller that already owns
/// the server operation guard and any stop/restart lifecycle.
pub(crate) async fn create_managed_backup_unlocked_inner(
    app: AppHandle,
    server_id: String,
    backup_name: String,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
    origin: Option<String>,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<ManagedBackupArchive, String> {
    if cancellation
        .as_ref()
        .is_some_and(|token| token.load(Ordering::SeqCst))
    {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    if sources
        .as_ref()
        .is_some_and(|selected| !selected.is_empty())
    {
        return Err("Full managed backups do not accept selected source paths".to_string());
    }
    let origin = match origin.as_deref().unwrap_or("manual") {
        "manual" => BackupOrigin::Manual,
        "automatic" => BackupOrigin::Automatic,
        _ => return Err("Backup origin is unsupported".to_string()),
    };
    let paths = resolve_backup_paths(&app, &server_id, true)?;
    let request = CreateBackupRequest {
        server_id: server_id.clone(),
        backup_name: Some(backup_name),
        sources: None,
        compression_level,
        origin,
    };
    let progress_app = app.clone();
    let progress_server_id = server_id.clone();
    let worker_cancellation = cancellation.clone();
    let result = tokio::task::spawn_blocking(move || {
        let mut emit_progress = |progress: CoreBackupProgress| {
            let _ = progress_app.emit(
                "backup-progress",
                BackupProgressEvent {
                    server_id: progress_server_id.clone(),
                    progress: progress.fraction * 100.0,
                },
            );
        };
        backups::create_backup(
            &paths.server_dir,
            &paths.backup_dir,
            request,
            worker_cancellation.as_deref(),
            &mut emit_progress,
        )
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
    .map_err(|error| core_error_message(error, cancellation.is_some()))?;

    let catalog_result = result
        .catalog_error
        .map(|error| core_error_message(error, cancellation.is_some()))
        .map_or(Ok(()), Err);
    Ok(managed_backup_archive_from_catalog_result(
        result.backup_name,
        catalog_result,
    ))
}

#[tauri::command]
pub async fn create_managed_backup(
    app: AppHandle,
    server_state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    registry: State<'_, ServerRegistry>,
    server_id: String,
    backup_name: String,
    stop_running_server: bool,
    sources: Option<Vec<String>>,
    compression_level: Option<i64>,
    origin: Option<String>,
) -> Result<ManagedBackupOutcome, String> {
    let server_id = validate_server_id(&server_id)?;
    let operation = operations
        .acquire(&server_id, OperationKind::BackupCreate)
        .await?;
    let server_was_running = server_state.is_server_running(&server_id).await;
    let backup_app = app.clone();
    let restart_app = app;
    let backup_server_id = server_id.clone();
    let restart_server_id = server_id.clone();
    let server_state_ref = server_state.inner();
    let limiter_ref = limiter.inner();
    let operations_ref = operations.inner();
    let registry_ref = registry.inner();
    Ok(execute_managed_backup_with_guard(
        server_was_running,
        stop_running_server,
        operation,
        || stop_server_with_guard_recovery(server_state_ref, &server_id, None),
        || async move {
            create_managed_backup_unlocked_inner(
                backup_app,
                backup_server_id,
                backup_name,
                sources,
                compression_level,
                origin,
                None,
            )
            .await
        },
        |operation| async move {
            start_registered_server_with_guard(
                restart_app,
                server_state_ref,
                limiter_ref,
                operations_ref,
                registry_ref,
                restart_server_id,
                operation,
            )
            .await
        },
    )
    .await)
}

async fn execute_managed_backup_with_guard<
    Stop,
    StopFuture,
    Create,
    CreateFuture,
    Restart,
    RestartFuture,
>(
    server_was_running: bool,
    stop_running_server: bool,
    operation: OperationGuard,
    stop: Stop,
    create: Create,
    restart: Restart,
) -> ManagedBackupOutcome
where
    Stop: FnOnce() -> StopFuture,
    StopFuture: Future<Output = Result<(), StopServerError>>,
    Create: FnOnce() -> CreateFuture,
    CreateFuture: Future<Output = Result<ManagedBackupArchive, String>>,
    Restart: FnOnce(OperationGuard) -> RestartFuture,
    RestartFuture: Future<Output = Result<(), String>>,
{
    if server_was_running && !stop_running_server {
        return ManagedBackupOutcome::ConfirmationRequired;
    }
    if server_was_running {
        if let Err(error) = stop().await {
            let restart_error = if error.recovery_state == StopErrorRecoveryState::Stopped {
                restart(operation).await.err()
            } else {
                drop(operation);
                None
            };
            return ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Stop,
                error: error.message,
                restart_error,
            };
        }
    }

    let backup = match create().await {
        Ok(backup) => backup,
        Err(error) => {
            let restart_error = if server_was_running {
                restart(operation).await.err()
            } else {
                None
            };
            return ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Backup,
                error,
                restart_error,
            };
        }
    };

    let restart = if server_was_running {
        match restart(operation).await {
            Ok(()) => BackupRestartOutcome::Restarted,
            Err(error) => BackupRestartOutcome::Failed { error },
        }
    } else {
        drop(operation);
        BackupRestartOutcome::NotNeeded
    };
    ManagedBackupOutcome::Created {
        backup_name: backup.backup_name,
        catalog_error: backup.catalog_error,
        restart,
    }
}

#[tauri::command]
pub async fn list_managed_backups(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<Vec<BackupRecord>, String> {
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::BackupCreate)
        .await?;
    let paths = resolve_backup_paths(&app, &server_id, true)?;
    tokio::task::spawn_blocking(move || {
        mcvector_core::backups::catalog::list_backups(&paths.backup_dir, &server_id)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
    .map_err(|error| error.message)
}

#[tauri::command]
pub async fn delete_managed_backup(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    backup_name: String,
) -> Result<Vec<BackupRecord>, String> {
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::BackupDelete)
        .await?;
    let paths = resolve_backup_paths(&app, &server_id, true)?;
    tokio::task::spawn_blocking(move || {
        mcvector_core::backups::delete_backup(&paths.backup_dir, &server_id, &backup_name)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
    .map_err(|error| error.message)
}

#[tauri::command]
pub async fn apply_managed_backup_retention(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
) -> Result<BackupRetentionReport, String> {
    apply_managed_backup_retention_inner(
        app,
        operations.inner(),
        server_id,
        retain_count,
        retain_days,
    )
    .await
}

pub(crate) async fn apply_managed_backup_retention_inner(
    app: AppHandle,
    operations: &ServerOperationManager,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
) -> Result<BackupRetentionReport, String> {
    apply_managed_backup_retention_with_cancellation_inner(
        app,
        operations,
        server_id,
        retain_count,
        retain_days,
        None,
    )
    .await
}

async fn apply_managed_backup_retention_with_cancellation_inner(
    app: AppHandle,
    operations: &ServerOperationManager,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<BackupRetentionReport, String> {
    let _operation_guard = acquire_backup_operation(
        operations,
        &server_id,
        OperationKind::BackupDelete,
        cancellation.clone(),
    )
    .await?;
    apply_managed_backup_retention_unlocked_inner(
        app,
        server_id,
        retain_count,
        retain_days,
        cancellation,
    )
    .await
}

pub(crate) async fn apply_managed_backup_retention_cancellable_unlocked_inner(
    app: AppHandle,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
    cancellation: Arc<AtomicBool>,
) -> Result<BackupRetentionReport, String> {
    apply_managed_backup_retention_unlocked_inner(
        app,
        server_id,
        retain_count,
        retain_days,
        Some(cancellation),
    )
    .await
}

async fn apply_managed_backup_retention_unlocked_inner(
    app: AppHandle,
    server_id: String,
    retain_count: u32,
    retain_days: u32,
    cancellation: Option<Arc<AtomicBool>>,
) -> Result<BackupRetentionReport, String> {
    if cancellation
        .as_ref()
        .is_some_and(|token| token.load(Ordering::SeqCst))
    {
        return Err(AUTOMATIC_BACKUP_CANCELLED_ERROR.to_string());
    }
    let paths = resolve_backup_paths(&app, &server_id, true)?;
    let cancellable = cancellation.is_some();
    let worker_cancellation = cancellation.clone();
    tokio::task::spawn_blocking(move || {
        backups::catalog::apply_retention(
            &paths.backup_dir,
            &server_id,
            retain_count,
            retain_days,
            worker_cancellation.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
    .map_err(|error| core_error_message(error, cancellable))
}

#[tauri::command]
pub async fn restore_managed_backup(
    app: AppHandle,
    server_state: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
    backup_name: String,
) -> Result<(), String> {
    let _operation_guard = operations
        .acquire(&server_id, OperationKind::BackupRestore)
        .await?;
    if server_state.servers.lock().await.contains_key(&server_id) {
        return Err("Cannot restore a backup while the server is running".to_string());
    }
    let app_data_dir = app_data_dir(&app)?;
    let paths = backups::resolve_managed_paths(&app_data_dir, &server_id, false)
        .map_err(|error| error.message)?;
    let archive = resolve_managed_request(
        &app_data_dir,
        &ManagedPathRequest {
            root: ManagedRoot::Backups,
            server_id: Some(server_id.clone()),
            relative_path: backup_name,
        },
        false,
    )?;
    let target = paths.server_dir;
    let backup_dir = paths.backup_dir;
    let catalog_server_id = server_id.clone();
    tokio::task::spawn_blocking(move || {
        backups::restore_backup(&archive, &target, &server_id).map_err(|error| error.message)?;
        backups::catalog::list_backups(&backup_dir, &catalog_server_id)
            .map_err(|error| error.message)?;
        Ok(())
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

#[tauri::command]
pub async fn compress_managed_items(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    sources: Vec<ManagedPathRequest>,
    destination: ManagedPathRequest,
) -> Result<String, String> {
    let mut scopes = sources
        .iter()
        .map(managed_operation_scope)
        .collect::<Result<Vec<_>, _>>()?;
    scopes.push(managed_operation_scope(&destination)?);
    let _operation_guards = operations
        .acquire_scopes(scopes, OperationKind::FileMutation)
        .await?;
    let app_data_dir = app_data_dir(&app)?;
    let source_paths = sources
        .iter()
        .map(|request| resolve_managed_request(&app_data_dir, request, false))
        .collect::<Result<Vec<_>, _>>()?;
    let destination = resolve_managed_request(&app_data_dir, &destination, true)?;
    tokio::task::spawn_blocking(move || {
        mcvector_core::backups::create::compress_items(source_paths, destination)
            .map_err(|error| error.message)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

#[tauri::command]
pub async fn extract_managed_item(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    archive: ManagedPathRequest,
    destination: ManagedPathRequest,
) -> Result<(), String> {
    let archive_scope = managed_operation_scope(&archive)?;
    let destination_scope = managed_operation_scope(&destination)?;
    let _operation_guards = operations
        .acquire_scopes(
            [archive_scope, destination_scope],
            OperationKind::FileMutation,
        )
        .await?;
    let app_data_dir = app_data_dir(&app)?;
    let archive = resolve_managed_request(&app_data_dir, &archive, false)?;
    let destination = resolve_managed_request(&app_data_dir, &destination, true)?;
    tokio::task::spawn_blocking(move || {
        mcvector_core::backups::restore::extract_managed_item(&archive, &destination)
            .map_err(|error| error.message)
    })
    .await
    .map_err(|error| format!("Task join error: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::Arc;

    static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn test_temp_dir() -> PathBuf {
        std::env::temp_dir().join("mc-vector-tauri-backup-tests")
    }

    fn test_backup_archive(backup_name: &str) -> ManagedBackupArchive {
        ManagedBackupArchive {
            backup_name: backup_name.to_string(),
            catalog_error: None,
        }
    }

    #[tokio::test]
    async fn queued_automatic_backup_operation_can_be_cancelled() {
        let operations = ServerOperationManager::default();
        let blocker = operations
            .acquire("server-1", OperationKind::BackupRestore)
            .await
            .expect("acquire blocker operation");
        let cancellation = Arc::new(AtomicBool::new(false));
        let waiting_operations = operations.clone();
        let waiting_cancellation = cancellation.clone();
        let waiting = tokio::spawn(async move {
            acquire_backup_operation(
                &waiting_operations,
                "server-1",
                OperationKind::BackupCreate,
                Some(waiting_cancellation),
            )
            .await
        });

        tokio::task::yield_now().await;
        cancellation.store(true, Ordering::SeqCst);
        let result = tokio::time::timeout(std::time::Duration::from_secs(1), waiting)
            .await
            .expect("cancellation should release the queued wait")
            .expect("operation wait task should complete");
        assert!(matches!(
            result,
            Err(error) if error == AUTOMATIC_BACKUP_CANCELLED_ERROR
        ));

        drop(blocker);
        operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("the operation lock should remain usable after cancellation");
    }

    #[tokio::test]
    async fn manual_backup_confirmation_does_not_create_an_archive() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-confirmation-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");

        let outcome = execute_managed_backup_with_guard(
            true,
            false,
            operation,
            || async { Ok(()) },
            || async {
                fs::write(&archive, b"archive").expect("write archive marker");
                Ok(test_backup_archive("backup.zip"))
            },
            |operation| async move {
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert_eq!(outcome, ManagedBackupOutcome::ConfirmationRequired);
        assert!(!archive.exists(), "confirmation must not create a file");
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn stopped_server_backup_creates_without_restart() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let outcome = execute_managed_backup_with_guard(
            false,
            false,
            operation,
            || async { panic!("an inactive server does not need to stop") },
            || async { Ok(test_backup_archive("backup.zip")) },
            move |operation| async move {
                restart_called_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Created {
                backup_name: "backup.zip".to_string(),
                catalog_error: None,
                restart: BackupRestartOutcome::NotNeeded,
            }
        );
        assert!(!restart_called.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn manual_stop_error_waits_for_exit_notification_before_restart_without_backup() {
        let servers = ServerManager::default();
        let signal_exit = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let mut status_events = servers
            .take_status_receiver()
            .expect("test status receiver should be available");
        let cleanup_signal = signal_exit.clone();
        let cleanup_servers = servers.clone();
        let (removed_tx, removed_rx) = tokio::sync::oneshot::channel();
        let (continue_cleanup_tx, continue_cleanup_rx) = tokio::sync::oneshot::channel();
        let cleanup = tokio::spawn(async move {
            cleanup_signal
                .wait_until_expected_stop_registered(&cleanup_servers)
                .await;
            cleanup_signal
                .remove_from_server_map(&cleanup_servers)
                .await;
            let _ = removed_tx.send(());
            let _ = continue_cleanup_rx.await;
            cleanup_signal.finish_cleanup(&cleanup_servers).await;
        });
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-stop-failure-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");
        let archive_for_create = archive.clone();
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let stop_servers = servers.clone();
        let backup = tokio::spawn(async move {
            execute_managed_backup_with_guard(
                true,
                true,
                operation,
                move || async move {
                    stop_server_with_guard_recovery(&stop_servers, "server-1", None).await
                },
                || async {
                    fs::write(&archive_for_create, b"archive").expect("write archive marker");
                    Ok(test_backup_archive("backup.zip"))
                },
                move |operation| async move {
                    restart_called_in_closure.store(true, Ordering::SeqCst);
                    drop(operation);
                    Ok(())
                },
            )
            .await
        });

        removed_rx
            .await
            .expect("cleanup should remove the server map entry");
        assert!(!servers.is_server_running("server-1").await);
        assert!(
            !restart_called.load(Ordering::SeqCst),
            "map removal alone must not permit recovery restart"
        );
        assert!(
            !archive.exists(),
            "map removal alone must not create a backup"
        );
        let mut backup = backup;
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), &mut backup)
                .await
                .is_err(),
            "stop recovery must wait for the exit watch after map removal"
        );
        continue_cleanup_tx
            .send(())
            .expect("release old process cleanup");
        let outcome = backup.await.expect("backup task should finish");
        cleanup.await.expect("exit cleanup task should finish");

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Stop,
                error: "Server not found or not running".to_string(),
                restart_error: None,
            }
        );
        assert!(restart_called.load(Ordering::SeqCst));
        assert!(!archive.exists(), "failed stop must not create a file");
        let old_exit = status_events
            .recv()
            .await
            .expect("old server should publish its offline event");
        assert!(
            old_exit.expected,
            "failed stop send must preserve expected marker"
        );
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn manual_stop_error_does_not_restart_without_exit_confirmation() {
        let servers = ServerManager::default();
        let hold_exit_sender = servers
            .install_test_running_server_for_stop_recovery("server-1")
            .await;
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-stop-unconfirmed-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let stop_servers = servers.clone();
        let outcome = execute_managed_backup_with_guard(
            true,
            true,
            operation,
            move || async move {
                stop_server_with_guard_recovery(&stop_servers, "server-1", None).await
            },
            || async {
                fs::write(&archive, b"archive").expect("write archive marker");
                Ok(test_backup_archive("backup.zip"))
            },
            move |operation| async move {
                restart_called_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Ok(())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Stop,
                error: "Server not found or not running".to_string(),
                restart_error: None,
            }
        );
        assert!(!restart_called.load(Ordering::SeqCst));
        assert!(
            !archive.exists(),
            "unconfirmed stop must not create an archive"
        );
        assert!(servers.is_server_running("server-1").await);
        hold_exit_sender.remove_from_server_map(&servers).await;
        hold_exit_sender.finish_cleanup(&servers).await;
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn failed_manual_backup_attempts_to_restore_running_server() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let restart_called = Arc::new(AtomicBool::new(false));
        let restart_called_in_closure = restart_called.clone();

        let outcome = execute_managed_backup_with_guard(
            true,
            true,
            operation,
            || async { Ok(()) },
            || async { Err("archive write failed".to_string()) },
            move |operation| async move {
                restart_called_in_closure.store(true, Ordering::SeqCst);
                drop(operation);
                Err("restart failed".to_string())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Backup,
                error: "archive write failed".to_string(),
                restart_error: Some("restart failed".to_string()),
            }
        );
        assert!(restart_called.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn successful_manual_archive_reports_restart_failure_separately() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let root = test_temp_dir().join(format!(
            "mc-vector-restart-failure-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let archive = root.join("backup.zip");

        let outcome = execute_managed_backup_with_guard(
            true,
            true,
            operation,
            || async { Ok(()) },
            || async {
                fs::write(&archive, b"archive").expect("write archive marker");
                Ok(test_backup_archive("backup.zip"))
            },
            |operation| async move {
                drop(operation);
                Err("Java executable is unavailable".to_string())
            },
        )
        .await;

        assert_eq!(
            outcome,
            ManagedBackupOutcome::Created {
                backup_name: "backup.zip".to_string(),
                catalog_error: None,
                restart: BackupRestartOutcome::Failed {
                    error: "Java executable is unavailable".to_string(),
                },
            }
        );
        assert!(
            archive.exists(),
            "the archive remains available on restart failure"
        );
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[tokio::test]
    async fn manual_backup_guard_blocks_same_server_start_until_restart() {
        let operations = ServerOperationManager::default();
        let operation = operations
            .acquire("server-1", OperationKind::BackupCreate)
            .await
            .expect("acquire backup operation");
        let (backup_started_tx, backup_started_rx) = tokio::sync::oneshot::channel();
        let (continue_backup_tx, continue_backup_rx) = tokio::sync::oneshot::channel();
        let backup = tokio::spawn(async move {
            execute_managed_backup_with_guard(
                true,
                true,
                operation,
                || async { Ok(()) },
                || async move {
                    let _ = backup_started_tx.send(());
                    continue_backup_rx
                        .await
                        .map_err(|_| "backup test was cancelled".to_string())?;
                    Ok(test_backup_archive("backup.zip"))
                },
                |operation| async move {
                    drop(operation);
                    Ok(())
                },
            )
            .await
        });

        backup_started_rx
            .await
            .expect("backup should reach the guarded create stage");
        let waiting_operations = operations.clone();
        let mut competing_start = tokio::spawn(async move {
            waiting_operations
                .acquire("server-1", OperationKind::Start)
                .await
        });
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), &mut competing_start,)
                .await
                .is_err()
        );

        continue_backup_tx.send(()).expect("release backup stage");
        let outcome = backup.await.expect("backup task should finish");
        assert!(matches!(outcome, ManagedBackupOutcome::Created { .. }));
        competing_start
            .await
            .expect("start contender should acquire after backup completes")
            .expect("start lock should remain usable");
    }

    #[test]
    fn managed_backup_outcomes_use_the_confirmed_wire_shape() {
        assert_eq!(
            serde_json::to_value(ManagedBackupOutcome::ConfirmationRequired)
                .expect("serialize confirmation"),
            serde_json::json!({"status": "confirmation_required"})
        );
        assert_eq!(
            serde_json::to_value(ManagedBackupOutcome::Created {
                backup_name: "backup.zip".to_string(),
                catalog_error: None,
                restart: BackupRestartOutcome::Failed {
                    error: "restart failed".to_string(),
                },
            })
            .expect("serialize created outcome"),
            serde_json::json!({
                "status": "created",
                "backupName": "backup.zip",
                "catalogError": null,
                "restart": {"status": "failed", "error": "restart failed"}
            })
        );
        assert_eq!(
            serde_json::to_value(ManagedBackupOutcome::Failed {
                stage: BackupFailureStage::Backup,
                error: "archive failed".to_string(),
                restart_error: Some("restart failed".to_string()),
            })
            .expect("serialize failed outcome"),
            serde_json::json!({
                "status": "failed",
                "stage": "backup",
                "error": "archive failed",
                "restartError": "restart failed"
            })
        );
    }

    #[test]
    fn catalog_rebuild_failure_is_a_warning_after_archive_creation() {
        let archive = managed_backup_archive_from_catalog_result(
            "backup.zip".to_string(),
            Err("catalog write failed".to_string()),
        );

        assert_eq!(
            archive,
            ManagedBackupArchive {
                backup_name: "backup.zip".to_string(),
                catalog_error: Some("catalog write failed".to_string()),
            }
        );
        let outcome = ManagedBackupOutcome::Created {
            backup_name: archive.backup_name,
            catalog_error: archive.catalog_error,
            restart: BackupRestartOutcome::NotNeeded,
        };
        assert_eq!(
            serde_json::to_value(outcome).expect("serialize created outcome with warning"),
            serde_json::json!({
                "status": "created",
                "backupName": "backup.zip",
                "catalogError": "catalog write failed",
                "restart": {"status": "not_needed"}
            })
        );
    }
}
