# ADR-005: Capability, CSP, Managed Path, and Import Safety

- Status: Proposed
- Date: 2026-09-09
- Scope: Tauri permissions, WebView policy, managed paths, and external-folder import
- Depends on: ADR-001

## Context

The main window currently receives many permissions, including process, store, updater, opener, OS, notification, and a broad HTTP allowlist. The backup selector also receives updater permission through a shared desktop capability.

Managed path resolution validates a path and later reopens it by name. This is substantially safer than unrestricted filesystem access but still leaves a same-user TOCTOU window. Recursive folder import also copies directly toward live data without aggregate limits and a transactional commit boundary.

## Current Failure Modes

| Current behavior | Why it fails | Required proof |
| --- | --- | --- |
| Capabilities are broad and shared | A compromised or buggy window receives more power than it needs | Capability policy test |
| Release CSP permits wildcard HTTPS, localhost, and websockets | A renderer bug has a broad network escape surface | Release CSP static test |
| Raw HTML rendering is not restricted at every call site | Untrusted content can become executable markup | Sanitizer policy test |
| Path is validated and later reopened | A link/reparse point or replacement can race the check | Symlink/reparse and identity tests |
| Recursive import has no aggregate budget | A folder can consume excessive memory, disk, or time | Count/bytes/depth/timeout tests |
| Import writes toward the live tree before completion | Failure leaves partial server data | Staging failure test |

## Decision: least-privilege capabilities

Split capabilities by window and responsibility:

```text
main-core
main-server-runtime
main-backup
main-artifact-install
backup-selector
```

The backup selector does not receive updater, process, or unrelated HTTP/store permissions. Each new permission requires a corresponding ADR update and a test explaining the need.

## Decision: CSP and content rendering

Release CSP is stricter than development CSP. It does not use wildcard `http:`, wildcard `https:`, `localhost:*`, or wildcard `ws://`. `connect-src` contains only provider origins actually used by the application.

Where possible, remove `rehypeRaw`. Where raw HTML is necessary, use an explicit sanitizer schema that rejects:

- `script`
- `iframe`
- `object`
- `embed`
- `form`
- `style`
- all `on*` event attributes
- `javascript:` URLs
- unnecessary data URL MIME types

## Decision: managed path safety

All managed file operations use the following invariants:

- normalize to a strict relative path
- reject absolute, drive-qualified, `..`, NUL, and control-character paths
- reject symlinks and Windows reparse points
- keep rename operations inside the same managed root
- use random unique temporary files with `create_new`
- hold the ADR-001 operation guard across validation, open, write, and verification
- verify file identity and/or digest after a mutation
- use handle-based or no-follow opens where supported by the platform

Platform-specific limitations are documented rather than silently treated as equivalent guarantees.

## Decision: staged external import

Before copying an external folder, perform a bounded preflight:

```text
maximum file count
maximum aggregate bytes
maximum single-file bytes
maximum path depth
maximum operation duration
symlink/reparse-point policy
```

The operation is:

1. Scan and validate the source.
2. Create a unique staging directory beside the destination.
3. Copy into staging.
4. Verify copied sizes and any requested hashes.
5. Honor cancellation and timeout.
6. Atomically commit staging into the managed destination.
7. Remove staging only after success or failure cleanup.

The same single-file budget applies to managed text reads.

## Implementation Plan

- Replace shared capability grants with minimal capability files and explicit window assignments.
- Split development and release CSP values in `tauri.conf.json` without breaking the existing development URL.
- Add sanitizer policy tests for the Markdown rendering path.
- Refactor `file_utils.rs` mutation paths to use one safe resolver and operation guard.
- Add aggregate import limits and staged commit.
- Keep all new commands registered in `tauri::generate_handler![]` with owned arguments.

## Verification Plan

```bash
pnpm check
pnpm test
pnpm build
cargo test --quiet
pnpm e2e
```

Add tests for path traversal, symlink escape, Windows reparse points, aggregate import limits, cancellation, timeout, partial-import cleanup, capability overpermission, and release CSP policy.

## Exit Criteria

- Each window has only the permissions it needs.
- Release CSP has no wildcard localhost or websocket allowance.
- Dangerous raw HTML is either removed or explicitly sanitized.
- Managed path operations cannot escape their root.
- Import failure never leaves partial live data.
- File count, byte, depth, single-file, and duration budgets are enforced.
