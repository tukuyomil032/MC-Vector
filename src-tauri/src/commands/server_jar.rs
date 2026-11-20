//! Server jar upgrade commands. Plans, verified downloads and the journaled
//! jar replacement live in `mcvector_core::server_upgrade`; this module keeps
//! the renderer's request shape and `download-progress` events.

use mcvector_core::managed_path::validate_server_id;
use mcvector_core::server_upgrade::{ServerJarUpgrader, UpgradeErrorKind, UpgradePhase};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

pub(crate) use mcvector_core::server_upgrade::recover_replacement;

use super::server::ServerManager;
use super::server_registry::{MinecraftServer, ServerRegistry};
use crate::state::operation_manager::ServerOperationManager;

/// Pending upgrade plans (managed Tauri state).
pub type ServerJarInstaller = ServerJarUpgrader;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareServerJarRequest {
    pub server_id: String,
    pub software: String,
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedServerJarInstall {
    pub plan_id: String,
    pub latest_version: String,
    pub verified: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerJarInstallResult {
    pub server_id: String,
    pub version: String,
}

async fn get_registered_server(
    registry: ServerRegistry,
    server_id: String,
) -> Result<Option<MinecraftServer>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let servers = registry.get_servers()?;
        Ok(servers.into_iter().find(|server| server.id == server_id))
    })
    .await
    .map_err(|error| format!("Server registry read task failed: {error}"))?
}

async fn validate_prepare_request(
    registry: &ServerRegistry,
    request: &PrepareServerJarRequest,
) -> Result<(), String> {
    let server_id =
        validate_server_id(&request.server_id).map_err(|_| "Server ID is invalid".to_string())?;
    if !matches!(
        request.software.as_str(),
        "Paper" | "LeafMC" | "Vanilla" | "Fabric"
    ) {
        return Err(
            "This server software does not support automatic server jar installation".into(),
        );
    }
    if request.version.trim().is_empty() || request.version.len() > 128 {
        return Err("Server version is invalid".into());
    }
    let Some(server) = get_registered_server(registry.clone(), server_id).await? else {
        return Err("Server is not registered".into());
    };
    if server.software != request.software || server.version != request.version {
        return Err("Server profile changed while preparing its upgrade".into());
    }
    Ok(())
}

/// Resolves the newest version into a plan. `None` when the provider has no
/// automatic download for this server.
#[tauri::command]
pub async fn prepare_server_jar_install(
    registry: State<'_, ServerRegistry>,
    installer: State<'_, ServerJarInstaller>,
    servers: State<'_, ServerManager>,
    request: PrepareServerJarRequest,
) -> Result<Option<PreparedServerJarInstall>, String> {
    validate_prepare_request(&registry, &request).await?;
    match installer
        .prepare(&registry, &servers, &request.server_id, None)
        .await
    {
        Ok(plan) => Ok(Some(PreparedServerJarInstall {
            plan_id: plan.plan_id,
            latest_version: plan.target_version,
            verified: plan.verified,
        })),
        Err(error)
            if matches!(
                error.kind,
                UpgradeErrorKind::Unsupported | UpgradeErrorKind::NotAvailable
            ) =>
        {
            Ok(None)
        }
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub async fn execute_server_jar_install(
    app: AppHandle,
    registry: State<'_, ServerRegistry>,
    installer: State<'_, ServerJarInstaller>,
    operations: State<'_, ServerOperationManager>,
    server_manager: State<'_, ServerManager>,
    plan_id: String,
) -> Result<ServerJarInstallResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let server_id = installer.plan_server(&plan_id).unwrap_or_default();
    let events = app.clone();
    let event_server_id = server_id.clone();
    let result = installer
        .execute(
            &app_data_dir,
            &registry,
            &operations,
            &server_manager,
            &plan_id,
            None,
            move |event| {
                if event.phase != UpgradePhase::Download {
                    return;
                }
                let progress = if event.total > 0 {
                    ((event.downloaded.min(event.total) as f64 / event.total as f64) * 100.0) as u32
                } else {
                    0
                };
                if let Err(error) = events.emit(
                    "download-progress",
                    serde_json::json!({ "serverId": event_server_id, "progress": progress }),
                ) {
                    log::debug!("Download progress was not delivered: {error}");
                }
            },
        )
        .await
        .map_err(String::from)?;
    let _ = app.emit(
        "download-progress",
        serde_json::json!({ "serverId": result.server_id, "progress": 100 }),
    );
    Ok(ServerJarInstallResult {
        server_id: result.server_id,
        version: result.version,
    })
}
