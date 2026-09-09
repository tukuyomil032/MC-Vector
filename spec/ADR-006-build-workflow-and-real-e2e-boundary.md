# ADR-006: Build Workflow and Real E2E Boundary

- Status: Proposed
- Date: 2026-09-09
- Scope: Existing build checks, workflow action pinning, and focused real Tauri smoke tests
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

The real suite covers these high-value paths with an isolated temporary app profile:

1. Start the actual Tauri application and load the real built frontend.
2. Accept the EULA, start a fake Java process, send a console command, and stop it while checking real process/filesystem state.
3. Create, edit, save, move, delete, and import managed files; the debug-only import source stays Rust-side.
4. Persist server settings in the real app profile.
5. Install a loopback fixture artifact through the verified staging/checksum/atomic-replace path; a mismatch leaves the previous destination untouched.
6. Drive a fake ngrok binary through the token UI and assert that its test token is absent from renderer DOM and config storage.
7. Create a Full backup through the UI, mutate the fixture, restore it, verify its manifest/catalog, and reload the catalog after restart.
8. Verify the real error state for a restore rejected while running and a forced restore failure that leaves the old directory intact.

The suite never touches a user's real server directory.

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

Do not make every pull request depend on the slower native harness in the first iteration.

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
- Add the smallest set of `data-testid` selectors needed by the smoke scenarios.
- Keep mock E2E fixtures separate from real Tauri fixtures.
- Pin mutable workflow actions to SHAs without changing the surrounding workflow.

## Failure Handling

- A missing binary fails before the suite starts and cleans up the driver.
- A missing platform WebDriver CLI fails before the suite starts with an install instruction.
- A driver startup timeout fails the test; it does not silently fall back to mocks.
- Fixture cleanup runs on success. On failure, the temporary root is retained and reported so CI can upload diagnostics.
- A real Tauri test is never reported as passed because the mock suite passed.

## Exit Criteria

- Existing mock E2E remains green and fast.
- `pnpm test:tauri:e2e` crosses React, Tauri IPC, Rust, and filesystem boundaries.
- Backup and restore are verified through the real application.
- The real suite uses only temporary test data.
- Mutable workflow action references are gone.
- No signing or broad build-workflow change is introduced.
