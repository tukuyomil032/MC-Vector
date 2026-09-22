# ADR-MAP-0006: Shared source-independent chunk domain

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Saved Anvil, Paper live snapshots and deterministic fixtures adapt to the same validated chunk/cache domain: block states/properties, section palettes, biome, height, sky/block light, coordinates, dimension/world identity, version profile and availability. The renderer does not branch on source kind.

## Consequences

Missing, unloaded, partial, malformed, valid-empty and unavailable are distinct typed states. Equal normalized chunk content from two adapters must produce equal domain digest and renderer output. Source provenance belongs in diagnostics, not in pixel-selection behavior.
