# ADR-006: Build Workflow and Real E2E Boundary

- Status: Proposed
- Date: 2026-09-09
- Scope: Existing build checks, workflow action pinning, deterministic Real Tauri E2E, and provider canaries
- Depends on: ADR-002, ADR-003

## Context

MC-Vector currently has a fast Playwright suite that runs a Vite frontend with mocked Tauri APIs. It is valuable for renderer regressions, but it cannot prove that the Rust command, Tauri IPC registration, real filesystem, or packaged frontend assets work together.

The build workflow is already useful and is not to be redesigned. The only workflow hardening in this ADR is replacing mutable GitHub Action references with immutable commit SHAs.

Application signing, notarization, stapling, Authenticode, SBOM, provenance, and paid release certificates are explicitly out of scope.

## Current E2E boundary

The existing `pnpm e2e` path is conceptually:

```text
Playwright
  -> Chromium + Vite + React
  -> mocked Tauri API
```

It proves UI rendering, modal behavior, loading/error states, React state transitions, and arguments sent to mocked wrappers.

It does not prove:

- Rust command registration
- actual ZIP creation or extraction
- filesystem rollback
- managed path enforcement in Rust
- production capability/CSP behavior
- operating-system-specific file/process behavior
- OS credential store behavior

The mock suite remains in place.

## Decision: focused real Tauri smoke E2E

Add an on-demand command:

```bash
pnpm test:tauri:e2e
```

The harness uses an unsigned local debug Tauri binary and `selenium-webdriver`. On macOS it uses the repository's existing debug-only `tauri-plugin-webdriver-automation` together with the free `tauri-wd` CLI. On Linux and Windows it uses Tauri's native WebDriver integration with `tauri-driver`. It does not require a certificate, notarization, paid service, or a cloud browser.

The real suite covers these four high-value domains with an isolated temporary app profile:

1. Start the actual Tauri application and load the real built frontend.
2. Server lifecycle: accept the EULA, start a fake Java process, send a console command, and stop it while checking real process/filesystem state.
3. Files/import/settings: create, read/write, move, delete, and import managed files, then persist server settings in the real app profile. The debug-only import source stays Rust-side.
4. Backup/restore: create a Full backup through the UI, mutate the fixture, restore it, verify its manifest/catalog, reload the catalog after restart, and exercise running-server rejection plus rollback failure.
5. Artifact/secret integration: install a loopback plugin fixture and a Java archive through the verified staging/checksum/atomic-replace paths; a mismatch leaves the previous destination untouched. Drive a fake ngrok binary through the token UI and assert that its test token is absent from renderer DOM and config storage.

The suite never touches a user's real server directory. PR and manual-dispatch runs use
the following identifiers and must not share application data or credentials with the
production app:

```text
production: com.tukuyomi032.mcvector
debug:      com.tukuyomi032.mcvector.debug
real E2E:   com.tukuyomi032.mcvector.e2e
```

The real suite builds the unsigned E2E/debug application and runs it with temporary
app-data, server, import, artifact, Java, and fake-process fixtures. It does not launch
`/Applications/MC-Vector.app`.

The E2E process sets `MC_VECTOR_E2E=1` only for debug Rust fixture hooks. The frontend
fixture metadata additionally requires `VITE_MC_VECTOR_E2E_BUILD=debug`. Release builds
do not enable fixture injection. The deterministic PR secret path is an in-memory,
identifier-scoped debug backend; packaged macOS Keychain and Windows Credential Manager
behavior remains a separate manual/packaged OS QA obligation.

Tauri-specific setup:

```typescript
const capabilities = {
  browserName: "tauri",
  platformName: "mac",
  "tauri:options": {
    binary: absoluteDebugBinaryPath,
  },
};

const driver = await new Builder()
    .withCapabilities(capabilities)
    .usingServer("http://127.0.0.1:4444/")
  .build();
```

Add stable `data-testid` attributes only where the real smoke suite needs them. Do not rewrite the whole UI for test selectors.

## Test frequency

Keep the existing fast checks for normal development:

```text
pnpm test
pnpm typecheck:tests
pnpm build
cargo test --quiet
pnpm e2e
```

Run the real Tauri suite locally before releases and after backup, restore, capability, or IPC changes. CI runs its unsigned macOS variant on pull requests and manual dispatch; Windows runs on the daily schedule or manual dispatch. The read-only provider canary also runs only on the daily schedule or manual dispatch:

```text
pnpm test:tauri:e2e
```

The pull-request macOS job is the required native boundary for this scope. Windows and
live provider checks remain scheduled/manual jobs so pull requests do not depend on a
second operating system or on external provider availability.

The provider canary is exposed as:

```bash
pnpm test:provider:live
```

It performs read-only HTTPS, status, schema, and adapter-parse checks for Modrinth,
Hangar, Spiget, and Adoptium metadata. It does not install or execute artifacts, write
server directories, or use secrets.

## Decision: action SHA pinning only

Scan `.github/workflows/` and replace mutable `uses:` references such as `@v7`, `@v6`, `@main`, or `@master` with the exact commit SHA and retain the human-readable version in a comment.

Validation:

```bash
rg -n 'uses: .+@(main|master|v[0-9])' .github/workflows
```

The expected result is no mutable action reference. Do not change the build matrix, package installation policy, release artifact format, deployment strategy, or signing behavior.

## Implementation Plan

- Add `selenium-webdriver` and record it in the lockfile.
- Add a deterministic debug-binary build step used by the local smoke command.
- Start and stop `tauri-wd` on macOS or `tauri-driver` on Linux/Windows with guaranteed cleanup.
- Require the platform-appropriate CLI before the test starts; never silently fall back to mock E2E.
- Use temporary app data and server fixtures.
- Use deterministic fixture metadata and local artifact servers for PR E2E; never make a PR depend on a live provider download.
- Add the smallest set of `data-testid` selectors needed by the smoke scenarios.
- Keep mock E2E fixtures separate from real Tauri fixtures.
- Pin mutable workflow actions to SHAs without changing the surrounding workflow.

## Failure Handling

- A missing binary fails before the suite starts and cleans up the driver.
- A missing platform WebDriver CLI fails before the suite starts with an install instruction.
- A driver startup timeout fails the test; it does not silently fall back to mocks.
- Fixture cleanup runs on success. On failure, the temporary root is retained and reported so CI can upload diagnostics.
- A real Tauri test is never reported as passed because the mock suite passed.
- A local debug secret backend is never treated as proof of Keychain or Credential Manager behavior; those require target-OS packaged/manual QA.

## Exit Criteria

- Existing mock E2E remains green and fast.
- `pnpm test:tauri:e2e` crosses React, Tauri IPC, Rust, and filesystem boundaries.
- Backup and restore are verified through the real application.
- Server lifecycle, managed files/import/settings, artifact installation, Java verification, and ngrok token handling are also verified through the real application.
- The real suite uses only temporary test data.
- macOS PR, Windows scheduled/manual, and provider scheduled/manual workflow jobs have distinct responsibilities.
- Mutable workflow action references are gone.
- No signing or broad build-workflow change is introduced.
