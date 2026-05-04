# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MC-Vector is a cross-platform desktop app (Tauri v2 + React 19 + TypeScript) for Minecraft server management. It handles server lifecycle, real-time monitoring, plugin/mod browsing (Modrinth, Hangar, SpigotMC), file editing (Monaco Editor), backups, Java version management, and Ngrok integration.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Frontend dev server (HTTPS at mc-vector.localhost via portless)
pnpm dev:plain        # Raw Vite dev server (localhost:5173)
pnpm tauri:dev        # Full desktop app in dev mode
pnpm build            # Build frontend for production
pnpm tauri:build      # Build production Tauri binary
pnpm check            # Run lint + format checks
pnpm check:fix        # Run checks and auto-fix
pnpm lint             # Run oxlint
pnpm format           # Run formatter (biome/oxfmt)
pnpm rustfmt          # Format Rust code
pnpm clean:artifacts  # Delete dist, build, node_modules/.vite
```

After any refactor: run `pnpm build` and confirm it succeeds before finishing.

## Architecture

**Data flow:** React components → `src/lib/` wrappers → Tauri IPC → `src-tauri/src/commands/` (Rust)

UI components must never call raw Tauri APIs or consume raw API payloads directly. All async file/system operations go through `src/lib/` wrappers. All external API payloads (Modrinth, Hangar, SpigotMC) must pass through runtime type guards in `src/lib/guards/` before reaching the UI.

**Key layers:**
- `src/lib/` — Typed wrappers for every Tauri command category (server, file, backup, java, plugin, proxy, security, ngrok, performance, update)
- `src/lib/adapters/` — Source-specific plugin adapters implementing `PluginSourceAdapter`
- `src/lib/guards/` — Runtime type guards for all external API shapes
- `src/store/` — Zustand stores: `serverStore`, `uiStore`, `consoleStore`, `settingsStore`
- `src/renderer/components/` — React views and modals
- `src/renderer/hooks/` — Custom hooks for server automation, updates, proxy actions
- `src/i18n/` — Hook-based i18n with Zustand store; locales in `en.ts` / `ja.ts`
- `src/styles/` — SCSS partials organized by `base/`, `components/`, `layout/`, `modals/`, `views/`; imported only through `src/styles/index.scss` in `src/main.tsx`
- `src-tauri/src/commands/` — Rust command handlers (server, file_utils, security, java, download, backup, ngrok, perf, updater_utils)
- `src-tauri/capabilities/` — Tauri v2 security capabilities

**Path alias:** `@/*` maps to `./src/*`

## TypeScript Conventions

- Use explicit interfaces for props and shared data structures.
- No `any` in production code. Use `unknown` for external input and narrow with type guards.
- Treat optional properties as nullable; provide safe fallbacks in rendering and install flows.
- Keep discriminated unions explicit for platform/source branching.
- If a guard cannot prove shape safety, fail with a user-visible error rather than unsafe casting.

Type guard pattern (required for all external payloads):
```ts
type JsonRecord = Record<string, unknown>;
function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null;
}
```

Plugin source adapter pattern (required for `src/lib/adapters/`):
```ts
interface PluginSourceAdapter {
  search(query: string, gameVersion: string, page: number): Promise<PluginProject[]>;
  resolveDownload(project: PluginProject, gameVersion: string): Promise<PluginDownload | null>;
}
```

## Styling Rules

- Short, one-off Tailwind utilities can stay inline in TSX.
- Long or repeated class chains go into SCSS classes under the appropriate `src/styles/` subdirectory.
- Do not use invalid `@apply` values (e.g., `bg-white/3`); use explicit CSS color values instead.
- Dark-theme palette: background `#121214`, accent `#5865F2`.

## Delivery Tracking

- `docs/engineering-requirements.md` — implementation constraints; keep aligned with current state.
- `docs/next-phase-plan.md` — phase plan and status matrix; update after each substantial change.

## Commit Message Format

Use English prefixes: `feat:`, `fix:`, `ref:`, `docs:`, `chore:`

```bash
git commit -m "feat: add Java auto-detect" \
           -m "Scan common install paths on macOS and Windows" \
           -m "Falls back to JAVA_HOME env var when scan finds nothing"
```

## Phase-Based Workflow

Implement large requests phase by phase. Complete all tasks in the active phase before proposing the next. After each phase, run build and diagnostics, report unresolved risks, and ask the user (via selection mode using the `ask_user` tool) where to continue. Generate a commit command after each phase and ask whether to execute it.
