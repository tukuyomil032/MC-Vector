use super::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapWorldInfo {
    pub world_id: String,
    pub has_terrain: bool,
    pub generated_chunk_count: usize,
    pub min_chunk_x: Option<i64>,
    pub max_chunk_x: Option<i64>,
    pub min_chunk_z: Option<i64>,
    pub max_chunk_z: Option<i64>,
    pub center_x: i64,
    pub center_z: i64,
    pub spawn_x: Option<i64>,
    pub spawn_y: Option<i64>,
    pub spawn_z: Option<i64>,
    pub data_version: Option<i64>,
    pub recommended_zoom: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MapWorldEntry {
    pub world_id: String,
    pub label: String,
    pub dimension: String,
    pub available: bool,
}

const STANDARD_WORLDS: [(&str, &str, &str); 3] = [
    ("overworld", "Overworld", "minecraft:overworld"),
    ("world_nether", "The Nether", "minecraft:the_nether"),
    ("world_the_end", "The End", "minecraft:the_end"),
];
const STANDARD_WORLD_DIRECTORIES: [&str; 3] = ["world", "world_nether", "world_the_end"];

#[tauri::command]
pub async fn get_map_world_info(
    app: AppHandle,
    server_id: String,
    world_id: String,
) -> Result<MapWorldInfo, String> {
    let app_data = super::app_data_dir(&app)?;
    let server_root = super::server_dir(&app_data, &server_id)?;
    let world_root = super::resolve_world_directory(&server_root, &world_id)?;
    tokio::task::spawn_blocking(move || super::inspect_world_info(&world_root, &world_id))
        .await
        .map_err(|error| format!("Map world inspection worker failed: {error}"))?
}

#[tauri::command]
pub async fn get_map_worlds(
    app: AppHandle,
    server_id: String,
) -> Result<Vec<MapWorldEntry>, String> {
    let app_data = super::app_data_dir(&app)?;
    let server_root = super::server_dir(&app_data, &server_id)?;
    tokio::task::spawn_blocking(move || list_map_worlds(&server_root))
        .await
        .map_err(|error| format!("Map world listing worker failed: {error}"))?
}

fn list_map_worlds(server_root: &Path) -> Result<Vec<MapWorldEntry>, String> {
    let mut worlds = STANDARD_WORLDS
        .into_iter()
        .map(|(world_id, label, dimension)| {
            let path = super::resolve_world_directory(server_root, world_id)?;
            Ok(MapWorldEntry {
                world_id: world_id.to_string(),
                label: label.to_string(),
                dimension: dimension.to_string(),
                available: is_available_world_directory(&path),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let entries = fs::read_dir(server_root)
        .map_err(|error| format!("Failed to enumerate managed server worlds: {error}"))?;
    let mut additional = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect managed world: {error}"))?;
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let Some(world_id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if STANDARD_WORLD_DIRECTORIES.contains(&world_id) || !is_available_world_directory(&path) {
            continue;
        }
        let safe_path = match super::resolve_world_directory(server_root, world_id) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if safe_path != path {
            continue;
        }
        additional.push(MapWorldEntry {
            world_id: world_id.to_string(),
            label: world_id.to_string(),
            dimension: world_id.to_string(),
            available: true,
        });
    }
    additional.sort_by(|left, right| left.world_id.cmp(&right.world_id));
    worlds.extend(additional);
    Ok(worlds)
}

fn is_available_world_directory(path: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return false;
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return false;
    }
    path.join("level.dat").is_file() || path.join("region").is_dir()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use uuid::Uuid;

    use super::*;

    fn temp_server_root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("mc-vector-map-worlds-{}", Uuid::new_v4()))
    }

    #[test]
    fn lists_standard_and_additional_worlds_in_deterministic_order() {
        let root = temp_server_root();
        for name in ["world", "world_nether", "world_the_end", "zeta", "alpha"] {
            fs::create_dir_all(root.join(name).join("region")).expect("world directory");
        }
        fs::create_dir_all(root.join("logs")).expect("non-world directory");

        let worlds = list_map_worlds(&root).expect("world listing");
        assert_eq!(
            worlds
                .iter()
                .map(|world| world.world_id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "overworld",
                "world_nether",
                "world_the_end",
                "alpha",
                "zeta"
            ]
        );
        assert!(worlds.iter().all(|world| world.available));
        assert_eq!(worlds[1].dimension, "minecraft:the_nether");
        assert_eq!(worlds[3].dimension, "alpha");

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn missing_standard_worlds_are_returned_as_unavailable() {
        let root = temp_server_root();
        fs::create_dir_all(&root).expect("server root");

        let worlds = list_map_worlds(&root).expect("world listing");
        assert_eq!(worlds.len(), 3);
        assert!(worlds.iter().all(|world| !world.available));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn ignores_symlinked_world_directories() {
        use std::os::unix::fs::symlink;

        let root = temp_server_root();
        let outside = temp_server_root();
        fs::create_dir_all(outside.join("region")).expect("outside world");
        fs::create_dir_all(&root).expect("server root");
        symlink(&outside, root.join("escaped")).expect("world symlink");

        let worlds = list_map_worlds(&root).expect("world listing");
        assert!(!worlds.iter().any(|world| world.world_id == "escaped"));

        fs::remove_dir_all(root).expect("cleanup root");
        fs::remove_dir_all(outside).expect("cleanup outside");
    }
}
