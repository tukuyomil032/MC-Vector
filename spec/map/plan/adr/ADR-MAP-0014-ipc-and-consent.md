# ADR-MAP-0014: IPC status and consent authority

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Tauri commands/events expose structured renderer/source/cache progress and stable redacted failures. Core artifact state, bridge state, selected client asset, renderer readiness and terrain availability are independent. Consent can be persisted only after the verified renderer/terrain contract returns an allowed active or waiting-restart state.

## Consequences

No success inferred from a config file, connected socket, selected client JAR, plugin load or nonempty PNG path. Never expose absolute paths, token, raw HTTP/server bodies or internal stack traces. Non-Map errors remain outside terrain diagnostics.
