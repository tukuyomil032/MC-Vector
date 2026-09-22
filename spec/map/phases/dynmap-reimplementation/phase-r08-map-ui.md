# R08: Map UI, Pan, and Smooth Zoom

## Goal

Restore the Map view only after backend terrain output is proven, including
Google Maps-style cursor-anchored zoom and committed pan.

## Dependencies

R07.

## Owned files

- `src/map/api/map-commands.ts`
- `src/map/components/MapView.tsx`
- `src/map/state/map-types.ts`
- `src/map/state/map-viewport-interaction.ts`
- `src/map/styles/map-view.css`
- frontend map tests

## Implementation tasks

- display renderer/source state separately from Core bridge state;
- keep the old valid tile layer during target tile generation;
- maintain fractional preview zoom and cursor world anchor;
- commit pointerup pan to the formal map center;
- pass the committed world center into tile requests;
- switch layers only after target tiles contain verified terrain;
- format fractional zoom values without IEEE-754 noise;
- prevent Map consent from becoming enabled from bridge-connected-only state.

## Focused checks

- project/unproject round trips for every supported map type;
- cursor anchor at center and viewport edges;
- zoom 8 through 0 with old-layer retention;
- pan followed by re-render and re-zoom;
- empty/error target layer retains old layer;
- event listener cleanup and redacted error rendering.

## Gate

The real Map screen displays verified terrain, preserves the viewed location
during zoom/pan, and never replaces valid terrain with a blank layer while a
replacement render is pending or failed.
