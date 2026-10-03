# ADR-MAP-0011: Built-in renderer and CustomRenderer coverage

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Every built-in renderer discovered in the pinned source closure is required, with one dedicated phase per class and additional method-group pages where class complexity requires them. Reproduce the necessary `CustomRenderer`, `MapDataContext`, `RenderPatch` and factory contracts used by those built-ins. Do not port independent third-party mod/plugin renderer implementations.

## Consequences

The existing 39-class list is a baseline candidate inventory, not proof of complete built-in closure. Each class needs registration, all source branches/property combinations, fixtures, Java trace and fixed pixel evidence. A family-level test cannot close an individual class.
