# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MC-Vector is a cross-platform desktop app (Tauri v2 + React 19 + TypeScript) for Minecraft server management. It handles server lifecycle, real-time monitoring, plugin/mod browsing (Modrinth, Hangar, SpigotMC), file editing (Monaco Editor), backups, Java version management, and Ngrok integration.

The hardening ADR suite is indexed by `spec/ADR-000-index.md`, which is the canonical specification for security, reliability, IPC integration, and real Tauri smoke E2E work.

After any refactor: run `bun run build` and confirm it succeeds before finishing.

## Architecture

**Data flow:** React components → `src/lib/` wrappers → Tauri IPC → `src-tauri/src/commands/` (Rust)

## Delivery Tracking

- `spec/ADR-000-index.md` — canonical index for the hardening ADR suite, dependency order, evidence levels, and score gates.
- Repository specifications live under `spec/`; `docs/` is the Astro/Starlight documentation site package.
