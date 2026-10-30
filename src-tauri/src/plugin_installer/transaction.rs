use super::{basename, file_sha256, io, is_link, regular_file, Artifact};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const PREFIX: &str = ".mc-vector-install-";
const JOURNAL: &str = "journal.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    target: String,
    original: Option<String>,
    #[serde(default)]
    original_sha256: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Journal {
    version: u32,
    phase: Phase,
    entries: Vec<Entry>,
}
#[derive(Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Phase {
    Staging,
    Committing,
    Committed,
    Rolledback,
}

pub(super) struct Transaction {
    root: PathBuf,
    work: PathBuf,
    journal: Journal,
}

pub(super) fn sync_directory(path: &Path) -> Result<(), String> {
    // Windows does not allow opening directories using std::fs::File; rename
    // remains atomic there, while file/journal contents are always sync_all'd.
    #[cfg(not(windows))]
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(io)?;
    #[cfg(windows)]
    let _ = path;
    Ok(())
}

fn real_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(io)?;
    if is_link(&metadata) || !metadata.is_dir() {
        return Err("Transaction path must be a real directory".into());
    }
    Ok(())
}

impl Transaction {
    pub(super) fn new(root: &Path, artifacts: &[Artifact]) -> Result<Self, String> {
        real_directory(root)?;
        if fs::read_dir(root).map_err(io)?.any(|entry| {
            entry
                .ok()
                .is_some_and(|entry| entry.file_name().to_string_lossy().starts_with(PREFIX))
        }) {
            return Err(
                "Pending plugin transaction must be recovered before another install".into(),
            );
        }
        let mut names = HashSet::new();
        let mut originals = HashSet::new();
        let mut entries = Vec::new();
        for artifact in artifacts {
            let target = basename(&artifact.preview.file_name)?.to_string();
            if !names.insert(target.to_ascii_lowercase()) {
                return Err("Duplicate transaction target".into());
            }
            if let Some(original) = &artifact.original_name {
                basename(original)?;
                if !originals.insert(original.to_ascii_lowercase()) {
                    return Err("Duplicate transaction replacement".into());
                }
                let expected = artifact
                    .original_sha256
                    .as_deref()
                    .ok_or("Replacement source hash is missing from plan")?;
                if file_sha256(&root.join(original))? != expected {
                    return Err("Replacement plugin content changed after planning".into());
                }
                if !original.eq_ignore_ascii_case(&target) && regular_file(&root.join(&target))? {
                    return Err("Replacement target already exists".into());
                }
            } else if regular_file(&root.join(&target))? {
                return Err("New plugin target already exists".into());
            }
            entries.push(Entry {
                target,
                original: artifact.original_name.clone(),
                original_sha256: artifact.original_sha256.clone(),
            });
        }
        // A dependency must never overwrite another entry's source during commit.
        for entry in &entries {
            if entries.iter().any(|other| {
                other.original.as_ref() == Some(&entry.target) && other.target != entry.target
            }) {
                return Err("Install targets overlap replacement sources".into());
            }
        }
        let work = root.join(format!("{PREFIX}{}", Uuid::new_v4()));
        fs::create_dir(&work).map_err(io)?;
        let transaction = Self {
            root: root.into(),
            work,
            journal: Journal {
                version: 1,
                phase: Phase::Staging,
                entries,
            },
        };
        transaction.persist()?;
        Ok(transaction)
    }
    pub(super) fn stage(&self, index: usize) -> PathBuf {
        self.work.join(format!("stage-{index}"))
    }
    fn backup(&self, index: usize) -> PathBuf {
        self.work.join(format!("backup-{index}"))
    }

    fn persist(&self) -> Result<(), String> {
        real_directory(&self.work)?;
        let temporary = self.work.join("journal.tmp");
        if temporary.exists() {
            if !regular_file(&temporary)? {
                return Err("Unsafe temporary journal".into());
            }
            fs::remove_file(&temporary).map_err(io)?;
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(io)?;
        file.write_all(&serde_json::to_vec(&self.journal).map_err(|error| error.to_string())?)
            .map_err(io)?;
        file.sync_all().map_err(io)?;
        // The only metadata publication point; recovery always reads the last
        // complete journal, never a partially written JSON document.
        fs::rename(temporary, self.work.join(JOURNAL)).map_err(io)?;
        sync_directory(&self.work)?;
        sync_directory(&self.root)
    }

    pub(super) fn discard(self) -> Result<(), String> {
        self.cleanup()
    }

    fn cleanup(&self) -> Result<(), String> {
        real_directory(&self.work)?;
        // Do not recurse into anything supplied by a journal or encountered on
        // disk. A symlink/unexpected directory leaves the transaction intact.
        for entry in fs::read_dir(&self.work).map_err(io)? {
            let entry = entry.map_err(io)?;
            if !regular_file(&entry.path())? {
                return Err("Unsafe transaction cleanup entry".into());
            }
        }
        // Keep journal until every other file is gone: interrupted cleanup of a
        // committed transaction must never be mistaken for an uncommitted one.
        for entry in fs::read_dir(&self.work).map_err(io)? {
            let entry = entry.map_err(io)?;
            if entry.file_name() != JOURNAL {
                fs::remove_file(entry.path()).map_err(io)?;
            }
        }
        fs::remove_file(self.work.join(JOURNAL)).map_err(io)?;
        fs::remove_dir(&self.work).map_err(io)?;
        sync_directory(&self.root)
    }

    pub(super) fn commit(mut self) -> Result<Vec<String>, String> {
        for index in 0..self.journal.entries.len() {
            if !regular_file(&self.stage(index))? {
                return Err("Missing staged artifact".into());
            }
        }
        self.journal.phase = Phase::Committing;
        self.persist()?;
        let result = (|| {
            for (index, entry) in self.journal.entries.iter().enumerate() {
                if let Some(original) = &entry.original {
                    let expected = entry
                        .original_sha256
                        .as_deref()
                        .ok_or("Replacement source hash is missing from transaction")?;
                    if file_sha256(&self.root.join(original))? != expected {
                        return Err("Replacement plugin content changed before commit".into());
                    }
                    fs::rename(self.root.join(original), self.backup(index)).map_err(io)?;
                    // A writer can race the last pre-rename read; retain and
                    // restore its updated bytes rather than publishing over it.
                    if file_sha256(&self.backup(index))? != expected {
                        return Err(
                            "Replacement plugin content changed while staging backup".into()
                        );
                    }
                    sync_directory(&self.work)?;
                    sync_directory(&self.root)?;
                }
                if regular_file(&self.root.join(&entry.target))? {
                    return Err("Install destination appeared during commit".into());
                }
                fs::rename(self.stage(index), self.root.join(&entry.target)).map_err(io)?;
                sync_directory(&self.work)?;
                sync_directory(&self.root)?;
            }
            Ok::<(), String>(())
        })();
        if let Err(error) = result {
            return match self.rollback_and_mark() {
                Ok(())=>{self.cleanup()?;Err(format!("Plugin install failed; prior files restored: {error}"))},
                Err(recovery)=>Err(format!("Plugin install failed; recovery journal retained: {error}; rollback: {recovery}")),
            };
        }
        self.journal.phase = Phase::Committed;
        // If recording commit fails, rollback while backups are still intact.
        if let Err(error) = self.persist() {
            self.journal.phase = Phase::Committing;
            self.rollback_and_mark()?;
            self.cleanup()?;
            return Err(error);
        }
        let names = self
            .journal
            .entries
            .iter()
            .map(|entry| entry.target.clone())
            .collect();
        // Installation is already durable; leave a committed journal on cleanup
        // failure for the next startup instead of claiming installation failed.
        if let Err(error) = self.cleanup() {
            log::warn!("Plugin transaction cleanup deferred: {error}");
        }
        Ok(names)
    }

    fn rollback_and_mark(&mut self) -> Result<(), String> {
        self.rollback()?;
        // Cleanup may itself be interrupted. Record completed rollback before
        // deleting backups so recovery will not remove restored destinations.
        self.journal.phase = Phase::Rolledback;
        self.persist()
    }

    fn rollback(&self) -> Result<(), String> {
        for (index, entry) in self.journal.entries.iter().enumerate().rev() {
            let stage_present = regular_file(&self.stage(index))?;
            let target = self.root.join(&entry.target);
            if !stage_present && regular_file(&target)? {
                fs::remove_file(&target).map_err(io)?;
            }
            let backup = self.backup(index);
            if regular_file(&backup)? {
                let original = entry
                    .original
                    .as_ref()
                    .ok_or("Unexpected transaction backup")?;
                let destination = self.root.join(original);
                regular_file(&destination)?;
                // Retaining backups makes rollback idempotent if interrupted
                // after restoring any number of original filenames.
                let restore = self.work.join(format!("restore-{index}"));
                if regular_file(&restore)? {
                    fs::remove_file(&restore).map_err(io)?;
                }
                fs::copy(&backup, &restore).map_err(io)?;
                File::open(&restore)
                    .and_then(|file| file.sync_all())
                    .map_err(io)?;
                fs::rename(restore, destination).map_err(io)?;
            }
            sync_directory(&self.root)?;
        }
        Ok(())
    }
}

pub(super) fn transaction_identifier(name: &std::ffi::OsStr) -> Result<Option<Uuid>, String> {
    if !name.as_encoded_bytes().starts_with(PREFIX.as_bytes()) {
        return Ok(None);
    }
    let name = name
        .to_str()
        .ok_or("Invalid transaction directory identifier")?;
    Uuid::parse_str(&name[PREFIX.len()..])
        .map(Some)
        .map_err(|_| "Invalid transaction directory identifier".into())
}

pub(super) fn recover_directory(root: &Path) -> Result<(), String> {
    real_directory(root)?;
    for entry in fs::read_dir(root).map_err(io)? {
        let entry = entry.map_err(io)?;
        // Only our ASCII namespace is interpreted as a journal directory;
        // unrelated filenames need not be valid Unicode.
        if transaction_identifier(&entry.file_name())?.is_none() {
            continue;
        }
        let work = entry.path();
        real_directory(&work)?;
        let path = work.join(JOURNAL);
        if !regular_file(&path)? {
            // A crash between mkdir and the first journal can only leave an
            // empty directory or journal.tmp; no target has been touched yet.
            let entries = fs::read_dir(&work)
                .map_err(io)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(io)?;
            if entries
                .iter()
                .any(|entry| entry.file_name() != "journal.tmp")
            {
                return Err("Transaction journal is missing; manual recovery required".into());
            }
            for entry in entries {
                if regular_file(&entry.path())? {
                    fs::remove_file(entry.path()).map_err(io)?;
                }
            }
            fs::remove_dir(work).map_err(io)?;
            continue;
        }
        let journal: Journal = serde_json::from_slice(&fs::read(path).map_err(io)?)
            .map_err(|error| format!("Invalid transaction journal: {error}"))?;
        if journal.version != 1 || journal.entries.len() > 128 {
            return Err("Unsupported plugin transaction journal".into());
        }
        let mut targets = HashSet::new();
        let mut originals = HashSet::new();
        for entry in &journal.entries {
            basename(&entry.target)?;
            if !targets.insert(entry.target.to_ascii_lowercase()) {
                return Err("Duplicate recovery target".into());
            }
            if let Some(original) = &entry.original {
                basename(original)?;
                if !originals.insert(original.to_ascii_lowercase()) {
                    return Err("Duplicate recovery original".into());
                }
            }
        }
        let mut transaction = Transaction {
            root: root.into(),
            work,
            journal,
        };
        if transaction.journal.phase == Phase::Committing {
            transaction.rollback_and_mark()?;
        }
        transaction.cleanup()?;
    }
    Ok(())
}

#[cfg(test)]
pub(super) fn simulate_interrupted_commit(
    root: &Path,
    artifacts: &[Artifact],
    count: usize,
) -> Result<(), String> {
    let mut transaction = Transaction::new(root, artifacts)?;
    for index in 0..artifacts.len() {
        fs::write(transaction.stage(index), format!("new-{index}")).map_err(io)?;
    }
    transaction.journal.phase = Phase::Committing;
    transaction.persist()?;
    for (index, entry) in transaction.journal.entries.iter().enumerate().take(count) {
        if let Some(original) = &entry.original {
            fs::rename(root.join(original), transaction.backup(index)).map_err(io)?;
        }
        fs::rename(transaction.stage(index), root.join(&entry.target)).map_err(io)?;
    }
    Ok(())
}

#[cfg(test)]
pub(super) fn simulate_interrupted_cleanup(
    root: &Path,
    artifacts: &[Artifact],
    rolled_back: bool,
) -> Result<(), String> {
    let mut transaction = Transaction::new(root, artifacts)?;
    for index in 0..artifacts.len() {
        fs::write(transaction.stage(index), format!("new-{index}")).map_err(io)?;
    }
    transaction.journal.phase = Phase::Committing;
    transaction.persist()?;
    for (index, entry) in transaction.journal.entries.iter().enumerate() {
        if let Some(original) = &entry.original {
            fs::rename(root.join(original), transaction.backup(index)).map_err(io)?;
        }
        fs::rename(transaction.stage(index), root.join(&entry.target)).map_err(io)?;
    }
    if rolled_back {
        transaction.rollback_and_mark()?;
    } else {
        transaction.journal.phase = Phase::Committed;
        transaction.persist()?;
    }
    // Recovery must not need any backup once rollback/commit is durable.
    for index in 0..artifacts.len() {
        if regular_file(&transaction.backup(index))? {
            fs::remove_file(transaction.backup(index)).map_err(io)?;
        }
    }
    Ok(())
}
