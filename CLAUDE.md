# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MC-Vector is a cross-platform desktop app (Tauri v2 + React 19 + TypeScript) for Minecraft server management. It handles server lifecycle, real-time monitoring, plugin/mod browsing (Modrinth, Hangar, SpigotMC), file editing (Monaco Editor), backups, Java version management, and Ngrok integration.

A macOS Tahoe (26)+ native app (Swift 6 / SwiftUI / AppKit) is planned as an independent reimplementation — not a shared-core port. See `spec/native-macos-requirements.md` for the full rationale. The SwiftPM package lives under `apps/native-macos/` — see `apps/native-macos/README.md` for build/lint commands.

After any refactor: run `pnpm build` and confirm it succeeds before finishing.

## Architecture

**Data flow:** React components → `src/lib/` wrappers → Tauri IPC → `src-tauri/src/commands/` (Rust)

## Delivery Tracking

- `spec/native-macos-requirements.md` — Rust/Swift independence decision, macOS native app requirements and feasibility research.
- `spec/next-phase-plan.md` — phase plan and status matrix; update after each substantial change.
- Specs and phase plans for this repo live under `spec/`, not `docs/` (the latter is the Astro/Starlight documentation site package — keep it free of planning documents to avoid confusion).
