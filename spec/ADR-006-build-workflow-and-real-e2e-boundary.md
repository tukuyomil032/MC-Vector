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

The harness uses an unsigned local debug Tauri binary and Tauri's WebDriver integration with `tauri-driver` and `selenium-webdriver`. It does not require a certificate, notarization, paid service, or a cloud browser.

The real suite covers only high-value paths:

1. Start the actual Tauri application and load the real built frontend.
2. Create an offline test server and its temporary app profile.
3. Create a Full backup through the UI.
4. Mutate the fixture server directory outside the UI.
5. Restore through the UI.
6. Verify real files and manifest metadata.
7. Verify catalog reload after app restart.
8. Verify the real error state for a restore rejected while running.
9. Verify a forced restore failure leaves the old directory intact.

The suite never touches a user's real server directory.

Tauri-specific setup:

```typescript
const capabilities = new Capabilities();
capabilities.setBrowserName("wry");
capabilities.set("tauri:options", {
  application: absoluteDebugBinaryPath,
});

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

Run the real Tauri suite before releases and after backup, restore, capability, or IPC changes:

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

- Add `selenium-webdriver` only if it is not already available and record it in the lockfile.
- Add a deterministic debug-binary build step used by the local smoke command.
- Start and stop `tauri-driver` with guaranteed cleanup.
- Use temporary app data and server fixtures.
- Add the smallest set of `data-testid` selectors needed by the smoke scenarios.
- Keep mock E2E fixtures separate from real Tauri fixtures.
- Pin mutable workflow actions to SHAs without changing the surrounding workflow.

## Failure Handling

- A missing binary fails before the suite starts and cleans up the driver.
- A driver startup timeout fails the test; it does not silently fall back to mocks.
- Fixture cleanup runs on success and failure.
- A real Tauri test is never reported as passed because the mock suite passed.

## Exit Criteria

- Existing mock E2E remains green and fast.
- `pnpm test:tauri:e2e` crosses React, Tauri IPC, Rust, and filesystem boundaries.
- Backup and restore are verified through the real application.
- The real suite uses only temporary test data.
- Mutable workflow action references are gone.
- No signing or broad build-workflow change is introduced.
