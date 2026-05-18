# MC-Vector Tauri Package Research

# Overview

This document summarizes useful packages, plugins, UI/UX libraries, Rust crates,
and architecture recommendations for the MC-Vector project.

The research is based on the following repository:

- Repository: https://github.com/tukuyomil032/MC-Vector

Current stack observed:

- Tauri v2
- React 19
- Monaco Editor
- xterm.js
- Zustand
- Framer Motion
- Recharts
- Tailwind CSS
- Rust backend with Tokio

---

# Highest Priority Recommendations

| Priority | Package                 | Purpose               |
| -------- | ----------------------- | --------------------- |
| S        | @tanstack/react-query   | Async state + caching |
| S        | @tanstack/react-virtual | Large list rendering  |
| S        | react-hook-form + zod   | Form validation       |
| S        | sonner                  | Toast notifications   |
| S        | cmdk                    | Command palette       |
| S        | react-resizable-panels  | VSCode-like layout    |
| S        | monaco-yaml             | YAML support          |
| S        | @xterm/addon-search     | Terminal search       |

---

# Recommended Tauri Plugins

## plugin-window-state

Restore:

- window size
- window position
- maximize state

Recommended for desktop UX.

```bash
pnpm add @tauri-apps/plugin-window-state
```

Rust:

```toml
tauri-plugin-window-state = "2"
```

---

## plugin-global-shortcut

Useful for:

- quick launch
- start/stop servers
- command palette

```bash
pnpm add @tauri-apps/plugin-global-shortcut
```

---

## plugin-clipboard-manager

Useful for:

- server IP copy
- port copy
- log copy
- command copy

```bash
pnpm add @tauri-apps/plugin-clipboard-manager
```

---

## plugin-autostart

Useful for:

- auto-launch MC-Vector
- auto-start monitoring

```bash
pnpm add @tauri-apps/plugin-autostart
```

---

## plugin-deep-link

Useful for:

```txt
mc-vector://server/start?id=survival
```

Can integrate with:

- browser
- discord
- future web UI

---

# UI/UX Libraries

## Radix UI

Recommended packages:

```bash
pnpm add @radix-ui/react-dialog
pnpm add @radix-ui/react-dropdown-menu
pnpm add @radix-ui/react-context-menu
pnpm add @radix-ui/react-tabs
pnpm add @radix-ui/react-tooltip
pnpm add @radix-ui/react-popover
pnpm add @radix-ui/react-select
pnpm add @radix-ui/react-switch
pnpm add @radix-ui/react-progress
pnpm add @radix-ui/react-scroll-area
```

Best use cases:

- dialogs
- tabs
- context menus
- dropdowns
- progress UI

---

## CVA + clsx + tailwind-merge

```bash
pnpm add class-variance-authority clsx tailwind-merge
```

Useful for scalable component systems.

---

## react-resizable-panels

```bash
pnpm add react-resizable-panels
```

Recommended layout:

```txt
┌──────────────┬─────────────────────────────┐
│ Server List  │ Dashboard / Editor         │
│              │                             │
│              ├─────────────────────────────┤
│              │ Terminal / Logs             │
└──────────────┴─────────────────────────────┘
```

---

## cmdk

```bash
pnpm add cmdk
```

Recommended shortcuts:

- Start Server
- Stop Server
- Open Logs
- Create Backup
- Open Settings

---

## sonner

```bash
pnpm add sonner
```

Great for:

- success messages
- error messages
- backup progress
- server status

---

# Data Fetching

## React Query

```bash
pnpm add @tanstack/react-query
```

Recommended for:

- Modrinth API
- Hangar API
- Java runtime metadata
- server status polling

---

## React Virtual

```bash
pnpm add @tanstack/react-virtual
```

Useful for:

- logs
- plugin lists
- backup lists
- file trees

---

# Forms

## react-hook-form + zod

```bash
pnpm add react-hook-form zod @hookform/resolvers
```

Recommended for:

- server creation
- settings
- proxy config
- server.properties editing

---

# Monaco Editor Enhancements

## monaco-yaml

```bash
pnpm add monaco-yaml yaml
```

Very useful for:

- Paper configs
- Purpur configs
- MythicMobs configs
- plugin configs

---

# xterm Addons

## Search Addon

```bash
pnpm add @xterm/addon-search
```

Useful for:

- ERROR search
- WARN search
- Exception search

---

## Web Links

```bash
pnpm add @xterm/addon-web-links
```

Makes URLs clickable.

---

# File Management

## react-dropzone

```bash
pnpm add react-dropzone
```

Useful for:

- drag-and-drop plugin installs
- world zip imports
- backup restore

---

# Recommended Rust Crates

## notify

```toml
notify = "6"
```

Useful for:

- file watching
- log watching
- plugin detection

---

## walkdir

```toml
walkdir = "2"
```

Useful for:

- directory scanning
- backup generation

---

## ignore

```toml
ignore = "0.4"
```

Useful for backup exclusions.

---

## semver

```toml
semver = "1"
```

Useful for:

- Minecraft versions
- Java versions
- plugin versions

---

## anyhow + thiserror

```toml
anyhow = "1"
thiserror = "2"
```

Strongly recommended for Rust error handling.

---

# Suggested Architecture

```txt
Tauri Plugins
  -> OS integration

Rust Backend
  -> process management
  -> backups
  -> downloads
  -> file watching

React Query
  -> async cache

Zustand
  -> UI state

React Hook Form + Zod
  -> forms

Radix + Tailwind + CVA
  -> UI system

Monaco + YAML
  -> config editing

xterm.js
  -> console system
```

---

# Final Recommended Install Set

```bash
pnpm add @tanstack/react-query @tanstack/react-virtual
pnpm add react-hook-form zod @hookform/resolvers
pnpm add sonner cmdk
pnpm add class-variance-authority clsx tailwind-merge
pnpm add react-resizable-panels
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add monaco-yaml yaml
pnpm add @xterm/addon-search @xterm/addon-web-links
pnpm add react-hotkeys-hook
```

Tauri:

```bash
pnpm add @tauri-apps/plugin-window-state
pnpm add @tauri-apps/plugin-global-shortcut
pnpm add @tauri-apps/plugin-clipboard-manager
pnpm add @tauri-apps/plugin-autostart
pnpm add @tauri-apps/plugin-deep-link
```

Rust:

```toml
notify = "6"
walkdir = "2"
ignore = "0.4"
which = "7"
semver = "1"
uuid = { version = "1", features = ["v4", "serde"] }
anyhow = "1"
thiserror = "2"
```
