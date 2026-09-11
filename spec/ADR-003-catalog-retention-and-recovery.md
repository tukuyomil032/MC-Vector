# ADR-003: Catalog, Retention, Collision, and Recovery

- Status: Proposed
- Date: 2026-09-09
- Scope: Backup metadata, retention, archive naming, and recovery
- Depends on: ADR-001, ADR-002

## Context

The current renderer updates the backup catalog for manual backups, while automatic backups create archives and apply retention through a different path. Restore does not always reload the catalog, and the catalog is written through a general managed-text command rather than through a backup transaction.

Retention currently considers every ZIP and can delete manual backups. Manual names also have insufficient time precision, and the current replacement fallback removes the destination before retrying a rename.

## Current Failure Modes

| Current behavior | Why it fails | Required proof |
| --- | --- | --- |
| Manual and automatic catalog paths differ | The UI can display a state that does not describe the archive directory | Automatic-backup catalog test |
| Retention scans all ZIPs | A user-created manual backup can be deleted by an automatic policy | Manual retention protection test |
| Names use minute-level precision | Two manual operations can target one path | Same-second collision test |
| Catalog is a mutable JSON file without an archive authority | Catalog corruption or drift can hide or misidentify valid backups | Catalog rebuild test |
| Existing destination can be deleted before replacement | A failed replacement can destroy the only known copy | Replacement failure test |

## Decision

The manifest inside each archive is authoritative. The catalog is a rebuildable index and never the only source of truth.

```ts
type BackupRecord = {
  backupId: string;
  serverId: string;
  archivePath: string;
  kind: "full" | "live";
  consistency: "quiesced" | "live";
  origin: "manual" | "automatic";
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  archiveSha256: string;
  manifestVersion: number;
  restoreEligible: boolean;
};
```

Rust owns create, list, delete, move, retention, catalog update, and catalog repair. The renderer receives `BackupRecord` values and does not construct authoritative catalog state.

## Catalog write transaction

Every catalog update follows this sequence:

1. Serialize to a unique sibling temporary file.
2. Parse the temporary JSON again.
3. Validate the catalog schema.
4. Flush and sync the temporary file.
5. Atomically replace the catalog.
6. Keep the old catalog if any step fails.

The archive is not deleted until the catalog update can represent the resulting state. If catalog update fails after an archive operation, the archive is retained and repair will reconcile it later.

## Naming and collision policy

The display name and the physical archive name are separate. Physical names contain second or millisecond precision and a short ID.

```text
Backup survival-2026-09-09-12-34-56-a1b2c3.zip
```

Creation uses `create_new`. It never deletes an existing destination as a collision fallback. A collision either retries with a new ID or returns `backup-name-conflict` while preserving the old archive.

## Retention policy

Only records with `origin: "automatic"` are eligible for automatic retention.

Manual backups are never removed by automatic retention. Retention is performed under the ADR-001 per-server operation guard and updates the catalog only after each archive deletion succeeds.

```text
archive exists + valid manifest + origin automatic + outside policy => eligible
archive exists + origin manual => never eligible
archive missing or invalid => quarantine/rebuild handling, not blind deletion
```

Full snapshots do not have parent dependencies, so retention does not need to preserve a differential chain.

## Catalog repair

At startup and through an explicit repair command:

1. Scan the server backup directory.
2. Read each ZIP manifest.
3. Verify the archive SHA-256 and manifest schema.
4. Rebuild valid `BackupRecord` entries.
5. Exclude invalid archives from the normal restore list.
6. Preserve unknown or broken archives in a quarantine state for user inspection.
7. Atomically replace the catalog.

## Implementation Plan

- Add the record schema to the Rust/TypeScript boundary.
- Move automatic backup catalog updates into the same Rust path as manual backup.
- Remove renderer-side catalog authority and snapshot metadata.
- Make restore, delete, move, and retention return or trigger a fresh catalog record set.
- Add a shared safe replacement helper for backup archives, catalogs, and downloads.
- Keep old catalogs readable during migration, then rewrite them in the new schema.

## Verification Plan

```bash
cargo test --quiet
bun run test
bun run typecheck:tests
bun run build
bun run e2e
```

Required tests include manual retention protection, automatic retention, same-second naming collision, catalog corruption recovery, missing archive recovery, automatic backup synchronization, and failed replacement with the old destination intact.

## Exit Criteria

- Manual archives are never deleted by automatic retention.
- Automatic backups update the catalog through the same authoritative path.
- Same-second backup creation never overwrites an existing archive.
- A deleted or corrupt catalog can be rebuilt from archive manifests.
- Restore, delete, move, and retention do not leave catalog/archive drift.
- No implementation deletes an existing destination before a verified replacement is ready.
