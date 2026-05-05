# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MC-Vector is a cross-platform desktop app (Tauri v2 + React 19 + TypeScript) for Minecraft server management. It handles server lifecycle, real-time monitoring, plugin/mod browsing (Modrinth, Hangar, SpigotMC), file editing (Monaco Editor), backups, Java version management, and Ngrok integration.

After any refactor: run `pnpm build` and confirm it succeeds before finishing.

## Architecture

**Data flow:** React components → `src/lib/` wrappers → Tauri IPC → `src-tauri/src/commands/` (Rust)

For detailed layer structure, see `docs/engineering-requirements.md`.

## Delivery Tracking

- `docs/engineering-requirements.md` — implementation constraints; keep aligned with current state.
- `docs/next-phase-plan.md` — phase plan and status matrix; update after each substantial change.
