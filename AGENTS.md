# AGENTS Guide

## Project Summary

MC-Vector is a desktop app (Tauri + React + TypeScript) for Minecraft server management.
Frontend UI is built with React and Tailwind, with SCSS partials used to keep repetitive view styling out of TSX.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, TailwindCSS, SCSS
- Desktop shell: Tauri v2 (Rust backend in src-tauri)
- Package manager: pnpm

## Common Commands

- Install dependencies: `pnpm install`
- Dev frontend: `pnpm dev`
- Dev with Tauri: `pnpm tauri:dev`
- Build frontend: `pnpm build`
- Build desktop app: `pnpm tauri:build`
- Lint/format: `pnpm biome:check`, `pnpm lint`, `pnpm format`

## Frontend Styling Rules

1. Keep short utility usage in TSX when it is local and truly one-off.
2. Move long/repeated class chains into SCSS classes under `src/styles`.
3. Group styles by responsibility:
   - `src/styles/base`: global base/reset rules
   - `src/styles/components`: reusable UI primitives
   - `src/styles/layout`: app shell/layout rules
   - `src/styles/modals`: modal-specific styles
   - `src/styles/views`: per-view styles
4. Import styles only through `src/styles/index.scss` from `src/main.tsx`.
5. Avoid invalid Tailwind `@apply` values (for example `bg-white/3`). Use explicit CSS color values when needed.

## TypeScript/React Conventions

1. Prefer explicit interfaces for component props and shared data structures.
2. Keep async file/system operations in `src/lib` wrappers; UI components should call wrappers, not raw APIs.
3. Preserve existing user-facing behavior when refactoring.
4. When extracting repeated UI patterns, prefer semantic class names over anonymous utility chains.

## Type Safety Guardrails

1. Do not introduce `any` in production code. Use `unknown` for external input and narrow with type guards.
2. Every API payload consumed from Modrinth/Hangar/Spigot must be parsed through runtime guards before UI use.
3. Keep discriminated unions explicit for platform-specific behavior (for example plugin source switching).
4. Treat optional properties as nullable and provide safe fallbacks in rendering and install flows.
5. If a guard cannot prove shape safety, fail with a user-visible error instead of unsafe casting.

### Type Guard Example (Required Pattern)

```ts
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function parseProject(value: unknown): { id: string; title: string } | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = typeof value.id === 'string' ? value.id : '';
  const title = typeof value.title === 'string' ? value.title : '';
  if (!id || !title) {
    return null;
  }
  return { id, title };
}
```

### Adapter Layer Example (Required Pattern)

```ts
interface PluginSourceAdapter {
  search(query: string, gameVersion: string, page: number): Promise<PluginProject[]>;
  resolveDownload(project: PluginProject, gameVersion: string): Promise<PluginDownload | null>;
}
```

Keep source-specific parsing and fallback logic inside adapters under `src/lib/adapters`.
UI components must never consume raw API payloads directly.

## Phase Execution Rules

1. Implement large requests by phase, not by scattered partial edits.
2. Complete all tasks in the active phase before proposing the next phase.
3. After each phase, run build and diagnostics, then report unresolved risks.
4. Keep one commit scope per phase unless a single phase becomes too large and must be split.
5. Align feature phases with `docs/engineering-requirements.md` and update status after significant changes.

## Delivery Tracking Files

1. Keep `docs/engineering-requirements.md` aligned with current implementation constraints.
2. Keep `docs/next-phase-plan.md` updated after each substantial implementation.
3. When task status changes, update the status matrix in `docs/next-phase-plan.md` in the same prompt.

## Refactor Checklist

Before finishing a refactor:

1. Run `pnpm build` and ensure it succeeds.
2. Confirm there are no stale style imports/paths.
3. Update README structure notes when directory layout changed.
4. Keep diffs focused; avoid unrelated formatting churn.

## Safety Notes

1. Do not use destructive git commands (`reset --hard`, `checkout --`) unless explicitly requested.
2. Do not revert user changes outside the requested scope.
3. If unexpected modifications are detected, pause and ask for confirmation before proceeding.

## Shared Rules

### Commit Message Conventions

Use English commit message prefixes:

- `feat:` - New features
- `fix:` - Bug fixes
- `ref:` - Refactoring
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks

Examples:

```bash
git commit -m "feat: add system logs scanner" -m "Scan /var/log and ~/Library/Logs for old log files" -m "Adds new scanner category with configurable age threshold"

git commit -m "fix: optimize command timeout on Intel Macs" -m "Add 30s timeout to DNS flush task" -m "Prevents indefinite hanging on certain hardware"

git commit -m "ref: extract scanner directory tracking" -m "Add scannedDirectories property to base scanner" -m "Enables post-scan directory summary display"
```

### Phase-Based Development Workflow

After each implementation/editing prompt is completed, confirm whether there are unfinished points in the current phase, or if the phase is complete, whether there are tasks in the next phase.

If there are remaining tasks, ask the user in **selection mode** where to continue next using `ask_user` tool (not plain text questions). Repeat this after every implementation step until all phases are complete and the project is release-ready.

After that question, generate a commit command with a message format appropriate to the implementation and ask the user in selection mode whether to execute it.

**Commit Timing Rules:**

- Do NOT ask for commit command generation for every tiny change within the same phase
- However, if a change inside the same phase is large, this rule can be treated as an exception
- Even if the user chooses not to run the commit command, continue implementation if there is still work in the current phase or next phases
- Keep iterating with question → implementation → question until completion

The "question" here refers to selection-style planning questions using `ask_user` tool, not plain text questions.

**Commit Command Format:**

```bash
git commit -m "message" -m "message" -m "message"
```

Use multiple `-m` flags for detailed commit messages with:

1. First message: Brief summary of changes
2. Second message: Detailed description
3. Third message: Technical notes or impacts

### Git Operations

Use VS Code terminal commands directly for git operations. Do not use MCP for git operations.

**Standard Git Workflow:**

```bash
# Stage all changes
git add .

# Commit with multi-line message
git commit -m "feat: add new scanner" -m "Detailed description" -m "Technical notes"

# Push to main branch
git push origin main

# Force push (only after reset)
git push -f -u origin main
```

**After Reset:**
If a reset command such as `git reset --soft HEAD^` is performed and the user informs you, force push is required:

```bash
git push -f -u origin main
```
