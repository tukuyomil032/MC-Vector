# ADR-MAP-0001: Renderer scope and semantic source

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Dynmap v3.0 revision `93b454efb8802dc7406d6873434f2aeec5c636f4` is the semantic source of truth for the renderer dependency closure required by MC-Vector. Port the complete reachable renderer behavior, not a visual approximation or a selected “vertical slice.” If AST/reference analysis discovers a required upstream dependency outside the current vendored snapshot, add it to the pinned closure and its phase plan before implementation.

## Consequences

The current 106 Java files / 22,783 lines are only candidates, not a declared complete closure. The closure is complete only when P-000 proves it. MC-Vector-specific transport, cache, IPC, UI and lifecycle adapters may differ, but may not change renderer semantics without an explicit, source-supported ADR amendment.
