# ADR-MAP-0008: Missing, unsupported and malformed data

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Never convert missing assets, unknown block states, unsupported versions, unloaded chunks, unavailable snapshots, malformed input, renderer errors or cancellation into guessed colors, air, transparent-success tiles or “no terrain.” Preserve distinct stable failure codes and retryability where appropriate.

## Consequences

Empty terrain is a positive, evidence-backed statement about a valid requested region. It is not a generic fallback for decode, reference, model, bridge or cache failure. Any unsupported required behavior blocks the relevant phase and final Goal.
