# ADR-MAP-0002: Host integration boundary

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Do not port Dynmap's Bukkit lifecycle, web server/UI, HTTP API, commands/permissions, database schema or storage backends. Reproduce the data and failure contracts those systems supplied to the renderer when MC-Vector needs them. Do not port third-party plugin/mod renderer implementations.

## Consequences

Paper may provide live chunk snapshots only. MC-Vector owns Tauri IPC, file/cache storage, scheduling and Map UI. Dynmap built-in renderers and the API surface required to express them remain in scope. Every exclusion must name its upstream caller/consumer and explain why its behavior cannot affect a rendered pixel or required integration contract.
