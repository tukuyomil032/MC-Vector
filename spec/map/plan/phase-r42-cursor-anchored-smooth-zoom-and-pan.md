# R42: Restore cursor-anchored smooth zoom and pan

## Purpose

Define the frontend viewport interaction contract used by the eventual verified terrain layer. Continuous preview zoom is kept separate from integer renderer targets, and pointer movement is committed to a world-coordinate center only after the drag ends.

## Scope

- Add pure projection and inverse-projection helpers for `WorldXZ` and `IsoProjected`.
- Clamp fractional preview zoom to `0..8` and round only the backend target zoom.
- Compute cursor anchors in world coordinates and derive a preview scale from rendered and preview zoom.
- Keep a rendered layer until an explicitly supplied target tile is ready.
- Convert pointer-up screen deltas into a committed world center.

## Deliberate non-goals

- This phase does not claim that any terrain tile exists.
- It does not call the renderer or fabricate a PNG while R40 remains blocked.
- It does not decide cache readiness, consent, or Paper bridge state.

## Verification

```bash
bun run check
bun run typecheck:tests
bun run test -- tests/map-viewport-interaction.test.ts
bun run build
git diff --check
```

Completion means the interaction math and layer-retention state machine are deterministic and tested. Real cursor anchoring remains pending until a verified terrain layer is connected.

## Commit

```text
feat: restore cursor anchored map zoom and pan
```
