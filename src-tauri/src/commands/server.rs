//! Server process commands. The process manager lives in
//! `mcvector_core::server_process`; this module turns its events into the
//! renderer events (`server-log`, `server-status-change`, `server-stats`,
//! `server-metrics-updated`) and keeps the helpers automation and backups use.

use std::sync::Arc;

use mcvector_core::metric_history::MetricHistorySnapshot;
use mcvector_core::server_process::{
    self as core_process, ServerContext, ServerEvents, ServerLogEvent, ServerStatsEvent,
};
use tauri::{AppHandle, Emitter, Manager, State};

use super::server_registry::ServerRegistry;
use crate::state::operation_manager::{OperationGuard, ServerOperationManager};

pub use mcvector_core::server_process::{
    stop_server_with_guard_recovery, validate_server_id, CommandLimiter, ServerManager,
    ServerStatus, ServerStatusEvent, StopErrorRecoveryState, StopServerError,
};

/// Forwards core server events to the renderer.
struct TauriServerEvents(AppHandle);

impl ServerEvents for TauriServerEvents {
    fn log(&self, event: ServerLogEvent) {
        let _ = self.0.emit("server-log", event);
    }

    fn status(&self, event: &ServerStatusEvent) {
        let _ = self.0.emit("server-status-change", event);
    }

    fn stats(&self, event: ServerStatsEvent) {
        let _ = self.0.emit("server-stats", event);
    }

    fn metrics(&self, snapshot: &MetricHistorySnapshot) {
        let _ = self.0.emit("server-metrics-updated", snapshot);
    }
}

fn server_context(app: &AppHandle) -> Result<ServerContext, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())?;
    Ok(ServerContext {
        data_dir,
        events: Arc::new(TauriServerEvents(app.clone())),
    })
}

pub(crate) async fn start_registered_server(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    registry: &ServerRegistry,
    server_id: String,
) -> Result<(), String> {
    core_process::start_registered_server(
        server_context(&app)?,
        state,
        limiter,
        operations,
        registry,
        server_id,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn start_server_with_config(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    server_id: String,
    java_path: String,
    memory: u32,
    jar_file: String,
    jvm_extra_args: Option<String>,
    software: String,
) -> Result<(), String> {
    core_process::start_server_with_config(
        server_context(&app)?,
        state,
        limiter,
        operations,
        server_id,
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn start_server_with_config_and_guard(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    server_id: String,
    java_path: String,
    memory: u32,
    jar_file: String,
    jvm_extra_args: Option<String>,
    software: String,
    operation: OperationGuard,
) -> Result<(), String> {
    core_process::start_server_with_config_and_guard(
        server_context(&app)?,
        state,
        limiter,
        operations,
        server_id,
        java_path,
        memory,
        jar_file,
        jvm_extra_args,
        software,
        operation,
    )
    .await
}

pub(crate) async fn start_registered_server_with_guard(
    app: AppHandle,
    state: &ServerManager,
    limiter: &CommandLimiter,
    operations: &ServerOperationManager,
    registry: &ServerRegistry,
    server_id: String,
    operation: OperationGuard,
) -> Result<(), String> {
    core_process::start_registered_server_with_guard(
        server_context(&app)?,
        state,
        limiter,
        operations,
        registry,
        server_id,
        operation,
    )
    .await
}

/// Starts a registered server and streams its console to the renderer.
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    registry: State<'_, ServerRegistry>,
    server_id: String,
) -> Result<(), String> {
    start_registered_server(
        app,
        state.inner(),
        limiter.inner(),
        operations.inner(),
        registry.inner(),
        server_id,
    )
    .await
}

/// Sends `stop`, then force-kills a server that is still running after the grace period.
#[tauri::command]
pub async fn stop_server(
    state: State<'_, ServerManager>,
    operations: State<'_, ServerOperationManager>,
    server_id: String,
) -> Result<(), String> {
    core_process::stop_server_with_id(state.inner(), operations.inner(), server_id).await
}

/// Stop and start under one server operation lock, using the saved profile.
#[tauri::command]
pub async fn restart_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    operations: State<'_, ServerOperationManager>,
    registry: State<'_, ServerRegistry>,
    server_id: String,
) -> Result<(), String> {
    core_process::restart_server(
        server_context(&app)?,
        state.inner(),
        limiter.inner(),
        operations.inner(),
        registry.inner(),
        &server_id,
    )
    .await
}

/// Sends one console command to a running server.
#[tauri::command]
pub async fn send_command(
    state: State<'_, ServerManager>,
    limiter: State<'_, CommandLimiter>,
    server_id: String,
    command: String,
) -> Result<(), String> {
    core_process::send_command(state.inner(), limiter.inner(), &server_id, &command).await
}

#[tauri::command]
pub async fn is_server_running(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<bool, String> {
    let validated_server_id = validate_server_id(&server_id)?;
    Ok(state.is_server_running(&validated_server_id).await)
}

#[tauri::command]
pub async fn get_server_pid(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<u32, String> {
    state.server_pid(&server_id).await
}

/// Return the current in-memory metric window for a running server.
#[tauri::command]
pub async fn get_server_metric_history(
    state: State<'_, ServerManager>,
    server_id: String,
) -> Result<Option<MetricHistorySnapshot>, String> {
    state.metric_history(&server_id).await
}
