use std::fs;
use std::path::Path;

use super::tile_cache::TileMetadata;
use uuid::Uuid;

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const MAX_TILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_METADATA_BYTES: u64 = 64 * 1024;

pub(crate) fn read_png(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to inspect cached map tile: {error}")),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Cached map tile is not a regular file".to_string());
    }
    if metadata.len() > MAX_TILE_BYTES {
        return Err("Cached map tile is too large".to_string());
    }
    let bytes =
        fs::read(path).map_err(|error| format!("Failed to read cached map tile: {error}"))?;
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Ok(None);
    }
    Ok(Some(bytes))
}

pub(crate) fn write_png_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Refusing to cache a non-PNG map tile".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Map tile cache path has no parent".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create map tile cache directory: {error}"))?;
    let temporary = parent.join(format!(".{}.tmp-{}", Uuid::new_v4(), Uuid::new_v4()));
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Failed to write temporary map tile: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("Failed to atomically replace map tile: {error}"));
    }
    Ok(())
}

pub(crate) fn read_metadata(path: &Path) -> Result<Option<TileMetadata>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to inspect cached map tile metadata: {error}"
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Cached map tile metadata is not a regular file".to_string());
    }
    if metadata.len() > MAX_METADATA_BYTES {
        return Err("Cached map tile metadata is too large".to_string());
    }
    let bytes = fs::read(path)
        .map_err(|error| format!("Failed to read cached map tile metadata: {error}"))?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("Cached map tile metadata is invalid: {error}"))
}

pub(crate) fn write_metadata_atomic(path: &Path, metadata: &TileMetadata) -> Result<(), String> {
    let bytes = serde_json::to_vec(metadata)
        .map_err(|error| format!("Failed to encode map tile metadata: {error}"))?;
    let parent = path
        .parent()
        .ok_or_else(|| "Map tile metadata path has no parent".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create map tile metadata directory: {error}"))?;
    let temporary = parent.join(format!(".{}.tmp-{}", Uuid::new_v4(), Uuid::new_v4()));
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Failed to write temporary map tile metadata: {error}"))?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Failed to atomically replace map tile metadata: {error}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_writer_never_accepts_a_non_png() {
        let root = std::env::temp_dir().join(format!("mc-vector-tile-store-{}", Uuid::new_v4()));
        let path = root.join("8/0/0.png");
        assert!(write_png_atomic(&path, b"not png").is_err());
        assert!(!path.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn metadata_round_trips_atomically() {
        let root = std::env::temp_dir().join(format!("mc-vector-tile-metadata-{}", Uuid::new_v4()));
        let path = root.join("8/0/0.json");
        let expected = TileMetadata {
            rendered_chunk_count: 4,
            has_terrain: true,
            coverage_ratio: 0.25,
            message: None,
        };
        write_metadata_atomic(&path, &expected).expect("metadata should be written");
        assert_eq!(
            read_metadata(&path).expect("metadata should be read"),
            Some(expected)
        );
        let _ = fs::remove_dir_all(root);
    }
}
