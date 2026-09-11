# ADR-007: Verification and Score Gates

- Status: Proposed
- Date: 2026-09-09
- Scope: Evidence, test layers, operating-system checks, and final hardening score
- Depends on: ADR-001 through ADR-006

## Context

A green mock E2E run is not evidence that Rust, the filesystem, a packaged Tauri application, or an operating system behaved correctly. The project needs explicit evidence boundaries so that an implementation is not scored higher than its proof.

## Evidence layers

| Layer | What it proves | What it does not prove |
| --- | --- | --- |
| Unit | Pure validation, manifest, naming, hashing, and error mapping | Tauri wiring or OS behavior |
| Rust integration | Real Rust code with temporary files, archives, processes, and state | React rendering or packaged WebView behavior |
| Renderer integration | Wrapper and UI-state behavior with controlled IPC results | Real Rust or filesystem behavior |
| Mock E2E | Fast UI navigation, modal, loading, and error regressions | Real Tauri IPC, real filesystem, OS behavior |
| Real Tauri smoke E2E | React to Tauri IPC to Rust to filesystem in an unsigned local app | All possible OS and release configurations |
| Manual OS QA | Human verification on supported macOS and Windows environments | Unexecuted environments |

Claims in reports must identify the highest evidence layer actually executed.

## Required command gates

Existing gates remain:

```bash
bun run test
bun run typecheck:tests
bun run build
bun run check
bun run e2e
cargo test --quiet
git diff --check
```

The new focused native gate is:

```bash
bun run test:tauri:e2e
```

## Current macOS evidence

The ADR-006 implementation was exercised on macOS 26.6.2 (arm64) before this
ADR was created. These results are implementation evidence for the current
checkout; they do not substitute for Windows or release-signing evidence.

| Gate | Result | Evidence boundary |
| --- | --- | --- |
| `bun run test` | 42 files and 395 tests passed | Renderer and unit behavior |
| `bun run typecheck:tests` | Passed | TypeScript test sources |
| `bun run check` | Passed | Oxlint and Oxfmt checks for configured source paths |
| `bun run build` | Passed | Vite production frontend build |
| `bun run rustfmt:check` | Passed | Rust formatting |
| `cargo test --manifest-path src-tauri/Cargo.toml --quiet` | 100 passed, 1 ignored | Rust implementation and temporary-files tests |
| `bun run e2e` | 54 passed | Mock Tauri UI regression suite |
| `bun run test:tauri:e2e` | Passed | Unsigned E2E debug app (`com.tukuyomi032.mcvector.e2e`), real IPC, Rust, process, filesystem, ZIP, Java/plugin fixtures, token UI, catalog reload, and rollback injection |
| `bun run tauri:build:debug` | Passed | Unsigned packaged `MC-Vector Debug.app`; `CFBundleIdentifier` verified as `com.tukuyomi032.mcvector.debug` |
| `bun run check:workflow-actions` | Passed | All workflow action refs are commit-SHA pinned |
| `bun run test:provider:live` | Skipped locally: restricted network (1 test skipped) | Scheduled read-only provider canary; not local provider evidence |

Computer Use also confirmed that the launched packaged application appeared
as the separate `MC-Vector Debug` app with bundle identifier
`com.tukuyomi032.mcvector.debug`. This is macOS startup/UI evidence only; it is
not Windows or signed-release evidence.

## Required Rust integration scenarios

Add tests for:

- Full snapshot restore after a file was deleted
- stale files removed according to the manifest
- restore rejection while the server is running
- malformed and truncated archives
- path traversal entries
- symlink and Windows reparse point rejection
- checksum mismatch
- failure during extraction
- failure during final swap
- rollback after swap failure
- manual backup protected from retention
- automatic retention
- same-second filename collision
- catalog rebuild and corruption recovery
- concurrent start and backup
- concurrent restore and file write
- hashless artifact rejection
- secret redaction

## Real Tauri smoke scenarios

The native suite must execute these through the actual application:

1. App startup and server list rendering.
2. EULA acceptance, fake-Java lifecycle, console command, and stop.
3. Managed file create/read/write/move/delete plus debug-only Rust-side import without source-path exposure. The Monaco overlay remains covered by mock UI tests; the real suite verifies the underlying read/write IPC commands against the real filesystem.
4. Server settings persistence.
5. Verified loopback plugin artifact installation and checksum-mismatch destination preservation.
6. Fake ngrok token flow with renderer/config non-leakage checks.
7. Offline Full backup creation, fixture mutation, and UI restore.
8. File and manifest verification after restore, catalog reload after app restart, running-server restore rejection, and restore failure with unchanged old directory.

## Manual OS checklist

On each available supported OS, record:

- unsigned local app startup procedure
- server directory isolation
- Full backup creation
- restore after deletion
- failed restore recovery
- running-server guard
- catalog repair
- artifact checksum rejection
- ngrok credential storage behavior
- import limit and cancellation behavior

Do not claim Windows evidence when only macOS was tested.

## Score model

```text
Overall =
  Security                       * 0.40
  + Implementation Correctness  * 0.35
  + Integration and E2E Evidence * 0.15
  + Maintainability and UX       * 0.10
```

Application signing and notarization are not scored as required work in this ADR suite.

Hard caps:

- Non-transactional restore: Correctness <= 6.5.
- No Rust running-server restore guard: Security and Correctness <= 7.0.
- Hashless executable artifact installation: Security <= 8.0.
- Plaintext token storage: Security <= 8.0.
- Catalog drift: Correctness <= 8.0.
- Mock E2E without real Tauri smoke coverage: Integration <= 7.0.
- Mutable workflow action references: Security <= 9.0.
- No failure-injection evidence: Correctness <= 9.0.
- No packaged real Tauri smoke execution: Overall <= 9.0.

## 9.5 acceptance

- No unresolved Critical or High findings.
- All ADR exit criteria are complete.
- Rust integration tests pass.
- Existing mock E2E passes.
- Focused real Tauri smoke E2E passes.
- macOS evidence is recorded.
- Windows evidence is recorded for supported Windows paths when a Windows environment is available.
- Workflow action references are SHA-pinned.
- No unverified behavior is described as verified.

## 10.0 acceptance

All 9.5 conditions plus:

- Real failure recovery is observed on the supported operating systems.
- Catalog recovery is observed after corruption or removal.
- Artifact verification and credential-store behavior are verified on the target OS.
- There are no unowned or undated Medium findings.

## Evidence record format

Each gate records:

```text
commit
command or manual scenario
environment and OS
result
artifact/log path
known limitations
```

This prevents the project from confusing implementation, automated tests, manual QA, local commits, pushes, releases, and user acceptance.
