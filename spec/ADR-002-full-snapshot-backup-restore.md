# ADR-002: Full Snapshot Backup and Transactional Restore

- Status: Proposed
- Date: 2026-09-09
- Scope: Managed server backup creation, validation, and restoration
- Depends on: ADR-001

## Context

The current renderer calculates changed files for a differential backup, but the Rust restore path extracts one archive without resolving a parent chain or applying deletion tombstones. A single differential archive therefore cannot represent a complete server state.

The current extraction path also opens an existing destination file with truncation before the entire restore has succeeded. An I/O error can leave an existing file empty or partially written.

## Current Failure Modes

| Current behavior | Why it fails | Required proof |
| --- | --- | --- |
| Renderer sends selected/changed sources | Two filesystem traversals can disagree and the archive is not self-contained | Rust-only snapshot test |
| Differential metadata stores a parent but restore opens one ZIP | Parent chain and deletion semantics are not applied | Full restore after deletion test |
| Existing files use `.truncate(true)` during extraction | Mid-restore failure damages the live server directory | Failure-injection rollback test |
| Restore does not require a stopped server in Rust | A Minecraft process can write while files are replaced | Direct command rejection test |
| Live backup is indistinguishable from a safe restore point | Users can trust an internally valid but logically mixed snapshot | Manifest and UI consistency test |

## Decision

The normal Backup feature creates only a self-contained Full snapshot. Differential mode is removed from the Backup UI and data model.

The archive includes the complete server tree except for explicitly defined runtime artifacts:

- `session.lock`
- MC-Vector operation temporary directories
- incomplete temporary files created by MC-Vector

The collector does not follow symlinks or Windows reparse points. Absolute paths, drive-qualified paths, `..`, NUL bytes, and unsupported filesystem types are rejected.

Selected-path archives, if retained, are an explicitly separate `Export` feature. They are not inserted into the normal Backup catalog and cannot be presented as a full restore point.

## Manifest contract

Every restoreable archive contains a `manifest.json` entry.

```json
{
  "formatVersion": 2,
  "backupId": "uuid",
  "serverId": "server-id",
  "kind": "full",
  "consistency": "quiesced",
  "origin": "manual",
  "createdAt": "2026-09-09T12:34:56.789Z",
  "rootFingerprint": "sha256",
  "fileCount": 1234,
  "totalBytes": 987654321,
  "entries": [
    {
      "path": "world/level.dat",
      "kind": "file",
      "size": 123456,
      "sha256": "64-lowercase-hex"
    }
  ]
}
```

Manifest requirements:

- `formatVersion` is validated before extraction.
- Entry paths are normalized relative POSIX-style paths.
- Entries are sorted deterministically.
- Each file has a size and SHA-256.
- Entry count, aggregate size, entry size, path depth, and compression ratio are bounded.
- The manifest itself is excluded from the server tree during restore.

## Consistency modes

Only these consistency values are valid:

```text
quiesced
live
```

### Stop then back up

When a running server is backed up manually, show:

```text
Cancel
Stop server, then back up
Back up now
```

`Stop server, then back up` is the default.

The safe flow is:

1. Acquire the ADR-001 operation guard.
2. Confirm the server state.
3. Request a graceful stop.
4. Wait for process exit up to the configured timeout.
5. Create and verify the Full snapshot in Rust.
6. Register the resulting record.
7. If the server was running before the operation, restart according to the setting below.

```ts
type ServerBackupSettings = {
  backupRestartAfterSafeBackup: boolean;
};
```

The default is `true`. If it is `false`, a server stopped for a safe backup remains stopped. An originally offline server is never restarted by this setting.

If graceful stop times out or fails, no backup is registered.

Automatic backup always uses this safe stop flow. It does not silently fall back to a live snapshot. If stop fails, the automatic operation reports failure and does not create a backup.

### Back up now

`Back up now` is an explicit override and creates a `live` snapshot.

- The manifest must say `consistency: "live"`.
- The UI must label it `Live snapshot`.
- It is not eligible for the normal Restore action.
- It may only be extracted to a new directory for inspection.
- Any read or I/O failure removes the temporary archive and does not update the catalog.

An internally valid ZIP does not prove that Minecraft data is logically consistent when files are being written concurrently.

## Transactional restore

Restore never extracts directly into the live server directory.

```rust
pub async fn restore_full_snapshot(
    &self,
    server_id: String,
    archive: ManagedBackupPath,
) -> Result<RestoreResult, AppError> {
    let _guard = self.operations.acquire(
        &server_id,
        OperationKind::BackupRestore,
    ).await?;

    self.server_manager.ensure_stopped(&server_id).await?;
    let manifest = self.verify_archive_and_manifest(&archive).await?;
    let staging = self.create_restore_staging_dir(&server_id).await?;

    if let Err(error) = self.extract_and_verify(&archive, &manifest, &staging).await {
        self.remove_staging(&staging).await;
        return Err(error);
    }

    self.swap_server_directory_transactionally(&server_id, &staging).await
}
```

The swap algorithm is:

1. Verify the archive hash and manifest.
2. Preflight every archive entry.
3. Create a unique sibling staging directory.
4. Create each file with `create_new` and verify size/hash after writing.
5. Sync staged files and the staging directory.
6. Rename the current server directory to a unique rollback directory.
7. Rename the verified staging directory into the server path.
8. Sync the parent directory.
9. Remove the rollback directory only after the new directory is committed successfully.

If the final swap fails, restore the rollback directory. If rollback also fails, preserve both directories and return `restore-recovery-required`. Never delete the old destination before a verified replacement is available.

## Implementation Plan

- Move snapshot collection and archive creation fully into `src-tauri/src/commands/backup.rs`.
- Remove renderer recursive traversal and differential parent calculation from `BackupsView.tsx`.
- Add a Rust response containing the archive name, manifest metadata, and restore eligibility.
- Add the manual consistency modal and automatic safe-stop behavior.
- Replace direct extraction into the server directory with staging and directory swap.
- Share the safe atomic replacement helper with download and catalog code.

## Verification Plan

Add failure injection at extraction, checksum verification, current-directory rename, staging rename, and rollback recovery. Also test malformed ZIPs, path traversal, symlink/reparse points, size limits, and running server rejection.

```bash
cargo test --quiet
pnpm test
pnpm build
pnpm e2e
```

## Exit Criteria

- A Full archive restores independently.
- Deleted files are absent from the restored state when they are absent from the manifest.
- Stale files not in the manifest do not remain after restore.
- Rust rejects restore while a server is running.
- No failure-injection case changes the old live directory.
- Live snapshots are not shown as normal restoreable backups.
- The renderer does not walk the server tree to construct a backup.
