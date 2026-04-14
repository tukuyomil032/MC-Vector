# MC-Vector

[![CI](https://github.com/tukuyomil032/MC-Vector/workflows/CI/badge.svg)](https://github.com/tukuyomil032/MC-Vector/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.51-green.svg)](https://github.com/tukuyomil032/MC-Vector/releases)

**Minecraft - Multi-Function Server Management Software**

MC-Vector is a powerful cross-platform desktop application for managing Minecraft servers with ease. Built with Tauri and React, it provides a modern, fast, and intuitive interface for server administration.

**Current stable version:** `2.0.51`

### What's New in 2.0.51

- ✅ File saving flow reliability improvements in the Files view
- ☕ Java runtime management improvements (download/select/delete flow)
- 🔌 Plugin browser UI consistency updates and transition polish
- 🎨 Better icon visibility and light/dark theme readability

---

## Features

- 🗣 **Multi-Language Support** - Select either English or Japanese as the language to use within the app
- 🖥️ **Multi-Platform Support** - Works on macOS, Windows, and Linux
- 🎮 **Multiple Server Management** - Create and manage multiple Minecraft servers
- 🔌 **Plugin/Mod Browser** - Install plugins and mods directly from Modrinth, Hangar, and SpigotMC with one click
- 📊 **Real-Time Monitoring** - Dashboard with CPU usage, memory usage, and server status
- 💾 **Backup & Restore** - Create and restore server backups with ease
- 📁 **Built-in File Manager** - Edit server files directly in the app
- 👥 **User Management** - Manage whitelist, operators, bans, and IP bans
- 🌐 **Proxy Network Setup** - Easy proxy server configuration (BungeeCord, Velocity)
- 🔗 **Port Forwarding Elimination** - Ngrok integration for public access without port forwarding
- ☕ **Java Version Management** - Download, detect, select, and remove Java runtime versions
- 🔄 **Auto-Updater** - Keep MC-Vector up to date automatically

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Development](#development)
- [Building](#building)
- [Project Structure](#project-structure)
- [Commands Reference](#commands-reference)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Requirements

### For Users

- **macOS** 10.15+ / **Windows** 10+ / **Linux** (with GTK3)
- 4GB+ RAM recommended
- Java 17+ (for running Minecraft servers)

### For Developers

- **Node.js** v18 or later (v22 recommended)
- **pnpm** v10.26.2 or later
- **Rust** v1.77.2 or later
- **Python** 3.x (for yamllint)
- **yamllint** v1.35.1

Optional:

- **just** - Modern task runner
- **Nix** - Reproducible development environment
- **direnv** - Auto-load development shell

---

## Quick Start

### For Users

1. **Download** the latest release from [Releases](https://github.com/tukuyomil032/MC-Vector/releases)
2. **Install** the application
3. **Launch** MC-Vector
4. **Create a server:**
   - Click "+ Add Server"
   - Set server name, software, version, port, and memory
   - Click "Create"
5. **Start your server** and enjoy!

For detailed usage instructions, see the [User Guide](docs/tutorial.md).

### For Developers

**Using Nix (Recommended):**

```bash
git clone https://github.com/tukuyomil032/MC-Vector.git
cd MC-Vector
nix develop
just setup
just tauri-dev  # Start Tauri app with dev server
```

**Manual Setup:**

```bash
git clone https://github.com/tukuyomil032/MC-Vector.git
cd MC-Vector

# Install dependencies (Node.js 18+; 22 recommended, pnpm 10.26.2+, Rust, yamllint required)
pnpm install

# Optional but recommended: Run full setup with portless
just setup
# or
make setup

# Start development
just tauri-dev
# or
pnpm tauri:dev
```

**What does `just setup` / `make setup` do?**

Both `just setup` and `make setup` automate your development environment setup:

1. 📦 Installs all project dependencies via `pnpm install`
2. ✅ Runs all quality checks (lint, format, yamllint, rustfmt)
3. 🔒 Configures portless CA certificate for HTTPS development (may require system password)
4. 🌐 Adds `mc-vector.localhost` to `/etc/hosts` for local HTTPS access (**requires sudo password**)

**Note:** Steps 3-4 are for portless HTTPS development and are optional. If you skip these steps, you can still develop using `pnpm tauri:dev` with standard `http://localhost:5173`.

**Development server options:**

- `just dev` - Browser-only dev server via portless HTTPS (`https://mc-vector.localhost`)
- `just tauri-dev` - Full Tauri app with dev server (recommended for app development)

For detailed development instructions, see the [Development Guide](docs/development-guide.md).

---

## Installation

### macOS

1. Download `MC-Vector.dmg` from [Releases](https://github.com/tukuyomil032/MC-Vector/releases)
2. Open the `.dmg` file
3. Drag MC-Vector to Applications
4. Launch MC-Vector from Applications

### Windows

1. Download `MC-Vector-Setup.exe` from [Releases](https://github.com/tukuyomil032/MC-Vector/releases)
2. Run the installer
3. Follow the installation wizard
4. Launch MC-Vector from the Start menu

### Linux

**AppImage:**

```bash
chmod +x MC-Vector.AppImage
./MC-Vector.AppImage
```

**Debian/Ubuntu (.deb):**

```bash
sudo dpkg -i MC-Vector.deb
mc-vector
```

**Fedora/RHEL (.rpm):**

```bash
sudo rpm -i MC-Vector.rpm
mc-vector
```

---

## Development

### Setup Development Environment

**Option 1: Using Nix (Recommended)**

Nix provides a fully reproducible development environment:

```bash
# Install Nix (if not already installed)
sh <(curl -L https://nixos.org/nix/install) --daemon

# Enable Flakes (add to ~/.config/nix/nix.conf)
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf

# Enter development shell
nix develop

# Run full setup (installs deps, configures portless, runs checks)
just setup
```

**Option 2: Manual Setup**

Install dependencies manually:

```bash
# Install Node.js, pnpm, Rust, yamllint
# (See Development Guide for detailed instructions)

# Install project dependencies and configure environment
pnpm install
just setup  # or make setup

# Alternative: Skip portless setup and use standard localhost
pnpm install
make check
```

### Development Workflow

**For Tauri app development (recommended):**

```bash
just tauri-dev
# or
make tauri-dev
```

This starts both the Vite dev server and the Tauri application window.

**For browser-only development:**

```bash
just dev
# or
pnpm dev
```

This starts the Vite dev server via portless at `https://mc-vector.localhost` (requires `just setup` first).

Run quality checks before committing:

```bash
just check-all
# or
make check && make yamllint && make rustfmt
```

For more details, see the [Development Guide](docs/development-guide.md).

---

## Building

### Build for Production

**Using justfile:**

```bash
just tauri-build
```

**Using Makefile:**

```bash
make tauri-build
```

Build artifacts will be in `src-tauri/target/release/bundle/`:

- **macOS:** `.dmg` and `.app`
- **Windows:** `.exe` and `.msi`
- **Linux:** `.AppImage`, `.deb`, `.rpm`

### Debug Build

```bash
just tauri-build --debug --no-bundle
```

---

## Project Structure

```
MC-Vector/
├── src/                              # Frontend source code
│   ├── App.tsx                       # Main application component
│   ├── main.tsx                      # React entry point
│   ├── assets/                       # Static assets (icons, images)
│   ├── styles/                       # Global and component styles (SCSS)
│   │   ├── base/                     # Base styles and resets
│   │   ├── components/               # Reusable UI component styles
│   │   ├── layout/                   # App shell and navigation layout
│   │   ├── modals/                   # Modal-specific styles
│   │   └── views/                    # View-specific styles
│   ├── lib/                          # Frontend API layer (Tauri wrappers)
│   │   ├── server-commands.ts        # Server lifecycle operations
│   │   ├── file-commands.ts          # File system operations
│   │   ├── plugin-commands.ts        # Plugin/mod management
│   │   └── ...
│   └── renderer/                     # React components
│       ├── components/               # UI components
│       │   ├── AddServerModal.tsx
│       │   ├── DashboardView.tsx
│       │   ├── ConsoleView.tsx
│       │   ├── FilesView.tsx
│       │   ├── PluginBrowser.tsx
│       │   └── ...
│       └── shared/                   # Shared utilities and types
│
├── src-tauri/                        # Rust backend (Tauri core)
│   ├── Cargo.toml                    # Rust dependencies
│   ├── tauri.conf.json               # Tauri configuration
│   ├── build.rs                      # Build script
│   ├── capabilities/                 # Tauri capability definitions
│   └── src/
│       ├── main.rs                   # Rust entry point
│       ├── lib.rs                    # Library exports
│       └── commands/                 # Tauri command handlers
│           ├── server.rs             # Server process management
│           ├── file_utils.rs         # File system utilities
│           ├── download.rs           # HTTP downloads
│           ├── process_stats.rs      # System monitoring
│           ├── backup.rs             # Backup/restore operations
│           ├── java.rs               # Java runtime detection
│           └── ngrok.rs              # Ngrok integration
│
├── docs/                             # Documentation
│   ├── README.md                     # Documentation index
│   ├── tutorial.md                   # User guide
│   ├── development-guide.md          # Developer guide
│   ├── architecture.md               # Technical architecture
│   └── ...
│
├── .github/                          # GitHub configurations
│   └── workflows/                    # CI/CD workflows
│
├── scripts/                          # Utility scripts
│   ├── install-extensions.sh        # Install VS Code extensions
│   └── update-versions.js            # Update version numbers
│
├── Makefile                          # Traditional task runner
├── justfile                          # Modern task runner
├── flake.nix                         # Nix Flakes definition
├── shell.nix                         # Nix shell environment
├── .envrc                            # direnv configuration
├── CONTRIBUTING.md                   # Contribution guidelines
├── CHANGELOG.md                      # Version history
├── package.json                      # Node.js project manifest
├── pnpm-lock.yaml                    # pnpm lock file
├── vite.config.ts                    # Vite build configuration
├── tailwind.config.js                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
└── README.md                         # This file
```

For a detailed architecture overview, see [Architecture Documentation](docs/architecture.md).

---

## Commands Reference

### Development Tasks

| Task                 | justfile         | Makefile         | Description                                                        |
| -------------------- | ---------------- | ---------------- | ------------------------------------------------------------------ |
| Install dependencies | `just install`   | `make install`   | Install all dependencies                                           |
| Full setup           | `just setup`     | `make setup`     | Install deps + portless setup + quality checks                     |
| Start frontend dev   | `just dev`       | `make dev`       | Start Vite dev server via portless (`https://mc-vector.localhost`) |
| Start Tauri dev      | `just tauri-dev` | `make tauri-dev` | Start Tauri app in dev mode                                        |

### Build Tasks

| Task            | justfile           | Makefile           | Description                   |
| --------------- | ------------------ | ------------------ | ----------------------------- |
| Build frontend  | `just build`       | `make build`       | Build frontend for production |
| Build Tauri app | `just tauri-build` | `make tauri-build` | Build Tauri application       |

### Quality Checks

| Task        | justfile         | Makefile        | Description                             |
| ----------- | ---------------- | --------------- | --------------------------------------- |
| Lint code   | `just lint`      | `make lint`     | Run oxlint (via vite+)                  |
| Format code | `just format`    | `make format`   | Format with oxfmt and biome (via vite+) |
| Check all   | `just check`     | `make check`    | Run lint & format checks                |
| Lint YAML   | `just yamllint`  | `make yamllint` | Lint YAML files                         |
| Format Rust | `just rustfmt`   | `make rustfmt`  | Format Rust code                        |
| All checks  | `just check-all` | N/A             | Run all quality checks                  |

### Utilities

| Task               | justfile                  | Makefile                  | Description                          |
| ------------------ | ------------------------- | ------------------------- | ------------------------------------ |
| Full setup         | `just setup`              | `make setup`              | Install deps + portless + all checks |
| Clean builds       | `just clean`              | `make clean`              | Clean build artifacts                |
| Install extensions | `just install-extensions` | `make install-extensions` | Install VS Code extensions           |
| Update versions    | `just update-versions`    | `make update-versions`    | Update version numbers               |

For detailed command usage, see the [Development Guide](docs/development-guide.md).

---

## Documentation

- **[User Guide](docs/tutorial.md)** - Complete guide to using MC-Vector
- **[Development Guide](docs/development-guide.md)** - Developer setup and workflow
- **[Architecture](docs/architecture.md)** - Technical architecture overview
- **[CONTRIBUTING](CONTRIBUTING.md)** - Contribution guidelines
- **[CHANGELOG](CHANGELOG.md)** - Version history

---

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting a pull request.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes (follow [coding guidelines](CONTRIBUTING.md#coding-guidelines))
4. Run quality checks: `just check-all` or `make check`
5. Commit your changes: `git commit -m "feat: your feature description"`
6. Push to your fork: `git push origin feature/your-feature`
7. Open a Pull Request

For detailed guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite, TailwindCSS, SCSS
- **Desktop:** Tauri v2 (Rust backend)
- **State Management:** Zustand
- **UI Components:** Lucide React, Framer Motion
- **Code Editor:** Monaco Editor
- **Charts:** Recharts
- **Terminal:** xterm.js
- **Package Manager:** pnpm
- **Build Tool:** Vite
- **Task Runners:** just, Make
- **Environment:** Nix (optional)

For more details, see the [Architecture Documentation](docs/architecture.md) and [Development Guide](docs/development-guide.md).

---

## Acknowledgments

- Built with [Tauri](https://tauri.app/)
- UI powered by [React](https://react.dev/)
- Icons from [Lucide](https://lucide.dev/)

---

**Made with ❤️ by [tukuyomi032](https://github.com/tukuyomil032)**
