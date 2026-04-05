# Changelog

All notable changes to MC-Vector will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Makefile for traditional task runner support
- justfile for modern task runner support
- Nix development environment (flake.nix + shell.nix)
- direnv support (.envrc) for automatic environment loading
- Comprehensive development guide (docs/development-guide.md)
- User guide tutorial (docs/tutorial.md)
- Contributing guidelines (CONTRIBUTING.md)
- This changelog

### Changed
- GitHub Actions CI now uses task runner commands (just/make)
- README structure improved with badges and table of contents
- Documentation reorganized into docs/ directory

## [2.0.47] - 2026-03-06

Current stable release.

### Features
- Multi-platform desktop app (macOS, Windows, Linux)
- Multiple Minecraft server management
- Real-time server monitoring (CPU, memory usage)
- Server console with command execution
- File manager with built-in editor
- Plugin/Mod browser and installer (Modrinth, Hangar, SpigotMC)
- Backup and restore functionality
- Server properties editor
- User/whitelist/ban management
- Proxy network setup (BungeeCord, Velocity)
- Port forwarding elimination (Ngrok integration)
- Java version management
- Auto-updater

### Technology Stack
- Frontend: React 19, TypeScript, Vite, TailwindCSS, SCSS
- Desktop: Tauri v2
- Backend: Rust
- Package Manager: pnpm

---

## Release History

### Version 2.x Series (Tauri v2)

MC-Vector 2.0 represents a complete rewrite using Tauri v2, bringing improved performance, security, and cross-platform support.

### Version 1.x Series (Legacy)

Earlier versions of MC-Vector (if any) are no longer supported.

---

## Upgrade Notes

### Upgrading to 2.0.47

MC-Vector includes an auto-updater. When a new version is available, you'll be prompted to update automatically.

**Manual Installation:**
1. Download the latest release from [GitHub Releases](https://github.com/tukuyomil032/MC-Vector/releases)
2. Install the new version
3. Your server data and settings will be preserved

---

## Changelog Guidelines

When contributing, please update this changelog according to these guidelines:

### Categories

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements

### Format

```markdown
## [Version] - YYYY-MM-DD

### Added
- New feature description

### Fixed
- Bug fix description (#issue-number)
```

---

[Unreleased]: https://github.com/tukuyomil032/MC-Vector/compare/v2.0.47...HEAD
[2.0.47]: https://github.com/tukuyomil032/MC-Vector/releases/tag/v2.0.47
