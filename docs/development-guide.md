# MC-Vector Development Guide

Setup guide and development workflow for MC-Vector contributors.

**Guide target version:** `2.0.55`

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Development Workflow](#development-workflow)
- [Commands Reference](#commands-reference)
- [Project Structure](#project-structure)
- [Coding Conventions](#coding-conventions)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | v22+ (v20 minimum) | [nodejs.org](https://nodejs.org/) |
| **pnpm** | v10.33.0+ | `npm install -g pnpm` |
| **Rust** | stable (1.77+) | [rustup.rs](https://rustup.rs/) |
| **Cargo** | (included with Rust) | — |

**macOS only:** Xcode Command Line Tools are required for Tauri builds:

```bash
xcode-select --install
```

---

## Environment Setup

### 1. Install Node.js and pnpm

**macOS:**

```bash
brew install node@22
npm install -g pnpm@latest
```

**Linux (nvm):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22
npm install -g pnpm@latest
```

**Windows:**

- Download Node.js from [nodejs.org](https://nodejs.org/)
- Run: `npm install -g pnpm`

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Restart your shell, then verify:
rustc --version
```

### 3. Clone and Install Dependencies

```bash
git clone https://github.com/tukuyomil032/MC-Vector.git
cd MC-Vector
pnpm install
```

---

## Development Workflow

### Start the Frontend Dev Server (browser-only)

```bash
pnpm dev
```

Opens the Vite dev server at `https://mc-vector.localhost` via portless.

For a plain HTTP server without portless:

```bash
pnpm dev:plain
# → http://localhost:5173
```

### Start the Full Tauri App

```bash
pnpm tauri:dev
```

This starts both the Vite dev server and the Tauri desktop window. Use this for any work that requires Rust backend functionality (server management, file operations, etc.).

### Before Committing

Run the full lint and format check:

```bash
pnpm check
```

Auto-fix issues:

```bash
pnpm check:fix
```

[Lefthook](#lefthook) runs `pnpm check:fix` and `cargo fmt` automatically on `git commit` for staged files.

### Build for Production

```bash
pnpm tauri:build
```

Artifacts are written to `src-tauri/target/release/bundle/`.

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Frontend dev server (HTTPS via portless) |
| `pnpm dev:plain` | Raw Vite dev server at localhost:5173 |
| `pnpm tauri:dev` | Full desktop app in dev mode |
| `pnpm build` | Build frontend for production |
| `pnpm tauri:build` | Build production Tauri binary |
| `pnpm check` | Run lint + format checks |
| `pnpm check:fix` | Run checks and auto-fix |
| `pnpm lint` | Run oxlint |
| `pnpm format` | Run formatter (biome / oxfmt) |
| `pnpm rustfmt` | Format Rust code (`cargo fmt`) |
| `pnpm clean:artifacts` | Delete `dist/`, build output, `node_modules/.vite` |

---

## Lefthook

MC-Vector uses [Lefthook](https://github.com/evilmartians/lefthook) for Git hooks. Hooks run automatically on `git commit`.

| Hook | Glob | Action |
|------|------|--------|
| `lint-format-ts` | `src/**/*.{ts,tsx}` | `pnpm check:fix` |
| `fmt-rust` | `src-tauri/src/**/*.rs` | `cargo fmt --all` |

Both hooks use `stage_fixed: true` — auto-formatted files are re-staged automatically.

Lefthook is installed as a dev dependency and activated via `pnpm install` (no global install required).

---

## Project Structure

```
mc-vector/
├── src/                        # React + TypeScript frontend
│   ├── App.tsx                 # Root component
│   ├── renderer/components/    # Feature UI components
│   ├── lib/                    # Tauri IPC wrappers + adapters
│   └── store/                  # Zustand state stores
├── src-tauri/                  # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs              # Plugin registration, command list
│   │   └── commands/           # Tauri command handlers
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/                       # Documentation
├── migrate-wiki/               # Wiki migration plan
├── .github/workflows/          # CI/CD (release.yml)
├── lefthook.yml                # Git hooks
├── biome.json                  # TypeScript formatter/linter config
├── package.json
└── pnpm-workspace.yaml
```

For detailed architecture, see [architecture.md](./architecture.md).

---

## Coding Conventions

### TypeScript / React

1. **No `any`** — use `unknown` for external input and narrow with type guards in `src/lib/guards/`.
2. **All API payloads** from external services must pass a runtime type guard before use.
3. **Components call wrappers** in `src/lib/` — never raw `invoke()` directly.
4. **Explicit prop interfaces** for all components.
5. Short Tailwind utility chains in TSX; longer/reused patterns go in CSS or a shared component.

### Rust

1. Follow standard Rust style (enforced by `cargo fmt`).
2. Return `Result<T, String>` from Tauri commands — the string becomes the JS-side error message.
3. File operations must go through `resolve_managed_path` — never accept a raw user-supplied path.

### Commits

Use the prefixes: `feat:`, `fix:`, `ref:`, `docs:`, `chore:`

```bash
git commit -m "feat: add server health check tile" \
           -m "Uses ping_server Tauri command to show player count on Dashboard" \
           -m "Falls back to unknown state if server is unreachable"
```

---

## Testing

Before opening a PR, run:

```bash
# Frontend: lint + type-check + build
pnpm check && pnpm build

# Rust: check + unit tests
cd src-tauri && cargo check -q && cargo test -q
```

Rust unit tests cover critical paths including security gateway validation and ANSI log parsing.

---

## Troubleshooting

**`pnpm install` fails**

Ensure pnpm ≥ 10.33.0: `pnpm --version`

**Tauri build fails on macOS**

```bash
xcode-select --install
```

**`https://mc-vector.localhost` not accessible**

Run portless setup:

```bash
pnpm exec portless trust
pnpm exec portless hosts sync   # requires sudo
```

Or use the plain dev server instead: `pnpm dev:plain`

**Build errors after pulling latest changes**

```bash
pnpm clean:artifacts
pnpm install
```

**Lefthook hook not running**

Reinstall hooks:

```bash
pnpm lefthook install
```

---

## Getting Help

- [Tutorial](./tutorial.md) — detailed feature walkthrough
- [Architecture](./architecture.md) — system design reference
- [GitHub Issues](https://github.com/tukuyomil032/MC-Vector/issues) — bug reports
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution guidelines
