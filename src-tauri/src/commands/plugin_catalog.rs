//! Thin Tauri adapters for the plugin catalog feature.
use crate::plugin_catalog::{hangar, modrinth, spiget};
use serde_json::Value;

#[tauri::command]
pub async fn search_plugin_modrinth(
    query: String,
    facets: String,
    offset: u32,
    limit: u32,
    minecraft_version: Option<String>,
) -> Result<Value, String> {
    modrinth::search(query, facets, offset, limit, minecraft_version.as_deref()).await
}

#[tauri::command]
pub async fn get_plugin_modrinth_versions(project_id: String) -> Result<Value, String> {
    modrinth::versions(&project_id, None, None).await
}

#[tauri::command]
pub async fn get_plugin_modrinth_compatible_version(
    project_id: String,
    loader: String,
    minecraft_version: String,
) -> Result<Value, String> {
    modrinth::compatible_version(&project_id, &loader, &minecraft_version).await
}

#[tauri::command]
pub async fn get_plugin_modrinth_version(version_id: String) -> Result<Value, String> {
    modrinth::version_by_id(&version_id).await
}

#[tauri::command]
pub async fn get_plugin_modrinth_identity(project_id: String) -> Result<Value, String> {
    modrinth::project_identity(&project_id).await
}

#[tauri::command]
pub async fn get_plugin_modrinth_body(project_id: String) -> Result<Option<String>, String> {
    modrinth::project_body(&project_id).await
}

#[tauri::command]
pub async fn get_plugin_modrinth_artifact(
    version_id: String,
    file_name: String,
) -> Result<Value, String> {
    modrinth::artifact(&version_id, &file_name).await
}

#[tauri::command]
pub async fn search_plugin_hangar(query: String, offset: u32, limit: u32) -> Result<Value, String> {
    hangar::search(query, offset, limit).await
}

#[tauri::command]
pub async fn get_plugin_hangar_versions(
    owner: String,
    slug: String,
    platform: Option<String>,
) -> Result<Vec<Value>, String> {
    hangar::versions(&owner, &slug, platform.as_deref()).await
}

#[tauri::command]
pub async fn resolve_plugin_hangar_download(
    owner: String,
    slug: String,
    software: String,
    minecraft_version: String,
) -> Result<Value, String> {
    hangar::resolve_download(&owner, &slug, &software, &minecraft_version).await
}

#[tauri::command]
pub async fn check_plugin_hangar_compatibility(
    owner: String,
    slug: String,
    software: String,
    minecraft_version: String,
) -> Result<Value, String> {
    hangar::compatibility(&owner, &slug, &software, &minecraft_version).await
}

#[tauri::command]
pub async fn get_plugin_hangar_body(owner: String, slug: String) -> Result<Option<String>, String> {
    hangar::project_body(&owner, &slug).await
}

#[tauri::command]
pub async fn search_plugin_spiget(
    query: String,
    page: u32,
    size: u32,
    minecraft_version: Option<String>,
) -> Result<Vec<Value>, String> {
    spiget::search(query, page, size, minecraft_version.as_deref()).await
}

#[tauri::command]
pub async fn get_plugin_spiget_body(resource_id: u64) -> Result<Option<String>, String> {
    spiget::resource_body(resource_id).await
}
