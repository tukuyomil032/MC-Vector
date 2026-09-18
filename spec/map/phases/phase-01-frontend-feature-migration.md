# Phase 01: Frontend Feature Migration

## Goal

Make `src/map/` the React-side feature boundary without changing Map behavior.

## Scope

Move Map components, hooks, API wrappers, types, state, tests, and styles from
scattered renderer/lib/style locations into `src/map/` and update imports.

## Owned files

Agent A: `src/map/**`, `src/App.tsx`, existing frontend Map imports/tests.

## Dependencies

Phase 00 contracts. Existing Tauri command/event names remain unchanged.

## Implementation tasks

- create `components`, `hooks`, `api`, `state`, and `styles`;
- preserve server-selection and Map tab visibility behavior;
- make event listener cleanup idempotent under HMR/StrictMode;
- remove stale imports and old duplicate Map modules after migration;
- report shared `package.json` or config changes instead of editing them directly.

## Focused tests

Affected React tests, TypeScript check, and a frontend build when practical.

## Diff review checklist

No behavior change, no duplicate Map API wrapper, no unhandled listener promise,
and no unused re-export.

## Phase gate

Affected tests and `bun run build` pass; all Map imports resolve from `src/map`.

## Known non-goals

No new renderer, asset parser, or Java protocol.

## Follow-up phases

Phase 2 moves the Java component into the same feature root.
