# ADR-MAP-0010: Asset trust and resource limits

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Renderer assets are bound to an exact Minecraft release and content digest. Archive paths, duplicate entries, entry counts, expansion ratios, total uncompressed bytes, JSON depth, model inheritance and texture/atlas dimensions are validated under explicit limits before use.

## Consequences

Path traversal, zip bombs, cycles, oversized descriptors and cross-version cache reuse fail closed. Limits are named, justified, tested at limit and limit+1, and surfaced through redacted diagnostics. Missing textures never become a guessed successful material.
