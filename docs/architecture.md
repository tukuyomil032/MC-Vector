# MC-Vector Architecture

This document provides a technical overview of MC-Vector's architecture, including system design, component structure, and data flow.

**Document target version:** `2.0.52`

## Table of Contents

- [System Architecture](#system-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Data Flow](#data-flow)
- [Technology Choices](#technology-choices)
- [Security Considerations](#security-considerations)

---

## System Architecture

MC-Vector is a cross-platform desktop application built with Tauri, combining a React frontend with a Rust backend.

```
┌─────────────────────────────────────────────────────────┐
│                     MC-Vector App                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │           Frontend (React + TypeScript)         │    │
│  │                                                 │    │
│  │  - UI Components (renderer/components/)        │    │
│  │  - State Management (Zustand)                  │    │
│  │  - API Wrappers (lib/)                         │    │
│  │  - Styling (TailwindCSS + SCSS)                │    │
│  └────────────────────────────────────────────────┘    │
│                          ▲                               │
│                          │ Tauri IPC                     │
│                          ▼                               │
│  ┌────────────────────────────────────────────────┐    │
│  │           Backend (Rust + Tauri)                │    │
│  │                                                 │    │
│  │  - Tauri Commands (commands/)                  │    │
│  │  - Server Process Management                   │    │
│  │  - File System Operations                      │    │
│  │  - HTTP Client (Download, API calls)           │    │
│  │  - System Monitoring (CPU, Memory)             │    │
│  └────────────────────────────────────────────────┘    │
│                          ▲                               │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────┐    │
│  │           External Resources                    │    │
│  │                                                 │    │
│  │  - Minecraft Servers (local processes)         │    │
│  │  - Plugin APIs (Modrinth, Hangar, SpigotMC)    │    │
│  │  - Server Software Downloads                   │    │
│  │  - Ngrok (Port forwarding)                     │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Component Structure

The frontend follows a component-based architecture with clear separation of concerns:

```
src/
├── App.tsx                    # Root component, app shell
├── main.tsx                   # React entry point
├── renderer/
│   ├── components/            # UI components
│   │   ├── AddServerModal.tsx
│   │   ├── ConsoleView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── FilesView.tsx
│   │   ├── PluginBrowser.tsx
│   │   └── ...
│   └── shared/                # Shared utilities
│       ├── propertiesData.ts
│       └── server declaration.ts
├── lib/                       # API wrappers
│   ├── server-commands.ts
│   ├── file-commands.ts
│   ├── plugin-commands.ts
│   └── ...
└── styles/                    # SCSS styles
    ├── base/
    ├── components/
    ├── layout/
    ├── modals/
    └── views/
```

### State Management

MC-Vector uses **Zustand** for state management, providing a simple and performant solution for global state.

**Key State Stores:**

- Server list
- Selected server
- Server status
- Plugin/mod browser state
- File browser state

### API Layer

The `src/lib/` directory contains wrappers around Tauri commands, providing type-safe interfaces:

```typescript
// Example: src/lib/server-commands.ts
import { invoke } from '@tauri-apps/api/core';

export async function startServer(serverId: string): Promise<void> {
  await invoke('start_server', { serverId });
}

export async function stopServer(serverId: string): Promise<void> {
  await invoke('stop_server', { serverId });
}
```

### Styling Strategy

1. **TailwindCSS** for utility-first styling
2. **SCSS** for complex, reusable styles
3. **Modular SCSS** organized by responsibility (base, components, layout, modals, views)
4. Styles imported centrally through `src/styles/index.scss`

---

## Backend Architecture

### Tauri Command Structure

Tauri commands are the bridge between frontend and backend:

```
src-tauri/src/
├── main.rs                    # App entry point, command registration
├── lib.rs                     # Library exports
└── commands/
    ├── mod.rs                 # Command module exports
    ├── server.rs              # Server lifecycle management
    ├── file_utils.rs          # File system operations
    ├── download.rs            # HTTP downloads
    ├── process_stats.rs       # System monitoring
    ├── backup.rs              # Backup/restore
    ├── java.rs                # Java runtime detection
    ├── ngrok.rs               # Ngrok integration
    ├── updater_utils.rs       # Updater utilities
    ├── security.rs            # Security gateway
    └── perf.rs                # ANSI parse acceleration
```

### Command Categories

#### 1. Server Management (`server.rs`)

- `start_server` - Start a Minecraft server process
- `stop_server` - Stop a running server
- `send_command` - Execute console command (queued + rate-limited)
- `is_server_running` - Check running state
- `get_server_pid` - Read current process id

#### 2. File System (`file_utils.rs`)

- `resolve_managed_path` - Resolve/validate managed app path
- `read_managed_text_file` - Read text file contents
- `write_managed_text_file` - Write text file contents
- `list_dir_with_metadata` - List files/folders with metadata

#### 3. Download / Runtime (`download.rs`, `java.rs`)

- `download_file` - Generic file download
- `download_server_jar` - Download Minecraft server JAR
- `download_java` - Download Java runtime

#### 4. Backup / Archive (`backup.rs`)

- `create_backup` - Create server backup (ZIP)
- `restore_backup` - Restore backup
- `compress_item` - Compress file/folder(s)
- `extract_item` - Extract archive

#### 5. Network / Update (`ngrok.rs`, `updater_utils.rs`)

- `start_ngrok` / `stop_ngrok` / `download_ngrok` / `is_ngrok_installed`
- `can_update_app` / `get_app_location`

#### 6. Observability / Security / Performance Extensions

- `get_server_stats` (`process_stats.rs`) - CPU + memory telemetry
- `security_gateway` (`security.rs`) - authorization, validation, rate-limit, audit entry
- `parse_ansi_lines` (`perf.rs`) - Rust-side ANSI parsing for console rendering

### Process Management

MC-Vector manages Minecraft server processes on Tokio with a queue-first pipeline:

1. `start_server` validates `server_id`, java path, memory, and jar path before spawn.
2. Commands are sent through a bounded `mpsc` queue (`command_tx`) instead of direct stdin writes from multiple paths.
3. stdout/stderr are buffered and streamed to frontend via bounded log channels with drop notices under pressure.
4. `CommandLimiter` enforces a minimum command interval per server.
5. Server/limiter state is cleaned up when the process exits.

---

## Data Flow

### Server Start Flow

```
User clicks "Start Server"
    ↓
React Component (DashboardView)
    ↓
API Wrapper (startServer)
    ↓
Tauri IPC
    ↓
Rust Command (start_server)
    ↓
Spawn Java Process
    ↓
Monitor Process Output
    ↓
Stream Logs to Frontend
    ↓
Update UI (Console, Status)
```

### Plugin Installation Flow

```
User clicks "Install" on Plugin
    ↓
React Component (PluginBrowser)
    ↓
API Wrapper (installPlugin)
    ↓
Tauri IPC
    ↓
Rust Command (download_file)
    ↓
HTTP Request to Plugin API
    ↓
Download JAR File
    ↓
Save to Server Plugins Folder
    ↓
Notify Frontend (Success/Error)
    ↓
Update UI (Installed Plugins List)
```

### File Edit Flow

```
User opens file in File Browser
    ↓
React Component (FilesView)
    ↓
API Wrapper (readFileContent)
    ↓
Tauri IPC
    ↓
Rust Command (read_managed_text_file)
    ↓
Read File from Disk
    ↓
Return Contents to Frontend
    ↓
Display in Monaco Editor
    ↓
User edits and saves
    ↓
API Wrapper (saveFileContent)
    ↓
Tauri IPC
    ↓
Rust Command (write_managed_text_file)
    ↓
Write to Disk
```

---

## Technology Choices

### Why Tauri?

- **Performance:** Native Rust backend, minimal resource usage
- **Security:** Sandboxed environment, explicit IPC permissions
- **Cross-platform:** Single codebase for macOS, Windows, Linux
- **Modern:** Web technologies for UI, native code for system operations
- **Small Bundle Size:** ~10-20MB vs. Electron's ~100MB+

### Why React 19?

- **Modern Hooks:** Simplified state management
- **Performance:** Concurrent rendering, automatic batching
- **Ecosystem:** Vast library of components and tools
- **Developer Experience:** Hot reload, DevTools

### Why Rust?

- **Memory Safety:** No null pointer exceptions, no data races
- **Performance:** Comparable to C/C++
- **Concurrency:** Built-in async/await with Tokio
- **Reliability:** Strong type system, compiler guarantees

### Why pnpm?

- **Disk Efficiency:** Shared dependency storage
- **Speed:** Faster installs than npm/yarn
- **Strict:** Prevents phantom dependencies

---

## Security Considerations

### Tauri Security Model

1. **IPC Permissions:** Explicit allowlist for Tauri commands
2. **CSP (Content Security Policy):** Restricts script execution
3. **Sandboxing:** Frontend runs in a WebView sandbox
4. **No Node.js:** Backend is pure Rust, no Node.js runtime

### Input Validation and Command Safety

Validation is performed at frontend wrapper and Rust command boundaries:

- `security_gateway` centralizes role checks (`admin`/`user`/`viewer`), rate-limit checks, safe command validation, path safety checks, and audit logging.
- `server.rs` validates `server_id`, command payloads, and command timing before queueing.
- `file_utils.rs` enforces managed-root path resolution before file read/write/list operations.

### File System Access

- All file operations are scoped to the app data directory
- Path traversal attacks are prevented
- User-controlled paths are sanitized

### Network Security

- HTTPS for all external API calls
- Certificate validation enabled
- No arbitrary code execution from network responses

---

## Future Architecture Improvements

### Planned Enhancements

1. **Plugin System:** Support for custom plugins to extend MC-Vector
2. **Multi-Instance Support:** Run multiple servers simultaneously
3. **Advanced Monitoring:** Detailed performance metrics, graphs
4. **Scheduled Tasks:** Automated backups, restarts
5. **WebSocket Support:** Real-time log streaming

### Refactoring Opportunities

1. **State Management:** Consider migrating to a more robust solution for complex state
2. **Backend Modularity:** Further split commands into domain-specific modules
3. **Testing:** Add comprehensive unit and integration tests
4. **Error Handling:** Unified error handling strategy across frontend and backend

---

For implementation details, see the [Development Guide](./development-guide.md).
