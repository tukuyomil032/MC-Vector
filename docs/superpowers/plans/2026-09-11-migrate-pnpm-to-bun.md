# Bun 1.4.2 Package Manager Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task.

**Goal:** Replace pnpm with Bun 1.4.2 as the package manager and workspace runner while preserving the root application, the `docs` workspace, Tauri builds, Playwright E2E, Lefthook, CI, Dependabot, and developer documentation.

**Architecture:** Keep `/Users/hosiyomi322/Documents/dev/JS/App/MC-Vector/package.json` as the canonical workspace and script manifest. Define `docs` with `workspaces: ["docs"]`, commit only the text-based `bun.lock`, and retain Node.js for Vite/Tauri compatibility and explicit `node scripts/*` commands.

**Tech Stack:** Bun 1.4.2, React 19, TypeScript, Vite, Vitest, Playwright, Tauri v2, Rust stable, Oxlint, Oxfmt, Lefthook.

## Tasks

- [x] Verify the worktree is clean, fast-forward local `main` to the PR #217 merge commit, and create `chore/migrate-pnpm-to-bun`.
- [x] Update the root manifest with Bun `1.4.2`, `workspaces: ["docs"]`, the existing security overrides, and trusted lifecycle dependencies (`@parcel/watcher`, `lefthook`, `sharp`). Replace internal pnpm script calls with `bun run`.
- [x] Update `docs/package.json`, generate `bun.lock` with Bun 1.4.2 while the pnpm lockfile is available for migration, verify both workspace importers, then remove `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- [x] Replace local pnpm invocations in `justfile`, `lefthook.yml`, `playwright.config.ts`, `src-tauri/tauri.conf.json`, and `scripts/tauri-smoke-e2e.mjs`. Use `bunx --no-install` for local binaries and preserve Node-based scripts.
- [x] Replace pnpm setup, cache, install, and script commands in CI, docs, E2E, and release workflows with pinned `oven-sh/setup-bun` v2.2.0 (`0c5077e51419868618aeaa5fe8019c62421857d6`), Bun 1.4.2, `bun ci`, and `bun run`. Keep Node 22 setup without pnpm caching.
- [x] Change Dependabot's JavaScript ecosystem to `bun` and retain the existing dependency policies.
- [x] Synchronize README, CONTRIBUTING, docs, CLAUDE instructions, command references, ADR verification tables, and the pull request template with Bun commands and the current Node/Rust requirements.
- [x] Run configuration, zero-diagnostic, build, Rust, E2E, docs, workflow-action, stale-reference, and Lefthook acceptance checks.
- [x] Commit logical units with English messages, push the branch, open a PR against `main`, and monitor GitHub Actions with the CI monitoring skill.

## Acceptance Criteria

- [x] `bun --version` reports `1.4.2`.
- [x] `bun ci` succeeds with root and `docs` as the only project workspaces.
- [x] `bun.lock` exists; pnpm lock/workspace files and `bun.lockb` do not.
- [x] `bun run lint`, `bun run fmt:check`, `bun run check`, `bun run rustfmt:check`, `bun run test`, `bun run typecheck:tests`, `bun run build`, and `bun run --filter @mc-vector/docs build:full` succeed.
- [x] `bun run e2e`, the available real Tauri E2E path, Rust tests, and `bun run check:workflow-actions` preserve their existing meaning and pass where the environment supports them.
- [x] Lefthook matches direct and nested JS/TS/docs paths, auto-stages only JS/TS fixes, and runs Rustfmt check-only.
- [x] No active repository script, workflow, documentation, hook, ADR, or Tauri configuration uses pnpm or pnpm-specific metadata.
