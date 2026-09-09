# ADR-000: Hardening ADR Suite Index

Status: Accepted

## Decision

MC-Vector maintains a focused hardening ADR suite for the Tauri application. This
file is the canonical index: it defines the suite's scope, order, evidence model,
and release-quality gates. The individual ADRs are normative design records and
must keep their implementation and verification claims aligned with this index.

## Scope

The suite covers:

- Security boundaries around filesystem access, imports, secrets, downloaded
  artifacts, Tauri capabilities, and the content security policy (CSP).
- Reliability of server lifecycle operations, concurrent operations, backup
  creation, restore, replacement, rollback, and retention.
- IPC integration across React, the `src/lib/` wrappers, Tauri commands, and
  the Rust filesystem/process boundary.
- Real Tauri smoke end-to-end (E2E) verification of critical workflows in a
  packaged or otherwise genuinely launched Tauri application.

The suite is deliberately about application hardening and its evidence. It is
not a general roadmap for every feature or platform.

## Explicitly out of scope

The following are not acceptance requirements for this suite:

- Production code signing
- Apple notarization
- Apple stapling
- Windows Authenticode signing
- A broad rewrite of the build workflow
- A mandatory software bill of materials (SBOM) or provenance attestation

Unsigned or ad-hoc artifacts may therefore be used for the real-Tauri testing
gate, provided that the test records the artifact and runtime conditions. The
out-of-scope status of signing does not waive application security checks.

## ADR order and dependencies

The suite is executed in the following dependency order. An ADR may be drafted
in parallel with another ADR, but its acceptance evidence must not be claimed
until the listed predecessors are satisfied.

| Order | ADR | Title | Depends on | Why this order matters |
| --- | --- | --- | --- | --- |
| 1 | ADR-001 | Transactional Server Lifecycle and Operation Serialization | None | Establishes single-operation ownership, lifecycle state transitions, race handling, and the IPC error contract used by later operations. |
| 2 | ADR-002 | Managed Paths, Imports, and Tauri Security Boundaries | ADR-001 | Applies the security boundary to IPC requests, managed paths, imports, capabilities, and CSP without weakening lifecycle error propagation. |
| 3 | ADR-003 | Transactional Backups, Differential Restore, and Recovery | ADR-001, ADR-002 | Makes backup, restore, replacement, collision, retention, catalog, and rollback behavior safe under the serialized lifecycle and managed-path rules. |
| 4 | ADR-004 | Secrets and Downloaded Artifact Integrity | ADR-002 | Protects ngrok credentials and requires verifiable artifact hashes at the network and storage boundaries. |
| 5 | ADR-005 | Real Tauri Smoke E2E and IPC Integration Evidence | ADR-001 through ADR-004 | Verifies the integrated application path, not only isolated React mocks or Rust units. |
| 6 | ADR-006 | CI Supply-Chain and Workflow Integrity | ADR-001 through ADR-005 | Makes automated evidence trustworthy through immutable workflow references and focused checks, without rewriting the build system. |
| 7 | ADR-007 | Verification Matrix and Score Gates | ADR-001 through ADR-006 | Converts implementation and evidence into a repeatable acceptance decision and records residual risk. |

The practical dependency graph is:

```text
ADR-001 ──┬──> ADR-002 ──┬──> ADR-003 ──┐
          │              └──> ADR-004 ──┼──> ADR-005 ──> ADR-006 ──> ADR-007
          └────────────────────────────┘
```

## Problem-to-ADR mapping

| Problem or decision area | Primary ADR | Required result |
| --- | --- | --- |
| Lifecycle race | ADR-001 | State transitions and last-moment checks cannot be bypassed by a stale or overlapping lifecycle request. |
| Operation concurrency | ADR-001 | Conflicting operations are serialized or rejected with an explicit, testable result. |
| Differential restore | ADR-003 | Restore computes and applies only the intended differences, with a recoverable transaction boundary. |
| Running restore | ADR-001, ADR-003 | Restore while a server is running has an explicit stop/reject policy and cannot mutate live state accidentally. |
| Rollback | ADR-003 | Failed replacement restores the pre-operation state or reports a bounded, diagnosable recovery failure. |
| Destructive replacement | ADR-003 | Destructive writes require a protected transaction and never silently turn a partial write into success. |
| Collision | ADR-003 | Existing targets, duplicate backup names, and path collisions have deterministic refusal or replacement semantics. |
| Retention | ADR-003 | Retention deletes only eligible managed artifacts and keeps deletion, metadata, and catalog failures distinguishable. |
| Catalog drift | ADR-003 | Catalog state is reconciled with the filesystem and stale or missing entries cannot cause unsafe operations. |
| Artifact hashes | ADR-004 | Downloaded plugin or server artifacts are accepted only when an expected hash is available and matches, unless an explicit compatibility opt-in applies. |
| ngrok plaintext token | ADR-004 | Tokens are not persisted or logged as plaintext in application-managed storage or diagnostics; the chosen secure storage boundary is enforced. |
| Managed paths and imports | ADR-002 | User-controlled paths and imported server data are validated against the managed-path and special-file policy before filesystem access. |
| Capability and CSP | ADR-002 | Tauri capabilities and CSP remain least-privilege and are tested against the commands and origins the UI actually uses. |
| Mock versus real E2E | ADR-005 | Mock E2E is reported as mock evidence; a real Tauri smoke path proves packaged/runtime IPC and filesystem integration separately. |
| Workflow SHA pinning | ADR-006 | GitHub Actions references are pinned to immutable commit SHAs and the displayed version comments remain auditable. |
| Score gates | ADR-007 | The same weighted formula, hard caps, evidence rules, and acceptance conditions decide whether hardening is complete. |

## Evidence levels

Evidence levels are cumulative labels for what was actually shown. They are not
synonyms for implementation completeness.

| Level | Meaning | Does not prove |
| --- | --- | --- |
| Implemented | The behavior exists in the reviewed source and is wired into the intended path. | Correctness under all inputs, integration behavior, or real-device behavior. |
| Unit-tested | A focused isolated test passes for a function, component, or pure policy. | Rust filesystem/process integration, Tauri packaging, OS permissions, or UI-to-backend wiring. |
| Rust integration-tested | Rust integration tests exercise commands and filesystem/process boundaries using controlled fixtures. | A packaged Tauri application, browser-to-IPC wiring, or every supported operating system. |
| Mock-E2E-tested | Playwright or equivalent E2E passes with mocked Tauri APIs, services, or external systems. | Real Tauri IPC, Rust commands, filesystem effects, packaging, or OS policy. |
| Real-Tauri-tested | A genuinely launched Tauri application exercises the critical smoke workflow through the UI, IPC, Rust, and the relevant fixture filesystem. | Broad feature coverage, installer trust, signing, notarization, or every OS. |
| Manual OS-tested | A human verifies the specified behavior on the target OS and records the OS, artifact, steps, and result. | Security properties that were not tested by the recorded scenario, or other OSes not listed. |

Every completion claim must name the highest evidence level it has reached. A
green mock E2E run must never be presented as real-Tauri or manual OS evidence.

## Scoring formula

The hardening score is a weighted score out of 10:

```text
Score = (Security × 0.40)
      + (Implementation Correctness × 0.35)
      + (Integration/E2E Evidence × 0.15)
      + (Maintainability/UX × 0.10)
```

Each dimension is scored from 0.0 to 10.0 using only recorded evidence. A
dimension cannot receive credit for a higher evidence level than the one shown
in the verification record.

- **Security (40%)**: managed-path enforcement, import validation, secret
  handling, artifact integrity, capabilities, CSP, and fail-closed behavior.
- **Implementation Correctness (35%)**: lifecycle serialization, transaction
  boundaries, restore/rollback semantics, collision handling, retention, and
  catalog consistency.
- **Integration/E2E Evidence (15%)**: IPC contract coverage, Rust integration
  tests, mock E2E classification, real-Tauri smoke E2E, and manual OS evidence.
- **Maintainability/UX (10%)**: explicit errors, recoverable user flows,
  diagnosable logs without secrets, focused changes, and documentation that
  matches the implementation.

## Hard caps

Hard caps apply after the weighted score is calculated. The lowest applicable
cap is the maximum final score.

| Condition | Maximum final score |
| --- | ---: |
| A known critical vulnerability, an unbounded secret exposure, or a path/capability boundary that permits unintended access remains unresolved. | 4.0 |
| A backup or restore path can silently lose data, leave a destructive replacement partially committed, or report success after an unrecoverable transaction failure. | 5.5 |
| Lifecycle or IPC concurrency can start, stop, restore, or mutate a server through a stale request without a deterministic refusal or state check. | 6.5 |
| Critical integrated workflows have no real-Tauri smoke E2E evidence and are supported only by mocks or isolated tests. | 8.0 |
| Evidence levels are conflated, required verification records are missing, or the score cannot be reproduced from recorded results. | 8.5 |

Signing, notarization, stapling, and Authenticode are not hard-cap conditions
for this suite because they are explicitly out of scope.

## Acceptance at 9.5/10

Hardening is accepted at **9.5/10 or higher** only when all of the following
conditions hold:

1. ADR-001 through ADR-007 have an implementation status and a verification
   record; no ADR is counted as complete solely because it was documented.
2. No hard cap applies, and no unresolved critical or high-severity finding
   remains without an explicitly recorded, time-bounded exception.
3. Critical lifecycle, IPC, managed-path, backup/restore, secret, artifact,
   capability, and CSP behaviors have focused automated coverage at the
   appropriate unit or Rust integration level.
4. Mock E2E results are labeled as mock, and real-Tauri smoke E2E covers the
   critical UI-to-IPC-to-Rust path, including at least one successful flow and
   one expected refusal or failure flow.
5. The verification record identifies any manual OS-tested scenarios and does
   not imply coverage for an OS, artifact, or workflow that was not exercised.
6. The score is reproducible from the formula above, the evidence matrix, and
   the recorded residual risks; maintainability and UX are assessed rather than
   assumed from passing tests.

Production signing is explicitly not required for 9.5/10 acceptance. The
acceptance decision must instead state the unsigned or ad-hoc artifact boundary
and keep signing-related release work outside this ADR suite.
