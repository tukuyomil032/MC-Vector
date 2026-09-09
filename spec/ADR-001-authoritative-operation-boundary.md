# ADR-001: Authoritative Operation Boundary

- Status: Proposed
- Date: 2026-09-09
- Scope: Server lifecycle, backup lifecycle, and managed filesystem mutations
- Depends on: ADR-000

## Context

MC-Vector currently protects some operations with renderer refs and some operations with Rust state. The checks are not one atomic boundary. In particular, `server.rs` checks for an existing process before spawning and registers the process after spawning, while backup restore does not consult `ServerManager`.

This makes correctness depend on which caller initiated an operation. Manual backup, automatic backup, file mutation, and a direct IPC caller can each observe a different state.

## Current Failure Modes

| Current behavior | Why it fails | Required proof |
| --- | --- | --- |
| Start checks `ServerManager`, releases the lock, then spawns and registers later | Two starts can both pass the check and create processes | Concurrent start test produces at most one process |
| Exit watcher removes by server ID only | An old process can remove a newer process registered under the same ID | PID/generation regression test |
| Manual and automatic backup use separate renderer refs | React state does not serialize direct IPC or Rust-triggered work | Rust per-server lock test |
| Restore does not receive `ServerManager` | UI-only checks can be bypassed and a running server can be overwritten | Direct command rejection test |
| Managed path is checked and later reopened | A path can be swapped between validation and mutation | Symlink/reparse and lock tests |

## Decision

Rust owns the final authority for all state-changing operations. The renderer may provide UX protection, but it must not be the security or consistency boundary.

Add a managed `ServerOperationManager` with one async mutex per server ID. Every operation that changes or relies on a server directory or process must acquire the same lock.

```rust
#[derive(Clone, Copy, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OperationKind {
    Start,
    Stop,
    BackupCreate,
    BackupRestore,
    BackupDelete,
    BackupMove,
    FileMutation,
    ArtifactInstall,
}

pub struct ServerOperationManager {
    locks: std::sync::Arc<tokio::sync::Mutex<
        std::collections::HashMap<
            String,
            std::sync::Arc<tokio::sync::Mutex<()>>,
        >,
    >>,
}
```

The manager exposes an owned guard so the lock remains held across asynchronous work.

```rust
impl ServerOperationManager {
    pub async fn acquire(
        &self,
        server_id: &str,
        kind: OperationKind,
    ) -> Result<OperationGuard, AppError>;
}
```

The operation kind is included in audit logs and diagnostics. It is not used to permit unsafe parallel mutations.

## Server lifecycle generation

`RunningServer` gains a monotonically increasing generation.

```rust
pub(crate) struct RunningServer {
    command_tx: tokio::sync::mpsc::Sender<String>,
    pub(crate) pid: u32,
    pub(crate) generation: u64,
}
```

The exit watcher removes state only when both PID and generation still match.

```rust
pub async fn remove_if_current(
    &self,
    server_id: &str,
    pid: u32,
    generation: u64,
) -> bool;
```

The sequence for `start_server` is:

1. Validate all input and managed paths.
2. Acquire the server operation guard.
3. Check running-server count and duplicate state while holding the guard.
4. Spawn the child process.
5. Capture all required stdio handles.
6. Register PID and generation before releasing the guard.
7. Start the exit watcher with the captured identity.
8. Emit the status event.

If a child is spawned but its handles cannot be captured or registration fails, the child is terminated and no running state is advertised.

## Error contract

Commands return a serializable structured error. The frontend branches on `code`, not on localized message text.

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}
```

Required codes include:

```text
server-running
server-not-running
operation-in-progress
server-not-found
permission-denied
path-outside-managed-root
restore-conflict
invalid-manifest
checksum-mismatch
artifact-verification-required
catalog-corrupt
```

## Implementation Plan

- Add `src-tauri/src/state/operation_manager.rs` and export it from the application library.
- Register the manager with `tauri::Builder::manage`.
- Wrap server start, stop, backup create/restore/delete/move, managed write/delete/move, import commit, and artifact install in the manager.
- Add PID and generation to `ServerManager` state.
- Replace string-only failures at the modified boundaries with `AppError` codes while retaining safe human-readable messages.
- Remove renderer refs as correctness mechanisms; retain them only to prevent duplicate clicks and to render progress.
- Keep every async Tauri command argument owned (`String`, `Vec<T>`, or owned request structs).
- Register every new command in `tauri::generate_handler![]`.

## Failure Handling

- A lock acquisition timeout or already-running conflict returns `operation-in-progress`.
- A stop request that cannot be delivered returns `server-not-running` only when state is already absent; transport errors remain explicit failures.
- A stale watcher performs no state mutation and emits no misleading offline event.
- A failed start cleans up the child process and does not leave a phantom `RunningServer` entry.

## Verification Plan

Add Rust tests for concurrent start, stale watcher removal, backup/restore/file-write contention, and direct IPC-style command rejection. Keep existing renderer tests for UX state and add error-code mapping tests.

```bash
cargo test --quiet
pnpm test
pnpm typecheck:tests
pnpm build
```

## Exit Criteria

- The same server cannot have overlapping state-changing operations.
- Two concurrent starts create at most one child process.
- An old process exit cannot delete a newer process state.
- A direct restore command is rejected while the server is running.
- Renderer refs are not required for correctness.
- All modified Tauri commands are registered and use owned async arguments.
