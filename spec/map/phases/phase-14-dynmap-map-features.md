# Phase 14: Dynmap Map Features

## Goal

Extend the in-app map beyond terrain while keeping overlays independent from
the renderer and external Dynmap web/API compatibility.

## Scope

World/dimension layers, player tracking, persistent/custom markers and groups,
spawn/border, coordinate search, and optional chat/time/weather overlays.

## Owned files

Agent A: React controls/overlays. Agent B: Rust persistence, world metadata,
dimension/overlay events. Main updates comparison/ADR decisions.

## Dependencies

Phase 13 real Map UI, Phase 06 bridge, and marker research corpus.

## Implementation tasks

- add Overworld/Nether/End/custom dimension layer selection;
- persist markers safely under server ownership;
- add player following and interpolation separate from terrain tiles;
- add world border/spawn/search and overlay state with clear availability;
- document what is not compatible with Dynmap's external API.

## Focused tests

Dimension source, marker CRUD/path safety, player follow, border/search,
overlay lifecycle, and pause/remove behavior.

## Diff review checklist

No overlay data embedded into renderer assumptions, no marker path escape, and
no claim of external Dynmap API compatibility.

## Phase gate

Supported dimensions and overlay states work in a real Map session without
regressing terrain or lifecycle.

## Known non-goals

Public Dynmap web server/API and every third-party Dynmap extension.

## Follow-up phases

Phase 15 validates the complete Paper/Tauri path.
