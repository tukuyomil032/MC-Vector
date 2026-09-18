use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use super::{app_data_dir, server_dir};

const STORAGE_FILE_NAME: &str = "map-markers.json";
const STORAGE_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapMarkerPosition {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapMarker {
    pub id: String,
    pub world_id: String,
    pub group: String,
    pub name: String,
    pub position: MapMarkerPosition,
    pub color: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapMarkerInput {
    pub world_id: String,
    pub group: String,
    pub name: String,
    pub position: MapMarkerPosition,
    pub color: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkerStore {
    version: u32,
    markers: Vec<MapMarker>,
}

static MARKER_STORAGE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn marker_storage_lock() -> &'static Mutex<()> {
    MARKER_STORAGE_LOCK.get_or_init(|| Mutex::new(()))
}

#[tauri::command]
pub async fn get_map_markers(app: AppHandle, server_id: String) -> Result<Vec<MapMarker>, String> {
    with_server_storage(&app, &server_id, load_markers).await
}

#[tauri::command]
pub async fn create_map_marker(
    app: AppHandle,
    server_id: String,
    input: MapMarkerInput,
) -> Result<MapMarker, String> {
    with_server_storage(&app, &server_id, move |server_root| {
        let mut store = read_store(&server_root)?;
        let marker = MapMarker {
            id: Uuid::new_v4().to_string(),
            world_id: input.world_id,
            group: input.group,
            name: input.name,
            position: input.position,
            color: input.color,
        };
        validate_marker(&marker)?;
        store.markers.push(marker.clone());
        write_store(&server_root, &mut store)?;
        Ok(marker)
    })
    .await
}

#[tauri::command]
pub async fn update_map_marker(
    app: AppHandle,
    server_id: String,
    marker_id: String,
    input: MapMarkerInput,
) -> Result<MapMarker, String> {
    validate_marker_id(&marker_id)?;
    with_server_storage(&app, &server_id, move |server_root| {
        let mut store = read_store(&server_root)?;
        let marker = store
            .markers
            .iter_mut()
            .find(|marker| marker.id == marker_id)
            .ok_or_else(|| "Map marker was not found".to_string())?;
        marker.world_id = input.world_id;
        marker.group = input.group;
        marker.name = input.name;
        marker.position = input.position;
        marker.color = input.color;
        validate_marker(marker)?;
        let updated = marker.clone();
        write_store(&server_root, &mut store)?;
        Ok(updated)
    })
    .await
}

#[tauri::command]
pub async fn delete_map_marker(
    app: AppHandle,
    server_id: String,
    marker_id: String,
) -> Result<bool, String> {
    validate_marker_id(&marker_id)?;
    with_server_storage(&app, &server_id, move |server_root| {
        let mut store = read_store(&server_root)?;
        let original_len = store.markers.len();
        store.markers.retain(|marker| marker.id != marker_id);
        if store.markers.len() == original_len {
            return Ok(false);
        }
        write_store(&server_root, &mut store)?;
        Ok(true)
    })
    .await
}

async fn with_server_storage<T, F>(
    app: &AppHandle,
    server_id: &str,
    operation: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf) -> Result<T, String> + Send + 'static,
{
    let app_data = app_data_dir(app)?;
    let server_root = server_dir(&app_data, server_id)?;
    tokio::task::spawn_blocking(move || {
        let _guard = marker_storage_lock()
            .lock()
            .map_err(|_| "Map marker storage lock was poisoned".to_string())?;
        operation(server_root)
    })
    .await
    .map_err(|error| format!("Map marker storage worker failed: {error}"))?
}

fn load_markers(server_root: PathBuf) -> Result<Vec<MapMarker>, String> {
    Ok(read_store(&server_root)?.markers)
}

fn storage_path(server_root: &Path) -> Result<PathBuf, String> {
    let root_metadata = fs::symlink_metadata(server_root)
        .map_err(|error| format!("Failed to inspect managed server root: {error}"))?;
    if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
        return Err("Managed server root is not a normal directory".to_string());
    }

    let path = server_root.join(STORAGE_FILE_NAME);
    match fs::symlink_metadata(&path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                Err("Map marker storage is not a normal file".to_string())
            } else {
                Ok(path)
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path),
        Err(error) => Err(format!("Failed to inspect map marker storage: {error}")),
    }
}

fn read_store(server_root: &Path) -> Result<MarkerStore, String> {
    let path = storage_path(server_root)?;
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(MarkerStore {
                version: STORAGE_VERSION,
                markers: Vec::new(),
            });
        }
        Err(error) => return Err(format!("Failed to read map marker storage: {error}")),
    };
    let store: MarkerStore = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Invalid map marker JSON: {error}"))?;
    if store.version != STORAGE_VERSION {
        return Err(format!(
            "Unsupported map marker storage version: {}",
            store.version
        ));
    }
    validate_store(&store)?;
    Ok(store)
}

fn write_store(server_root: &Path, store: &mut MarkerStore) -> Result<(), String> {
    validate_store(store)?;
    store
        .markers
        .sort_by(|left, right| marker_order(left, right));
    let path = storage_path(server_root)?;
    let temporary = server_root.join(format!(".{STORAGE_FILE_NAME}.tmp-{}", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|error| format!("Failed to serialize map markers: {error}"))?;
    if let Err(error) = fs::write(&temporary, bytes) {
        return Err(format!("Failed to stage map marker storage: {error}"));
    }
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Failed to atomically replace map marker storage: {error}"
        ));
    }
    Ok(())
}

fn validate_store(store: &MarkerStore) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for marker in &store.markers {
        validate_marker(marker)?;
        if !ids.insert(&marker.id) {
            return Err(format!("Duplicate map marker ID: {}", marker.id));
        }
    }
    Ok(())
}

fn validate_marker(marker: &MapMarker) -> Result<(), String> {
    validate_marker_id(&marker.id)?;
    validate_world_id(&marker.world_id)?;
    if marker.group.trim().is_empty() || marker.group.len() > 128 {
        return Err("Map marker group must be between 1 and 128 characters".to_string());
    }
    if marker.name.trim().is_empty() || marker.name.len() > 256 {
        return Err("Map marker name must be between 1 and 256 characters".to_string());
    }
    if !marker.position.x.is_finite()
        || !marker.position.y.is_finite()
        || !marker.position.z.is_finite()
    {
        return Err("Map marker position must contain finite coordinates".to_string());
    }
    if !is_hex_color(&marker.color) {
        return Err("Map marker color must be #RRGGBB or #RRGGBBAA".to_string());
    }
    Ok(())
}

fn validate_marker_id(marker_id: &str) -> Result<(), String> {
    if marker_id.is_empty()
        || marker_id == "."
        || marker_id == ".."
        || marker_id.contains(['/', '\\', ':'])
        || marker_id.chars().any(char::is_control)
    {
        return Err("Map marker ID must be a safe identifier".to_string());
    }
    Ok(())
}

fn validate_world_id(world_id: &str) -> Result<(), String> {
    if world_id.trim().is_empty()
        || world_id == "."
        || world_id == ".."
        || world_id.contains(['/', '\\', ':'])
        || world_id.chars().any(char::is_control)
    {
        return Err("Map marker world ID must be a safe identifier".to_string());
    }
    Ok(())
}

fn is_hex_color(color: &str) -> bool {
    let bytes = color.as_bytes();
    (bytes.len() == 7 || bytes.len() == 9)
        && bytes[0] == b'#'
        && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

fn marker_order(left: &MapMarker, right: &MapMarker) -> std::cmp::Ordering {
    left.world_id
        .cmp(&right.world_id)
        .then_with(|| left.group.cmp(&right.group))
        .then_with(|| left.name.cmp(&right.name))
        .then_with(|| left.id.cmp(&right.id))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn root(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("mc-vector-map-markers-{name}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("server root");
        root
    }

    fn input(name: &str) -> MapMarkerInput {
        MapMarkerInput {
            world_id: "overworld".to_string(),
            group: "test".to_string(),
            name: name.to_string(),
            position: MapMarkerPosition {
                x: 1.0,
                y: 64.0,
                z: -2.0,
            },
            color: "#12abEF".to_string(),
        }
    }

    fn marker_from_input(id: &str, input: MapMarkerInput) -> MapMarker {
        MapMarker {
            id: id.to_string(),
            world_id: input.world_id,
            group: input.group,
            name: input.name,
            position: input.position,
            color: input.color,
        }
    }

    #[test]
    fn crud_persists_atomically_and_lists_deterministically() {
        let root = root("crud");
        let mut store = read_store(&root).expect("empty store");
        let second = marker_from_input("b", input("Bravo"));
        let first = marker_from_input("a", input("Alpha"));
        store.markers.extend([second, first.clone()]);
        write_store(&root, &mut store).expect("atomic write");

        let mut loaded = read_store(&root).expect("persisted store");
        assert_eq!(loaded.markers[0].id, "a");
        loaded
            .markers
            .iter_mut()
            .find(|marker| marker.id == "a")
            .expect("first marker")
            .name = "Updated".to_string();
        write_store(&root, &mut loaded).expect("updated store");
        let updated = read_store(&root).expect("updated persisted store");
        assert_eq!(
            updated
                .markers
                .iter()
                .find(|marker| marker.id == "a")
                .expect("updated marker")
                .name,
            "Updated"
        );

        updated
            .markers
            .iter()
            .for_each(|marker| validate_marker(marker).expect("valid marker"));
        let mut deleted = updated;
        deleted.markers.retain(|marker| marker.id != first.id);
        write_store(&root, &mut deleted).expect("deleted store");
        assert_eq!(read_store(&root).expect("final store").markers.len(), 1);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn malformed_json_reports_a_diagnostic() {
        let root = root("malformed");
        fs::write(root.join(STORAGE_FILE_NAME), b"{not-json").expect("malformed fixture");

        let error = read_store(&root).expect_err("malformed storage should fail");
        assert!(error.starts_with("Invalid map marker JSON:"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn stores_are_isolated_by_server_root() {
        let first_root = root("isolation-a");
        let second_root = root("isolation-b");
        let mut first = MarkerStore {
            version: STORAGE_VERSION,
            markers: vec![marker_from_input("first", input("First"))],
        };
        write_store(&first_root, &mut first).expect("first store");

        assert!(read_store(&second_root)
            .expect("second store")
            .markers
            .is_empty());
        assert_eq!(
            read_store(&first_root).expect("first store").markers.len(),
            1
        );

        fs::remove_dir_all(first_root).expect("cleanup first");
        fs::remove_dir_all(second_root).expect("cleanup second");
    }

    #[test]
    fn rejects_traversal_like_marker_and_world_ids() {
        let marker = marker_from_input("../outside", input("Traversal"));
        assert!(validate_marker(&marker).is_err());

        let mut marker = marker_from_input("safe", input("Traversal"));
        marker.world_id = "../outside".to_string();
        assert!(validate_marker(&marker).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_storage_file() {
        use std::os::unix::fs::symlink;

        let root_path = root("symlink");
        let outside = root("symlink-outside");
        fs::write(outside.join(STORAGE_FILE_NAME), b"{}").expect("outside fixture");
        symlink(
            outside.join(STORAGE_FILE_NAME),
            root_path.join(STORAGE_FILE_NAME),
        )
        .expect("storage symlink");

        let error = read_store(&root_path).expect_err("symlinked storage should fail");
        assert_eq!(error, "Map marker storage is not a normal file");

        fs::remove_dir_all(root_path).expect("cleanup root");
        fs::remove_dir_all(outside).expect("cleanup outside");
    }
}
