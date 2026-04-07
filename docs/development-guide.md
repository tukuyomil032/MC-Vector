# MC-Vector Development Guide

Welcome to the MC-Vector development guide! This document will help you set up your development environment and understand our development workflow.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
  - [Option 1: Using Nix (Recommended)](#option-1-using-nix-recommended)
  - [Option 2: Manual Setup](#option-2-manual-setup)
- [Task Runners](#task-runners)
  - [Using justfile](#using-justfile)
  - [Using Makefile](#using-makefile)
- [Development Workflow](#development-workflow)
- [Commands Reference](#commands-reference)
- [Project Structure](#project-structure)
- [Coding Conventions](#coding-conventions)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools (Manual Setup)

- **Node.js** v18 or later (v22 recommended)
- **pnpm** v10.26.2 or later
- **Rust** v1.77.2 or later
- **Cargo** (included with Rust)
- **Python** 3.x (for yamllint)
- **yamllint** v1.35.1

### Optional Tools

- **just** - Modern task runner (recommended)
- **Nix** - Reproducible development environment (recommended)
- **direnv** - Auto-load development shell

---

## Environment Setup

### Option 1: Using Nix (Recommended)

Nix provides a completely reproducible development environment with all dependencies pre-configured.

#### 1. Install Nix

**macOS/Linux:**

```bash
sh <(curl -L https://nixos.org/nix/install) --daemon
```

**Enable Nix Flakes** (add to `~/.config/nix/nix.conf` or `/etc/nix/nix.conf`):

```
experimental-features = nix-command flakes
```

#### 2. Enter Development Shell

**Using Nix Flakes:**

```bash
nix develop
```

**Using shell.nix (without Flakes):**

```bash
nix-shell
```

#### 3. (Optional) Auto-load with direnv

Install direnv:

```bash
# macOS
brew install direnv

# Linux (add to ~/.bashrc or ~/.zshrc)
eval "$(direnv hook bash)"  # or zsh, fish
```

Allow direnv for this project:

```bash
direnv allow
```

Now the Nix shell will automatically activate when you `cd` into the project directory!

---

### Option 2: Manual Setup

If you prefer not to use Nix, install dependencies manually:

#### 1. Install Node.js and pnpm

**macOS:**

```bash
brew install node@22 pnpm
```

**Linux (using nvm):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22
npm install -g pnpm@10.26.2
```

**Windows:**

- Download Node.js from [nodejs.org](https://nodejs.org/)
- Install pnpm: `npm install -g pnpm@10.26.2`

#### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default 1.77.2
```

#### 3. Install yamllint

```bash
pip install 'yamllint==1.35.1'
```

#### 4. (Optional) Install just

**macOS:**

```bash
brew install just
```

**Linux:**

```bash
cargo install just
```

**Windows:**

```powershell
choco install just
```

#### 5. Install Project Dependencies

```bash
pnpm install
```

---

## Task Runners

We provide two task runners: **justfile** (modern, recommended) and **Makefile** (traditional).

### Using justfile

**List all available tasks:**

```bash
just --list
```

**Common tasks:**

```bash
just install           # Install dependencies
just dev               # Start frontend dev server via portless (https://mc-vector.localhost)
just tauri-dev         # Start Tauri app in dev mode
just build             # Build frontend
just tauri-build       # Build Tauri app
just check             # Run lint & format checks
just check-all         # Run all quality checks
just setup             # Full setup (install + check-all)
```

### Using Makefile

**List all available tasks:**

```bash
make help
```

**Common tasks:**

```bash
make install           # Install dependencies
make dev               # Start frontend dev server
make tauri-dev         # Start Tauri app in dev mode
make build             # Build frontend
make tauri-build       # Build Tauri app
make check             # Run lint & format checks
```

---

## Development Workflow

### 1. First-Time Setup

**With Nix:**

```bash
nix develop
just setup
```

The `just setup` command will:

1. Install all project dependencies via `pnpm install`
2. Set up portless CA certificate for HTTPS development
   - Runs `portless trust` to add the CA to your system trust store
   - You may be prompted for your password to trust the certificate
3. Sync hosts entry for `mc-vector.localhost`
   - Runs `portless hosts sync` to add the entry to `/etc/hosts`
   - **Requires sudo password** for modifying `/etc/hosts`
   - If this fails, Chrome/Firefox will still work, but cmux browser requires this step
4. Run all quality checks (`check-all`)

**Without Nix:**

```bash
pnpm install
make setup   # Includes portless setup
# or just run checks without portless setup:
make check
```

**Portless Setup Notes:**

- `portless trust` and `portless hosts sync` are idempotent (safe to run multiple times)
- If `portless hosts sync` fails, the development server will still work in most browsers
- cmux browser specifically requires the hosts entry to resolve `mc-vector.localhost`
- You can skip portless setup and use plain `http://localhost:5173` if preferred

### 2. Start Development

**For browser-only development:**

```bash
just dev
# or
pnpm dev
```

This starts the Vite dev server via portless at `https://mc-vector.localhost`.

**For Tauri application development:**

```bash
just tauri-dev
# or
make tauri-dev
```

This starts both the Vite dev server (plain, non-portless) and the Tauri application.

### 3. Code Quality

Before committing, always run:

```bash
just check-all
# or
make check && make yamllint && make rustfmt
```

### 4. Build for Production

```bash
just tauri-build
# or
make tauri-build
```

Built artifacts will be in `src-tauri/target/release/bundle/`.

---

## Commands Reference

### Development

| Command      | justfile         | Makefile         | Description                                                            |
| ------------ | ---------------- | ---------------- | ---------------------------------------------------------------------- |
| Install deps | `just install`   | `make install`   | Install all dependencies                                               |
| Dev server   | `just dev`       | `make dev`       | Start frontend dev server via portless (`https://mc-vector.localhost`) |
| Tauri dev    | `just tauri-dev` | `make tauri-dev` | Start Tauri app in dev mode                                            |

### Build

| Command        | justfile           | Makefile           | Description                   |
| -------------- | ------------------ | ------------------ | ----------------------------- |
| Build frontend | `just build`       | `make build`       | Build frontend for production |
| Build app      | `just tauri-build` | `make tauri-build` | Build Tauri application       |

### Quality

| Command     | justfile         | Makefile        | Description                             |
| ----------- | ---------------- | --------------- | --------------------------------------- |
| Lint        | `just lint`      | `make lint`     | Run oxlint (via vite+)                  |
| Format      | `just format`    | `make format`   | Format with oxfmt and biome (via vite+) |
| Check       | `just check`     | `make check`    | Run lint & format checks                |
| YAML lint   | `just yamllint`  | `make yamllint` | Lint YAML files                         |
| Rust format | `just rustfmt`   | `make rustfmt`  | Format Rust code                        |
| All checks  | `just check-all` | N/A             | Run all quality checks                  |

### Utilities

| Command            | justfile                  | Makefile                  | Description                   |
| ------------------ | ------------------------- | ------------------------- | ----------------------------- |
| Install extensions | `just install-extensions` | `make install-extensions` | Install VS Code extensions    |
| Update versions    | `just update-versions`    | `make update-versions`    | Update version numbers        |
| Clean              | `just clean`              | `make clean`              | Clean build artifacts         |
| Setup              | `just setup`              | N/A                       | Full setup (install + checks) |

---

## Project Structure

See the main [README.md](../README.md#project-structure) for the detailed project structure.

### Key Directories

- `src/` - React frontend code
  - `src/renderer/` - React components
  - `src/lib/` - Frontend API wrappers
  - `src/styles/` - SCSS styles
- `src-tauri/` - Rust backend (Tauri core)
  - `src-tauri/src/commands/` - Tauri command handlers
- `docs/` - Documentation
- `scripts/` - Utility scripts

---

## Coding Conventions

### Frontend (TypeScript/React)

1. **Type Safety:**
   - Avoid `any`. Use `unknown` for external input and narrow with type guards.
   - All API payloads must be validated with runtime type guards.
   - Use explicit interfaces for component props.

2. **Component Structure:**
   - Keep components focused and single-purpose.
   - Extract repeated UI patterns into reusable components.
   - Use semantic class names over anonymous utility chains.

3. **Styling:**
   - Short utility usage in TSX for one-off styles.
   - Long/repeated class chains go in SCSS classes under `src/styles/`.
   - Group styles by responsibility (base, components, layout, modals, views).

4. **Async Operations:**
   - Keep file/system operations in `src/lib` wrappers.
   - UI components call wrappers, not raw APIs.

### Backend (Rust)

1. Follow Rust standard conventions.
2. Use `cargo fmt` to format code: `just rustfmt` or `make rustfmt`.
3. Handle errors properly with `Result<T, E>`.

### Documentation

1. Update documentation when changing behavior.
2. Keep README.md aligned with actual functionality.
3. Add inline comments only when code needs clarification.

---

## Testing

Currently, there are no automated tests. Testing is done manually during development.

**Future Testing Plans:**

- Unit tests for critical business logic
- Integration tests for Tauri commands
- E2E tests for user workflows

---

## Troubleshooting

### Common Issues

**Issue: `pnpm install` fails**

- **Solution:** Ensure you're using pnpm v10.26.2 or later. Run `pnpm --version` to check.

**Issue: Tauri build fails on macOS**

- **Solution:** Ensure Xcode Command Line Tools are installed: `xcode-select --install`

**Issue: yamllint not found**

- **Solution:** Install yamllint: `pip install 'yamllint==1.35.1'`

**Issue: Nix commands not found**

- **Solution:** Ensure Nix is installed and Flakes are enabled in your Nix config.

**Issue: direnv not auto-loading**

- **Solution:** Run `direnv allow` in the project directory.

**Issue: Build errors after pulling latest changes**

- **Solution:** Clean and reinstall dependencies:
  ```bash
  just clean
  just install
  ```

**Issue: `https://mc-vector.localhost` not accessible in cmux browser**

- **Solution:** cmux uses WKWebView which may have stricter TLS trust requirements:
  1. Ensure portless CA is trusted: `portless trust`
  2. Start dev server: `just dev`
  3. Sync hosts file (requires sudo): `portless hosts sync`
  4. Try accessing in cmux browser
  5. If still not working, you may need to use `.test` TLD instead (see below)

**Issue: Want to use `.test` TLD instead of `.localhost`**

- **Solution:** Configure portless to use `.test`:

  ```bash
  # Stop any running portless proxy
  portless proxy stop

  # Start proxy with .test TLD
  portless proxy start --tld test

  # Update dev command to use the new TLD
  # The URL will be https://mc-vector.test
  ```

### Getting Help

- Check the [main README](../README.md) for basic usage.
- Read the [tutorial](./tutorial.md) for detailed feature explanations.
- Review [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.
- Open an issue on [GitHub](https://github.com/tukuyomil032/MC-Vector/issues) if you encounter a bug.

---

## Next Steps

- Read the [Tutorial](./tutorial.md) to understand how to use MC-Vector.
- Check [CONTRIBUTING.md](../CONTRIBUTING.md) if you want to contribute.
- Explore the codebase and start hacking!

Happy coding! 🚀
