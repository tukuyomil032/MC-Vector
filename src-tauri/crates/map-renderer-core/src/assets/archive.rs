//! Bounded, hash-verified access to Minecraft client/resource-pack archives.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Cursor, Read};

use sha2::{Digest, Sha256};
use zip::ZipArchive;

use crate::security::{
    MAX_ARCHIVE_BYTES, MAX_ARCHIVE_ENTRY_BYTES, MAX_ARCHIVE_ENTRY_COUNT,
    MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES,
};

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum ArchiveError {
    EmptyArchive,
    ArchiveTooLarge,
    InvalidDigest,
    DigestMismatch,
    MalformedArchive,
    TooManyEntries,
    EntryTooLarge,
    UncompressedSizeLimit,
    UnsafeEntryPath,
    DuplicateEntry,
    EntryReadFailed,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct AssetArchive {
    sha256: [u8; 32],
    entries: BTreeMap<String, Vec<u8>>,
}

impl AssetArchive {
    pub fn from_bytes(bytes: &[u8], expected_sha256: &str) -> Result<Self, ArchiveError> {
        if bytes.is_empty() {
            return Err(ArchiveError::EmptyArchive);
        }
        if bytes.len() > MAX_ARCHIVE_BYTES {
            return Err(ArchiveError::ArchiveTooLarge);
        }
        let expected = parse_digest(expected_sha256)?;
        let actual = Sha256::digest(bytes);
        if actual.as_slice() != expected {
            return Err(ArchiveError::DigestMismatch);
        }

        let mut archive =
            ZipArchive::new(Cursor::new(bytes)).map_err(|_| ArchiveError::MalformedArchive)?;
        if archive.is_empty() {
            return Err(ArchiveError::EmptyArchive);
        }
        if archive.len() > MAX_ARCHIVE_ENTRY_COUNT {
            return Err(ArchiveError::TooManyEntries);
        }

        let mut entries = BTreeMap::new();
        let mut seen = BTreeSet::new();
        let mut total_uncompressed = 0_u64;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|_| ArchiveError::MalformedArchive)?;
            let name = validate_entry_path(entry.name())?;
            if !seen.insert(name.clone()) {
                return Err(ArchiveError::DuplicateEntry);
            }
            if entry.is_dir() {
                entries.insert(name, Vec::new());
                continue;
            }
            let declared_size = entry.size();
            if declared_size > MAX_ARCHIVE_ENTRY_BYTES {
                return Err(ArchiveError::EntryTooLarge);
            }
            total_uncompressed = total_uncompressed
                .checked_add(declared_size)
                .ok_or(ArchiveError::UncompressedSizeLimit)?;
            if total_uncompressed > MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES {
                return Err(ArchiveError::UncompressedSizeLimit);
            }
            let capacity =
                usize::try_from(declared_size).map_err(|_| ArchiveError::EntryTooLarge)?;
            let mut contents = Vec::with_capacity(capacity);
            entry
                .read_to_end(&mut contents)
                .map_err(|_| ArchiveError::EntryReadFailed)?;
            if contents.len() as u64 != declared_size {
                return Err(ArchiveError::EntryReadFailed);
            }
            entries.insert(name, contents);
        }

        Ok(Self {
            sha256: actual.into(),
            entries,
        })
    }

    pub fn sha256(&self) -> [u8; 32] {
        self.sha256
    }

    pub fn sha256_hex(&self) -> String {
        self.sha256
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    pub fn contains(&self, path: &str) -> bool {
        self.entries.contains_key(path)
    }

    pub fn entry(&self, path: &str) -> Option<&[u8]> {
        self.entries.get(path).map(Vec::as_slice)
    }

    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }
}

fn parse_digest(value: &str) -> Result<[u8; 32], ArchiveError> {
    if value.len() != 64 {
        return Err(ArchiveError::InvalidDigest);
    }
    let mut digest = [0_u8; 32];
    for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
        let high = hex_digit(pair[0]).ok_or(ArchiveError::InvalidDigest)?;
        let low = hex_digit(pair[1]).ok_or(ArchiveError::InvalidDigest)?;
        digest[index] = (high << 4) | low;
    }
    Ok(digest)
}

fn hex_digit(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn validate_entry_path(path: &str) -> Result<String, ArchiveError> {
    if path.is_empty()
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains('\0')
        || path
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
    {
        return Err(ArchiveError::UnsafeEntryPath);
    }
    Ok(path.to_owned())
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use sha2::{Digest, Sha256};
    use zip::write::SimpleFileOptions;

    use super::{ArchiveError, AssetArchive};

    fn archive_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut output = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut output);
        for (name, contents) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .expect("entry starts");
            writer.write_all(contents).expect("entry writes");
        }
        writer.finish().expect("archive finishes");
        output.into_inner()
    }

    fn digest(bytes: &[u8]) -> String {
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    #[test]
    fn valid_archive_is_hash_bound_and_readable() {
        let bytes = archive_bytes(&[("assets/minecraft/test", b"texture")]);
        let archive = AssetArchive::from_bytes(&bytes, &digest(&bytes)).unwrap();
        assert_eq!(
            archive.entry("assets/minecraft/test"),
            Some(b"texture".as_slice())
        );
        assert_eq!(archive.entry_count(), 1);
    }

    #[test]
    fn digest_and_path_failures_are_explicit() {
        let bytes = archive_bytes(&[("assets/minecraft/test", b"texture")]);
        assert_eq!(
            AssetArchive::from_bytes(&bytes, &"0".repeat(64)),
            Err(ArchiveError::DigestMismatch)
        );
        let unsafe_bytes = archive_bytes(&[("../escape", b"blocked")]);
        assert_eq!(
            AssetArchive::from_bytes(&unsafe_bytes, &digest(&unsafe_bytes)),
            Err(ArchiveError::UnsafeEntryPath)
        );
    }
}
