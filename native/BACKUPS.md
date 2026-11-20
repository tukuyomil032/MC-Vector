# Native Backup API

Native backup operations implement UI-011 and OP-BACK-001..005. The shared Rust
core owns archive, catalog, restore, retention, tag, and schedule behavior. Swift
uses typed `CoreClient` methods; it does not pass arbitrary paths to the backup
engine. Core validates the registered server and resolves archives below
`backups/<serverID>`.

## Public interfaces

| Operation | Swift API | Result |
| --- | --- | --- |
| OP-BACK-001 manual create | `CoreClient.createBackup(serverID:backupName:compressionLevel:stopRunningServer:)` (`backupName` defaults to `nil`) | `BackupOperation` |
| OP-BACK-002 list | `CoreClient.backups(serverID:)` | `[BackupRecord]` |
| Metadata read/write | `CoreClient.backupMetadata(serverID:)`, `setBackupMetadata(serverID:backupName:tags:note:)` | `BackupMetadataCatalog` |
| OP-BACK-003 restore | `CoreClient.restoreBackupWithProgress(serverID:backupName:)` | `BackupRestoreOperation` |
| OP-BACK-004 delete | `CoreClient.deleteBackup(serverID:backupName:)` | refreshed `[BackupRecord]` |
| OP-BACK-005 retention | `CoreClient.applyBackupRetention(serverID:retainCount:retainDays:)` | `BackupRetentionReport` |
| Duration estimate | `CoreClient.estimateBackupDuration(targetBytes:history:)` | optional `BackupEstimate` |
| Automatic scheduler | `CoreClient.tickAutomaticBackups()` | `AutomaticBackupTick` |
| Cancel create | `BackupOperation.cancel()` or `CoreClient.cancelBackup(operationID:)` | `Bool` indicating whether the active operation accepted the request |

Native manual create always snapshots the complete managed server tree. It does
not expose source selection (`GAP-001`). The optional name and compression level
are validated by Rust; when no name is supplied the core generates one. If the server is running, create returns
`BackupCreateOutcome.confirmationRequired` until the caller retries with
`stopRunningServer: true`. When Native stops a running server for a manual
backup, it attempts to restart it after either success or failure.

`BackupRecord` contains the verified manifest values: `name`, backup/server IDs,
archive path, kind, consistency, origin, creation time, file and byte counts,
SHA-256, manifest version, restore eligibility, optional duration, and the
per-archive `tags` and `note`. List results compose those values with the shared
metadata sidecar. A successful manual create returns its new record; if catalog
rebuilding fails, `record` is `nil` and `catalogWarning` explains why the archive
is still reported as created. The metadata catalog also stores the latest
managed-file snapshot.
A missing backup directory/list is empty; unreadable catalog or invalid archive
errors remain visible as typed failures or warnings.

## Progress and cancellation

`BackupOperation` and `BackupRestoreOperation` return immediately with an
operation ID and an `AsyncStream<BackupProgressEvent>`; the listener is attached
before Rust starts the worker. The stream uses latest-value buffering, so the UI
should render each event it receives and use `value()` for the terminal result.
Events carry `operationId`, `serverId`, `sequence`, `emittedAtMs` (UNIX epoch
milliseconds), `progress` (normalized 0.0–1.0 fraction), and `currentFile`
(relative archive path).
Sequence starts at 1 for each operation; discard stale values at or below the
last sequence received for that operation. Create and restore both report
progress; list, delete, retention, and metadata operations do not invent it.

Manual and automatic archive creation accept cancellation by operation ID.
`cancel()` reports whether the request was accepted; it does not mean the worker
has stopped. Keep observing the operation and await its terminal result. Core
checks cancellation while collecting/copying/compressing files and immediately
before atomic archive installation. Before installation, cancellation discards
the staged archive. Once installation succeeds, a valid archive remains even
if catalog rebuilding later fails; the result reports creation with a catalog
warning. Stopping/restarting a server and waiting for the per-server operation
lock are lifecycle work, not instantaneous cancellation points.

Restore reports progress but does not expose cancellation because replacing a
server tree has no safe cancellation contract. Delete, retention, metadata
reads/writes, and list operations expose neither cancellation nor progress.
Duration estimation is synchronous and does not perform I/O.

| Operation | Cancellation | Progress | Retry behavior |
| --- | --- | --- | --- |
| Manual create | Supported at archive checkpoints | Yes | No automatic retry; a retry uses a new operation ID after the terminal result is handled |
| Automatic create | Supported at archive checkpoints | Yes | Core retries a failed/skipped schedule after its retry delay; it does not replay an active run |
| List / metadata read | Unsupported | No | Safe to call again as a query |
| Restore | Unsupported | Yes | No automatic retry; inspect the failure/recovery result before starting a new restore |
| Delete / retention / metadata write | Unsupported | No | No automatic retry; inspect the terminal report before repeating a mutation |
| Duration estimate | Not applicable | No | Synchronous calculation with no I/O |

## Automatic schedule

The app owns a roughly one-minute timer and calls `tickAutomaticBackups()` from
its runtime task. Keep one tick active at a time, consume its progress stream,
and await `value()` before starting the next tick. The core manager reconciles
saved per-server settings, handles due-time decisions, creates automatic full
backups, applies configured retention, and reports one terminal result for each
due server. Servers that are not due are omitted. Dropping the Swift tick handle
does not cancel a running automatic backup.

Automatic progress uses the same event type and correlation fields as manual
create. Each result includes operation/server identity, status (`created`,
`skipped`, or `failed`), optional archive name, catalog/retention warnings,
failure information, and any server restart error. A user cancellation becomes
a skipped terminal result and the automatic flow attempts the configured server
restart. App shutdown signals the manager to cancel active archive work and
leaves process cleanup to the shutdown path.

## Errors and retry behavior

Swift-facing operation errors use `CoreError { code, message, retryable }`.
Backup translations are in `Resources/native-strings.json` and the generated
`Localizable.xcstrings` catalog under `error.backup.*`. Current stable backup
codes include `backup.invalid_name`, `backup.not_found`,
`backup.corrupt_archive`, `backup.catalog_failed`, `backup.restore_failed`,
`backup.invalid_source`, and `backup.io`; cancellation uses
`operation.cancelled`. Catalog rebuild after an installed archive and retention
deletion failures are returned as warnings/reports rather than hiding a backup
that was successfully installed.

List, restore, delete, retention, and metadata mutations require a registered
server and use the per-server operation lock. Restore refuses a running server.
The core enforces managed-root boundaries and archive integrity; Swift-side name
checks are not a security boundary.
