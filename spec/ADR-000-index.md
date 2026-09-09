# ADR-000: MC-Vector Hardening ADR Index

- Status: Proposed
- Date: 2026-09-09
- Scope: Tauri v2 desktop application security, reliability, IPC integration, and real Tauri smoke E2E
- Out of scope: application signing, notarization, stapling, Authenticode, broad build-workflow redesign, SBOM, and provenance requirements

## Purpose

This ADR suite is the canonical implementation specification for raising MC-Vector from a roughly 5-6 point implementation to a release-ready 9.5-10 point implementation for the scoped concerns.

The suite separates implementation from evidence. A passing renderer mock test is not evidence that Rust, the filesystem, a packaged Tauri application, or an operating system behaved correctly.

## ADR Order and Dependencies

| ADR | Title | Depends on | Primary outcome |
| --- | --- | --- | --- |
| ADR-000 | Hardening ADR Index | - | Scope, order, score model, and evidence vocabulary |
| ADR-001 | Authoritative Operation Boundary | ADR-000 | Rust-owned operation locks, lifecycle generation, and stable errors |
| ADR-002 | Full Snapshot Backup and Transactional Restore | ADR-001 | Self-contained full backups and failure-safe restore |
| ADR-003 | Catalog, Retention, Collision, and Recovery | ADR-002 | Rebuildable catalog, safe retention, and collision-free archives |
| ADR-004 | Verified Artifacts and Secret Storage | ADR-001 | Mandatory artifact verification and OS credential storage |
| ADR-005 | Capability, CSP, Managed Path, and Import Safety | ADR-001 | Least privilege, path containment, and staged imports |
| ADR-006 | Build Workflow and Real E2E Boundary | ADR-002, ADR-003 | Preserve existing build flow, pin actions, and add focused real Tauri smoke tests |
| ADR-007 | Verification and Score Gates | ADR-001 through ADR-006 | Evidence matrix, failure tests, manual QA, and final score gates |

Implementation proceeds in the numbered order. A dependent ADR is not considered complete until the exit criteria of its dependencies pass.

## Problem-to-ADR Map

| Finding | ADR |
| --- | --- |
| Server start check and registration race | ADR-001 |
| Stale process watcher removing a newer process | ADR-001 |
| Manual, automatic, and filesystem operations lacking one lock | ADR-001 |
| Differential archive cannot independently restore complete state | ADR-002 |
| Restore allowed while a server is running | ADR-002 |
| Restore truncates existing files before success is known | ADR-002 |
| Destructive delete-before-replace fallback | ADR-002, ADR-003 |
| Manual backup filename collision | ADR-003 |
| Retention deleting manual backups | ADR-003 |
| Catalog drift after automatic backup or restore | ADR-003 |
| Catalog write not authoritative or rebuildable | ADR-003 |
| Server JAR checksum optional | ADR-004 |
| Java and ngrok downloads not uniformly verified | ADR-004 |
| ngrok token stored in plaintext renderer Store | ADR-004 |
| Managed path check/open TOCTOU risk | ADR-005 |
| Recursive import lacks aggregate limits and staging | ADR-005 |
| Broad Tauri capabilities | ADR-005 |
| Broad release CSP and raw HTML surface | ADR-005 |
| Mock E2E does not exercise real Rust or filesystem | ADR-006 |
| Mutable GitHub Action references | ADR-006 |
| Missing failure-injection and packaged-app evidence | ADR-007 |

## Evidence Vocabulary

| State | Meaning |
| --- | --- |
| Implemented | The code path exists in the current branch. No test claim is implied. |
| Unit-tested | Pure logic or an isolated function is covered. |
| Rust integration-tested | Real Rust code operates on real temporary files, archives, processes, or state. |
| Renderer integration-tested | React wrappers and state transitions are exercised without a real Tauri backend. |
| Mock-E2E-tested | Playwright exercises a Vite/React app with mocked Tauri APIs. |
| Real-Tauri-tested | A local unsigned Tauri application crosses React, IPC, Rust, and filesystem boundaries. |
| Manual OS-tested | A human verifies behavior on the target operating system using a packaged or debug application. |

Only evidence at or above the requested claim may be used for the final score.

## Score Model

```text
Overall =
  Security                       * 0.40
  + Implementation Correctness  * 0.35
  + Integration and E2E Evidence * 0.15
  + Maintainability and UX       * 0.10
```

Signing and notarization are explicitly not a requirement for this score model. Their absence is not silently used as a blocker.

### Hard caps

- Non-transactional restore caps Implementation Correctness at 6.5.
- Rust does not reject restore while a server is running caps Security and Correctness at 7.0.
- Unverified executable artifacts cap Security at 8.0.
- Plaintext credential storage caps Security at 8.0.
- Unresolved catalog drift caps Correctness at 8.0.
- Mock E2E without a real Tauri smoke path caps Integration at 7.0.
- Mutable action references cap Security at 9.0.
- Missing failure-injection coverage caps Correctness at 9.0.

### 9.5-10 acceptance

At least 9.5 requires zero unresolved Critical or High findings, all ADR exit criteria, green Rust integration tests, green mock E2E, green real Tauri smoke E2E, macOS verification, and Windows verification for the supported Windows-specific paths when a Windows environment is available.

A 10 requires the 9.5 conditions plus real failure recovery and catalog recovery on the supported operating systems, with no unverified behavior presented as verified.

## Phase Order

1. Phase 0: Replace legacy specifications with this ADR suite.
2. Phase 1: Add the Rust-owned operation boundary and lifecycle generation.
3. Phase 2: Replace differential Backup with full snapshots and transactional restore.
4. Phase 3: Make manifests authoritative and repair catalog/retention behavior.
5. Phase 4: Require verified artifacts and move ngrok secrets to the OS credential store.
6. Phase 5: Minimize capabilities/CSP and harden managed paths/imports.
7. Phase 6: Preserve the build workflow, pin action SHAs, and add focused real Tauri smoke E2E.
8. Phase 7: Run the evidence matrix, OS checks, and final scoring.

## Non-Goals

This suite does not introduce paid signing certificates, notarization services, a new deployment platform, a complete CI redesign, or a requirement to run the real Tauri suite on every pull request.
