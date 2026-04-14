# MC-Vector Architecture

This document provides a technical overview of MC-Vector's architecture, including system design, component structure, and data flow.

**Document target version:** `2.0.51`

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
    └── ngrok.rs               # Ngrok integration
```

### Command Categories

#### 1. Server Management (`server.rs`)

- `start_server` - Start a Minecraft server process
- `stop_server` - Stop a running server
- `get_server_status` - Check if server is running
- `send_command` - Execute console command

#### 2. File System (`file_utils.rs`)

- `read_file` - Read file contents
- `write_file` - Write to file
- `list_directory` - List files/folders
- `create_directory` - Create folder
- `delete_file` - Delete file/folder

#### 3. Downloads (`download.rs`)

- `download_server_software` - Download server JAR
- `download_plugin` - Download plugin/mod

#### 4. System Monitoring (`process_stats.rs`)

- `get_cpu_usage` - Get CPU usage percentage
- `get_memory_usage` - Get RAM usage

#### 5. Backup (`backup.rs`)

- `create_backup` - Create server backup (ZIP)
- `restore_backup` - Restore from backup
- `list_backups` - List available backups

#### 6. Java Management (`java.rs`)

- `detect_java_versions` - Find installed Java versions
- `get_java_path` - Get path to specific Java version

#### 7. Ngrok Integration (`ngrok.rs`)

- `start_ngrok_tunnel` - Create public tunnel
- `stop_ngrok_tunnel` - Stop tunnel

### Process Management

MC-Vector manages Minecraft server processes using Tokio's async runtime:

```rust
use tokio::process::Command;
use std::process::Stdio;

pub async fn start_server(server_id: &str) -> Result<(), String> {
    let server_path = get_server_path(server_id)?;

    Command::new("java")
        .arg("-jar")
        .arg("server.jar")
        .current_dir(&server_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

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
Rust Command (download_plugin)
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
API Wrapper (readFile)
    ↓
Tauri IPC
    ↓
Rust Command (read_file)
    ↓
Read File from Disk
    ↓
Return Contents to Frontend
    ↓
Display in Monaco Editor
    ↓
User edits and saves
    ↓
API Wrapper (writeFile)
    ↓
Tauri IPC
    ↓
Rust Command (write_file)
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

### Input Validation

All user input is validated on the backend:

```rust
pub fn validate_server_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }
    if name.len() > 50 {
        return Err("Server name too long".to_string());
    }
    // Prevent directory traversal
    if name.contains("..") || name.contains("/") || name.contains("\\") {
        return Err("Invalid server name".to_string());
    }
    Ok(())
}
```

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
