# ADR-MAP-0009: License, attribution and provenance

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Retain the pinned Dynmap Apache-2.0 license and required notices. Track origin/revision/path/hash and Rust destination for every translated or reference-only module. Decide redistribution separately for Dynmap resources, Minecraft assets, mod assets and captured fixtures; do not bundle assets without a documented right to redistribute them.

## Consequences

Rust translations must be traceable and identified as translations, not disguised as original upstream files. Release packaging excludes Dynmap host systems and user-owned Minecraft assets. Any unresolved provenance or licensing question blocks distribution of the affected material and is recorded explicitly.
