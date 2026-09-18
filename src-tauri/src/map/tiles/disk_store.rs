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
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read cached map tile: {error}")),
    };
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Ok(None);
    }
    Ok(Some(bytes))
}

pub(crate) fn write_png_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Refusing to cache a non-PNG map tile".to_string());
    }
    write_bytes_atomic(
        path,
        bytes,
        "Map tile cache path has no parent",
        "map tile cache directory",
        "temporary map tile",
        "atomically replace map tile",
    )
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
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read cached map tile metadata: {error}")),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("Cached map tile metadata is invalid: {error}"))
}

pub(crate) fn write_metadata_atomic(path: &Path, metadata: &TileMetadata) -> Result<(), String> {
    let bytes = serde_json::to_vec(metadata)
        .map_err(|error| format!("Failed to encode map tile metadata: {error}"))?;
    write_bytes_atomic(
        path,
        &bytes,
        "Map tile metadata path has no parent",
        "map tile metadata directory",
        "temporary map tile metadata",
        "atomically replace map tile metadata",
    )
}

fn write_bytes_atomic(
    path: &Path,
    bytes: &[u8],
    missing_parent_message: &str,
    directory_label: &str,
    temporary_label: &str,
    replace_label: &str,
) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| missing_parent_message.to_string())?;
    let mut retried_missing_path = false;

    loop {
        match fs::create_dir_all(parent) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && !retried_missing_path => {
                retried_missing_path = true;
                continue;
            }
            Err(error) => return Err(format!("Failed to create {directory_label}: {error}")),
        }

        let temporary = parent.join(format!(".{}.tmp-{}", Uuid::new_v4(), Uuid::new_v4()));
        match fs::write(&temporary, bytes) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && !retried_missing_path => {
                retried_missing_path = true;
                let _ = fs::remove_file(&temporary);
                continue;
            }
            Err(error) => {
                let _ = fs::remove_file(&temporary);
                return Err(format!("Failed to write {temporary_label}: {error}"));
            }
        }

        match fs::rename(&temporary, path) {
            Ok(()) => return Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && !retried_missing_path => {
                retried_missing_path = true;
                let _ = fs::remove_file(&temporary);
            }
            Err(error) => {
                let _ = fs::remove_file(&temporary);
                return Err(format!("Failed to {replace_label}: {error}"));
            }
        }
    }
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
    fn png_round_trips_with_a_missing_cache_root() {
        let root = std::env::temp_dir().join(format!("mc-vector-tile-png-{}", Uuid::new_v4()));
        let path = root.join("8/0/0.png");
        let expected = b"\x89PNG\r\n\x1a\nfixture";

        write_png_atomic(&path, expected).expect("PNG should be written");
        assert_eq!(
            read_png(&path).expect("PNG should be read"),
            Some(expected.to_vec())
        );

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
