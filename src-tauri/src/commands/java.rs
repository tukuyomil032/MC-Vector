//! Java runtime commands. The install layout, Adoptium downloads, safe
//! extraction and the registry rules live in `mcvector_core::java`; this
//! module stores the registry through tauri-plugin-store and turns install
//! progress into `java-download-progress` events.

use std::sync::Arc;

use mcvector_core::java::{self, JavaContext, JavaPhase, JavaRegistryStore, JAVA_REGISTRY_KEY};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

pub use mcvector_core::java::JavaVersion;

use super::server::ServerManager;
use crate::state::operation_manager::ServerOperationManager;

const JAVA_REGISTRY_STORE: &str = "config.json";

/// The `javaVersions` key of the store-managed `config.json`. Writes go
/// through the store so its in-memory copy never goes stale.
struct StoreJavaRegistry(AppHandle);

impl JavaRegistryStore for StoreJavaRegistry {
    fn load(&self) -> Result<Option<serde_json::Value>, String> {
        let store = self
            .0
            .store(JAVA_REGISTRY_STORE)
            .map_err(|error| format!("Failed to open Java registry store: {error}"))?;
        Ok(store.get(JAVA_REGISTRY_KEY))
    }

    fn save(&self, value: serde_json::Value) -> Result<(), String> {
        let store = self
            .0
            .store(JAVA_REGISTRY_STORE)
            .map_err(|error| format!("Failed to open Java registry store: {error}"))?;
        let previous = store.get(JAVA_REGISTRY_KEY);
        store.set(JAVA_REGISTRY_KEY, value);
        if let Err(error) = store.save() {
            match previous {
                Some(value) => store.set(JAVA_REGISTRY_KEY, value),
                None => {
                    store.delete(JAVA_REGISTRY_KEY);
                }
            }
            return match store.save() {
                Ok(()) => Err(format!("Failed to save Java registry; previous registry restored: {error}")),
                Err(restore_error) => Err(format!(
                    "Failed to save Java registry ({error}) and failed to persist its previous value ({restore_error})"
                )),
            };
        }
        Ok(())
    }
}

pub(super) fn registry(app: &AppHandle) -> Arc<dyn JavaRegistryStore> {
    Arc::new(StoreJavaRegistry(app.clone()))
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data directory".to_string())
}

#[tauri::command]
pub async fn get_java_versions(app: AppHandle) -> Result<Vec<JavaVersion>, String> {
    java::registry_entries(registry(&app))
        .await
        .map_err(String::from)
}

#[tauri::command]
pub async fn delete_java(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    servers: State<'_, ServerManager>,
    major_version: u16,
) -> Result<(), String> {
    let data_dir = app_data_dir(&app)?;
    let context = JavaContext {
        data_dir: &data_dir,
        store: registry(&app),
        operations: operations.inner(),
        servers: servers.inner(),
    };
    java::delete(&context, major_version)
        .await
        .map_err(String::from)
}

#[tauri::command]
pub async fn download_java(
    app: AppHandle,
    operations: State<'_, ServerOperationManager>,
    servers: State<'_, ServerManager>,
    major_version: u16,
) -> Result<String, String> {
    let data_dir = app_data_dir(&app)?;
    let context = JavaContext {
        data_dir: &data_dir,
        store: registry(&app),
        operations: operations.inner(),
        servers: servers.inner(),
    };
    let events = app.clone();
    let installed = java::install(&context, major_version, None, move |event| {
        if event.phase != JavaPhase::Download {
            return;
        }
        let progress = if event.total > 0 {
            ((event.downloaded.min(event.total) as f64 / event.total as f64) * 100.0) as u32
        } else {
            0
        };
        if let Err(error) = events.emit(
            "java-download-progress",
            serde_json::json!({ "progress": progress }),
        ) {
            log::debug!("Java download progress was not delivered: {error}");
        }
    })
    .await
    .map_err(String::from)?;
    Ok(installed.java_home)
}
