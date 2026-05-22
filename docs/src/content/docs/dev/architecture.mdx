---
title: Architecture
description: Technical overview of MC-Vector's system design, data flow, and component structure.
sidebar:
  order: 2
  badge:
    text: Developer
    variant: note
---

## System Overview

MC-Vector is a cross-platform desktop application built with **Tauri v2** (Rust backend) and **React 19** (TypeScript frontend).

```mermaid
┌──────────────────────────────────────────────────────────┐
│                      MC-Vector App                        │
├──────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                            │
│  - UI Components  (src/renderer/components/)             │
│  - State          (Zustand stores in src/store/)         │
│  - IPC Wrappers   (src/lib/)                             │
│                          ▲                               │
│                          │  Tauri IPC (invoke / events)  │
│                          ▼                               │
│  Backend (Rust + Tauri v2)                               │
│  - Tauri Commands (src-tauri/src/commands/)              │
│  - Server process management (Tokio async)               │
│  - File system, HTTP, sysinfo                            │
│                          ▲                               │
│                          │                               │
│                          ▼                               │
│  External                                                │
│  - Minecraft server child processes                      │
│  - Plugin APIs  (Modrinth, Hangar, SpigotMC)            │
│  - Ngrok TCP tunnel                                      │
│  - Mojang API   (UUID resolution)                        │
└──────────────────────────────────────────────────────────┘
```

**Core data flow:** React components → `src/lib/` wrappers → `invoke()` → Rust commands → system resources

## Frontend

### Directory Structure

```
src/
├── renderer/components/     # Feature UI components
│   ├── DashboardView.tsx    # KPI tiles + real-time charts
│   ├── ConsoleView.tsx      # Log stream + command input
│   ├── FilesView.tsx        # File manager + Monaco editor
│   ├── PluginBrowser.tsx    # Plugin/mod search + install
│   ├── BackupsView.tsx      # Backup create/restore
│   ├── UsersView.tsx        # Whitelist / ops / bans
│   └── ...
├── lib/                     # Tauri IPC wrappers
│   ├── server-commands.ts
│   ├── file-commands.ts
│   ├── plugin-commands.ts
│   ├── adapters/plugin/     # Modrinth / Hangar / Spigot
│   └── guards/              # Runtime type guards
└── store/                   # Zustand state stores
    ├── serverStore.ts
    ├── uiStore.ts
    ├── settingsStore.ts
    └── consoleStore.ts
```

### State Management (Zustand)

| Store              | Responsibility                                           |
| ------------------ | -------------------------------------------------------- |
| `useServerStore`   | Server list, selected server, status                     |
| `useUiStore`       | Current view, modal open/close, sidebar state            |
| `useSettingsStore` | Theme, language, update preferences                      |
| `useConsoleStore`  | Console log buffer (2,000 lines/server), command history |

**Persistent storage** uses Tauri Store plugin (not localStorage):

- `servers.json` — server definitions
- `config.json` — Ngrok token, app config
- `console-history` — per-server command history

### IPC Wrapper Pattern

Components never call `invoke()` directly. All IPC goes through typed wrapper functions in `src/lib/`:

```typescript
// ✅ Correct — call a wrapper
import { startServer } from '../lib/server-commands';
await startServer(serverId);

// ❌ Incorrect — raw invoke
import { invoke } from '@tauri-apps/api/core';
await invoke('start_server', { serverId });
```

External API responses (Modrinth, Hangar, Mojang) are validated with runtime type guards in `src/lib/guards/` before use.

## Backend

### Tauri Command Modules

```
src-tauri/src/commands/
├── server.rs         # Server lifecycle (start, stop, send_command)
├── file_utils.rs     # File read/write/list (path-traversal-safe)
├── download.rs       # HTTP file downloads with progress events
├── backup.rs         # ZIP backup / restore / compress / extract
├── java.rs           # Java JDK download and extraction
├── ngrok.rs          # Ngrok process management
├── health_check.rs   # Minecraft Server List Ping (SLP)
├── process_stats.rs  # CPU + memory telemetry (sysinfo)
├── security.rs       # Security gateway (auth, rate limit, audit)
├── perf.rs           # ANSI log parsing (Rust-side for performance)
└── updater_utils.rs  # App self-update helpers
```

### Shared State (AppState)

Three Mutex-protected state objects are available to all commands via Tauri's managed state:

| State            | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `ServerManager`  | Running server processes and command channels              |
| `CommandLimiter` | Per-server command rate limiting (100 ms minimum interval) |
| `NgrokManager`   | Active Ngrok process handle                                |

### Event Bus

The backend emits Tauri events that the frontend listens to:

| Event                  | Payload                  | Emitted by                      |
| ---------------------- | ------------------------ | ------------------------------- |
| `server-log`           | `{ line, stream }`       | server.rs stdout/stderr         |
| `server-status-change` | `{ status }`             | server.rs on spawn/exit         |
| `server-stats`         | `{ cpu, memory }`        | process_stats.rs (2 s interval) |
| `ngrok-status-change`  | `{ status, url }`        | ngrok.rs                        |
| `download-progress`    | `{ downloaded, total }`  | download.rs                     |
| `backup-progress`      | `{ serverId, progress }` | backup.rs                       |

### Process Management

1. `start_server` validates the server ID, Java path, memory args, and JAR path before spawning.
2. Commands are sent through a bounded `mpsc` channel — never written directly to stdin from multiple callers.
3. stdout/stderr are buffered (4,096 lines) and forwarded to the frontend in batches (50 ms flush interval, max 200 lines/tick).
4. `CommandLimiter` enforces a minimum 100 ms interval between commands per server.
5. Process handles and limiters are cleaned up on process exit.

## Key Data Flows

### Server Start

```
User clicks "Start"
→ DashboardView
→ startServer() (src/lib/server-commands.ts)
→ invoke('start_server')
→ Rust: validate → spawn Java process (Tokio)
→ Stream stdout → emit 'server-log' events
→ Emit 'server-status-change' (online)
→ Dashboard and Console update reactively
```

### Plugin Install

```
User clicks "Install"
→ PluginBrowser
→ downloadFile() (src/lib/plugin-commands.ts)
→ invoke('download_file')
→ Rust: HTTP GET to CDN → stream bytes to plugins/ folder
→ Emit 'download-progress' events → progress bar updates
```

## Security Model

- **IPC allowlist** — only explicitly registered commands are callable from the frontend.
- **Path safety** — `resolve_managed_path` in `file_utils.rs` blocks `../` and absolute path escapes; all file operations are scoped to the app data directory.
- **Input validation** — `security_gateway` centralizes role checks, rate limiting, command sanitization, and audit logging.
- **No inline scripts** — CSP enforces `script-src 'self'`.
- **TLS everywhere** — all external HTTP requests use reqwest with certificate validation enabled.

## Technology Choices

| Technology   | Why                                                                           |
| ------------ | ----------------------------------------------------------------------------- |
| **Tauri v2** | Native performance, ~10–20 MB bundle vs Electron's ~100 MB, sandboxed WebView |
| **Rust**     | Memory safety, zero data races, Tokio async for concurrent process management |
| **React 19** | Concurrent rendering, modern hooks, large ecosystem (Radix UI, React Query)   |
| **Zustand**  | Minimal boilerplate, fine-grained subscriptions, no provider nesting          |
| **pnpm**     | Strict phantom-dependency prevention, workspace support for `docs/` package   |
