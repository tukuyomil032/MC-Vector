# ADR-MAP-0015: Viewport, continuous zoom and pan

**Status:** Accepted as an execution constraint. **Decision date:** 2026-09-23.

## Decision

Reintroduce viewport polish only after verified tile output and all target zoom geometry exist. During wheel/trackpad input, preserve a fractional preview zoom and anchor the cursor's world coordinate. Render the next integer target in the background and retain the prior verified layer until replacement is verified. Pointer release commits pan to canonical world center.

## Consequences

Zoom 0..8 limits, edge anchors, plus/minus controls, map layers, negative coordinates and adjacent tile requests share the same projection contract. Failed/empty target layers never blank the last valid map. Visual QA supplements, but does not replace, projection and tile reference tests.
