# ADR-MAP-0012: Paper live snapshot provider

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Paper plugin responsibilities are limited to version-specific hello/heartbeat and chunk snapshot request/response, loaded-state reporting and explicit unavailable reasons. All model resolution and terrain rendering remain in Rust.

## Consequences

Validate request/server/world/dimension/version/chunk identity and response digest before adapting to the common domain. Bridge connected is not terrain-ready. `not_loaded`, queue full, timeout, invalid snapshot and world mismatch remain separate from valid generated-empty terrain. Each exact target Paper release requires a real provider acceptance record.
