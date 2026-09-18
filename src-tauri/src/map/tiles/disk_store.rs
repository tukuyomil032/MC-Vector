use std::fs;
use std::path::Path;

use uuid::Uuid;

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const MAX_TILE_BYTES: u64 = 16 * 1024 * 1024;

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
}
