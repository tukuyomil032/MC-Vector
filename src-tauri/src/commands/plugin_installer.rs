//! Thin IPC adapters; all authorization and filesystem policy live in service.
use crate::commands::server_registry::ServerRegistry;
use crate::plugin_installer::{
    self, ExecuteRequest, InstallPreview, InstallResult, MutationRequest, PluginInstaller,
    PrepareRequest,
};
use crate::state::operation_manager::{OperationKind, ServerOperationManager};
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub async fn prepare_plugin_install(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    installer: State<'_, PluginInstaller>,
    operations: State<'_, ServerOperationManager>,
    request: PrepareRequest,
) -> Result<InstallPreview, String> {
    let _guard = operations
        .acquire(&request.server_id, OperationKind::ArtifactInstall)
        .await?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    installer
        .prepare(&app_data, &registry, &app.config().identifier, request)
        .await
}

#[tauri::command]
pub async fn execute_plugin_install(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    installer: State<'_, PluginInstaller>,
    operations: State<'_, ServerOperationManager>,
    request: ExecuteRequest,
) -> Result<InstallResult, String> {
    let id = installer.server_for_token(&request.token)?;
    let _guard = operations
        .acquire(&id, OperationKind::ArtifactInstall)
        .await?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let event = format!("download-progress-{}", request.token);
    let allow_unverified = crate::commands::download::allows_unverified_plugin_downloads(&app);
    installer
        .execute(
            &app_data,
            &registry,
            request,
            allow_unverified,
            |progress| {
                if let Err(error) = app.emit(&event, progress) {
                    log::debug!("Download progress was not delivered: {error}");
                }
            },
            None,
        )
        .await
}

#[tauri::command]
pub async fn toggle_installed_plugin(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    request: MutationRequest,
) -> Result<String, String> {
    let _guard = operations
        .acquire(&request.server_id, OperationKind::FileMutation)
        .await?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        plugin_installer::toggle(&app_data, &registry, request)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn uninstall_installed_plugin(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    operations: State<'_, ServerOperationManager>,
    request: MutationRequest,
) -> Result<(), String> {
    let _guard = operations
        .acquire(&request.server_id, OperationKind::FileMutation)
        .await?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        plugin_installer::uninstall(&app_data, &registry, request)
    })
    .await
    .map_err(|error| error.to_string())?
}
