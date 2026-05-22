# MC-Vector Architecture

Technical overview of MC-Vector's architecture, component structure, and data flow.

**Document target version:** `2.0.55`

## Table of Contents

- [System Architecture](#system-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Data Flow](#data-flow)
- [Technology Choices](#technology-choices)
- [Security Considerations](#security-considerations)

---

## System Architecture

MC-Vector is a cross-platform desktop application built with Tauri v2, combining a React frontend with a Rust backend.

```
┌─────────────────────────────────────────────────────────┐
│                     MC-Vector App                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │           Frontend (React + TypeScript)         │    │
│  │                                                 │    │
│  │  - UI Components (renderer/components/)        │    │
│  │  - State Management (Zustand stores)           │    │
│  │  - API Wrappers (lib/)                         │    │
│  │  - Styling (Tailwind CSS + CSS Variables)      │    │
│  └────────────────────────────────────────────────┘    │
│                          ▲                               │
│                          │ Tauri IPC                     │
│                          ▼                               │
│  ┌────────────────────────────────────────────────┐    │
│  │           Backend (Rust + Tauri v2)             │    │
│  │                                                 │    │
│  │  - Tauri Commands (commands/)                  │    │
│  │  - Server Process Management (Tokio)           │    │
│  │  - File System Operations                      │    │
│  │  - HTTP Client (reqwest)                       │    │
│  │  - System Monitoring (sysinfo)                 │    │
│  └────────────────────────────────────────────────┘    │
│                          ▲                               │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────┐    │
│  │           External Resources                    │    │
│  │                                                 │    │
│  │  - Minecraft Servers (local child processes)   │    │
│  │  - Plugin APIs (Modrinth, Hangar, SpigotMC)    │    │
│  │  - Server Software Downloads                   │    │
│  │  - Ngrok (TCP tunnel)                          │    │
│  │  - Mojang API (player UUID resolution)         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Core data flow:** React components → `src/lib/` wrappers → Tauri IPC → `src-tauri/src/commands/` (Rust)

---

## Frontend Architecture

### Component Structure

```
src/
├── App.tsx                         # Root component, app shell
├── main.tsx                        # React entry point
├── renderer/
│   ├── components/                 # Feature UI components
│   │   ├── AppMainContent.tsx      # View switcher
│   │   ├── AppServerSidebar.tsx    # Server list panel
│   │   ├── AppMainHeader.tsx       # Top bar with server controls
│   │   ├── DashboardView.tsx       # KPI tiles + real-time charts
│   │   ├── ConsoleView.tsx         # Log stream + command input
│   │   ├── UsersView.tsx           # Whitelist / ops / bans
│   │   ├── FilesView.tsx           # File manager + Monaco editor
│   │   ├── PluginBrowser.tsx       # Plugin/mod search + install
│   │   ├── BackupsView.tsx         # Backup create/restore
│   │   ├── CommandPalette.tsx      # Cmd+K quick actions
│   │   ├── JavaManagerModal.tsx    # Java runtime download/manage
│   │   ├── VersionUpgradeWizard.tsx # Auto server upgrade
│   │   ├── AppUpdateModal.tsx      # App self-update
│   │   ├── AddServerModal.tsx      # New server creation
│   │   ├── ImportServerModal.tsx   # Import existing server
│   │   └── ...
│   └── shared/                     # Shared constants and types
│       ├── propertiesData.ts
│       └── serverDeclarations.ts
├── lib/                            # Tauri IPC wrappers
│   ├── server-commands.ts
│   ├── file-commands.ts
│   ├── plugin-commands.ts
│   ├── backup-commands.ts
│   ├── java-commands.ts
│   ├── adapters/plugin/            # Plugin source adapters
│   │   ├── modrinth.ts
│   │   ├── hangar.ts
│   │   └── spigot.ts
│   ├── guards/                     # Runtime type guards
│   │   └── json-guards.ts
│   ├── tauri-api.ts                # Base invoke wrapper
│   ├── ui.ts                       # cn() + CVA helpers
│   └── error-utils.ts
└── store/                          # Zustand state stores
    ├── serverStore.ts
    ├── uiStore.ts
    ├── settingsStore.ts
    └── consoleStore.ts
```

### State Management

MC-Vector uses **Zustand** for global state, split into four stores:

| Store | Responsibility |
|-------|---------------|
| `useServerStore` | Server list, selected server, server status, process metadata |
| `useUiStore` | Current view, modal open/close state, sidebar collapsed flag |
| `useSettingsStore` | App-level settings (theme, language, update preferences) |
| `useConsoleStore` | Console log buffer, command history per server |

### API Layer

`src/lib/` wraps all Tauri `invoke` calls with typed interfaces. Components call wrappers only — never raw `invoke` directly.

```typescript
// src/lib/server-commands.ts
import { invoke } from '@tauri-apps/api/core';

export async function startServer(serverId: string): Promise<void> {
  await invoke('start_server', { serverId });
}

export async function stopServer(serverId: string): Promise<void> {
  await invoke('stop_server', { serverId });
}
```

External API payloads (Modrinth, Hangar, Mojang) are validated at `src/lib/guards/json-guards.ts` before use.

### Styling Strategy

- **Tailwind CSS** for utility-first class composition
- **CSS Variables** for the design token layer (Zinc dark theme):
  - Background: `--color-zinc-950` (`#09090b`)
  - Card: `--color-zinc-900` (`#18181b`)
  - Border: `--color-zinc-800` (`#27272a`)
  - Accent: white
  - Semantic status colors: green (running), red (stopped/error), amber (warning)
- **Radix UI** for accessible headless primitives (dialogs, dropdowns, tooltips)

---

## Backend Architecture

### Tauri Command Structure

```
src-tauri/src/
├── main.rs                    # App entry point
├── lib.rs                     # Plugin registration, shared state init, command list
└── commands/
    ├── mod.rs                 # Module exports
    ├── server.rs              # Server lifecycle management
    ├── file_utils.rs          # File system operations
    ├── download.rs            # HTTP file downloads
    ├── process_stats.rs       # CPU + memory telemetry
    ├── backup.rs              # Backup / restore / compress / extract
    ├── java.rs                # Java runtime download
    ├── ngrok.rs               # Ngrok tunnel management
    ├── health_check.rs        # Minecraft Server List Ping
    ├── updater_utils.rs       # App update helpers
    ├── security.rs            # Security gateway
    └── perf.rs                # ANSI parsing acceleration
```

### Command Reference

#### Server Management (`server.rs`)

| Command | Description |
|---------|-------------|
| `start_server` | Spawn Java process; stream stdout/stderr to frontend |
| `stop_server` | Send stop signal to the running server |
| `send_command` | Queue a console command (rate-limited via `CommandLimiter`) |
| `is_server_running` | Check process state |
| `get_server_pid` | Return current PID |
| `validate_jvm_extra_args` | Validate custom JVM flags before saving |

#### File System (`file_utils.rs`)

| Command | Description |
|---------|-------------|
| `resolve_managed_path` | Resolve path within managed roots (path-traversal safe) |
| `read_managed_text_file` | Read text file content |
| `write_managed_text_file` | Write text file content |
| `list_dir_with_metadata` | List directory with size and modification time |

#### Downloads (`download.rs`, `java.rs`)

| Command | Description |
|---------|-------------|
| `download_file` | Generic download with progress events |
| `download_server_jar` | Download server software JAR |
| `download_java` | Download and extract Java JDK (tar.gz / zip) |

#### Backup / Archive (`backup.rs`)

| Command | Description |
|---------|-------------|
| `create_backup` | ZIP the server directory with progress events |
| `restore_backup` | Restore from a backup archive |
| `compress_item` | Compress arbitrary file/folder |
| `extract_item` | Extract any archive |

#### Network (`ngrok.rs`, `health_check.rs`)

| Command | Description |
|---------|-------------|
| `start_ngrok` | Start a TCP tunnel |
| `stop_ngrok` | Stop the tunnel |
| `download_ngrok` | Download and extract the ngrok binary |
| `is_ngrok_installed` | Check binary presence |
| `ping_server` | Minecraft Server List Ping — returns status, player count, MOTD |

#### Observability, Security, Performance (`process_stats.rs`, `security.rs`, `perf.rs`, `updater_utils.rs`)

| Command | Description |
|---------|-------------|
| `get_server_stats` | CPU + memory usage for a given PID (emitted every 2s as `server-stats` event) |
| `security_gateway` | Centralized auth, rate-limit, path-safety, sanitization, audit log |
| `parse_ansi_lines` | Rust-side ANSI color code parsing for fast console rendering |
| `can_update_app` | Check if an app update is available |
| `get_app_location` | Return the installed app binary path |

### Shared State (Tauri AppState)

Three Mutex-protected state objects are available to all commands via Tauri's managed state:

| State | Type | Purpose |
|-------|------|---------|
| `ServerManager` | `Mutex<HashMap<ServerId, ServerHandle>>` | Running server processes, command channels |
| `CommandLimiter` | `Mutex<HashMap<ServerId, Instant>>` | Per-server command rate limiting |
| `NgrokManager` | `Mutex<Option<NgrokHandle>>` | Active ngrok process handle |

### Process Management

MC-Vector manages Minecraft server processes on Tokio with a queue-first pipeline:

1. `start_server` validates `server_id`, Java path, memory args, and JAR path before spawning.
2. Commands are sent through a bounded `mpsc` channel (`command_tx`) — never written directly to stdin from multiple callsites.
3. stdout/stderr are buffered and forwarded to the frontend via bounded log channels; overflow is handled with drop notices.
4. `CommandLimiter` enforces a minimum inter-command interval per server.
5. Process handles and limiters are cleaned up on process exit.

### Event Bus

The backend emits Tauri events consumed by the frontend:

| Event | Payload | Source |
|-------|---------|--------|
| `server-log` | `{ line, stream }` | server.rs stdout/stderr |
| `server-status-change` | `{ status }` | server.rs on spawn/exit |
| `download-progress` | `{ downloaded, total }` | download.rs |
| `ngrok-status-change` | `{ status, url }` | ngrok.rs |
| `server-stats` | `{ cpu, memory }` | process_stats.rs (2s interval) |

---

## Data Flow

### Server Start

```
User clicks "Start Server"
    → DashboardView (React)
    → startServer() wrapper (src/lib/server-commands.ts)
    → Tauri IPC invoke('start_server')
    → start_server command (Rust)
    → Spawn Java child process (Tokio)
    → Stream stdout/stderr → emit 'server-log' events
    → Emit 'server-status-change' (Running)
    → ConsoleView and DashboardView update reactively
```

### Plugin Installation

```
User clicks "Install"
    → PluginBrowser (React)
    → downloadFile() wrapper (src/lib/plugin-commands.ts)
    → Tauri IPC invoke('download_file')
    → download_file command (Rust)
    → HTTP GET to Modrinth/Hangar/SpigotMC CDN
    → Stream bytes to disk → plugins/ folder
    → Emit 'download-progress' events → progress bar update
    → Notify frontend on completion
```

### File Edit

```
User opens file
    → FilesView (React)
    → readTextFile() wrapper (src/lib/file-commands.ts)
    → Tauri IPC invoke('read_managed_text_file')
    → Rust: resolve_managed_path → read file
    → Return content → Monaco Editor displays it

User saves file
    → writeTextFile() wrapper
    → Tauri IPC invoke('write_managed_text_file')
    → Rust: resolve_managed_path → write file
```

---

## Technology Choices

### Why Tauri v2?

- **Performance:** Native Rust backend with minimal memory overhead
- **Security:** Sandboxed WebView, explicit IPC permissions, no Node.js runtime
- **Cross-platform:** Single codebase for macOS, Windows, and Linux
- **Bundle size:** ~10–20 MB vs. Electron's ~100 MB+

### Why React 19?

- Concurrent rendering and automatic batching for performant UI updates
- Modern hooks API with clean composition patterns
- Vast ecosystem (Radix UI, React Query, React Hook Form)

### Why Rust?

- Memory safety and zero data races by design
- Native-speed process management and file I/O
- Async/await with Tokio for concurrent server monitoring
- Strong type system eliminates entire classes of runtime errors

### Why pnpm?

- Shared dependency storage reduces disk usage
- Strict phantom-dependency prevention
- Workspace support for future monorepo expansion (`docs/` package)

---

## Security Considerations

### Tauri Security Model

- **IPC Allowlist:** Only explicitly registered commands are callable from the frontend
- **CSP:** `script-src 'self'` — no inline scripts or external script sources
- **Sandboxed WebView:** Frontend has no direct OS access
- **No Node.js:** The backend is pure Rust — no `eval`, no `child_process` from JS

### Input Validation and Command Safety

- `security_gateway` centralizes role checks (`admin` / `user` / `viewer`), rate limiting, safe command validation, path safety verification, and audit logging
- `server.rs` validates `server_id`, command payload length, and inter-command timing before queueing
- `file_utils.rs` enforces managed-root path resolution before any file read/write/list operation

### File System Access

- All file operations are scoped to the app data directory
- `resolve_managed_path` blocks path traversal (`../`) and absolute path escapes
- User-supplied paths are sanitized before use

### Network Security

- HTTPS for all external API calls (reqwest with TLS)
- Certificate validation enabled by default
- No code execution from network responses

---

For setup instructions, see the [Development Guide](./development-guide.md).
