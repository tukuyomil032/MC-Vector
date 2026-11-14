//! `create_server_profile`: the Tauri entry point for server creation. The
//! work happens in `mcvector_core::server_creation`; this command resolves the
//! data directory, plugs in the import step, and turns progress into the
//! `server-creation-download-progress` event the React UI listens to.

use mcvector_core::server_creation::{self, CreationEvent, ImportStep};
use tauri::{AppHandle, Emitter, Manager, State};

use super::file_utils::{complete_server_import_for_creation, ServerImportManager};
use super::server_registry::ServerRegistry;
use crate::state::operation_manager::ServerOperationManager;

pub use mcvector_core::server_creation::{
    CreatedServer as CreatedServerProfile, NewServerRequest as NewServerProfileRequest,
};

#[tauri::command]
pub async fn create_server_profile(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    imports: State<'_, ServerImportManager>,
    operations: State<'_, ServerOperationManager>,
    request: NewServerProfileRequest,
) -> Result<CreatedServerProfile, String> {
    let operation_id = server_creation::validate_operation_id(&request.operation_id)
        .map_err(|error| error.message)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    let import_step: Option<ImportStep> = request
        .import_token
        .clone()
        .filter(|token| !token.trim().is_empty())
        .map(|token| {
            let imports = imports.inner().clone();
            Box::new(move |data_dir: &std::path::Path, server_id: &str| {
                complete_server_import_for_creation(data_dir, &imports, &token, server_id)
            }) as ImportStep
        });

    let progress = move |event: CreationEvent| {
        if let CreationEvent::Downloading { percent } = event {
            let _ = app.emit(
                "server-creation-download-progress",
                serde_json::json!({
                    "operationId": operation_id,
                    "progress": percent.unwrap_or(0)
                }),
            );
        }
    };

    server_creation::create_server(
        &app_data_dir,
        registry.inner(),
        operations.inner(),
        request,
        import_step,
        &progress,
        None,
    )
    .await
    .map_err(|error| error.message)
}
