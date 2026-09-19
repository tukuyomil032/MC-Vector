# Phase 17: Tile System

## Goal

Replace synchronous or duplicate tile generation with a bounded, persistent,
viewport-first tile system that can support every later map type.

## Scope

Tile request coalescing, cancellation, priority, memory/disk cache, atomic
writes, stale tiles, dirty invalidation, zoom-out regeneration, and structured
tile diagnostics.

## Owned files

Main coordinates the final diff and evidence ledger; A/B fix only scoped
findings and review each other's changed diff.

## Dependencies

Phases 00–16 complete or explicitly recorded as blocked/open.

## Implementation tasks

- route visible, adjacent, player-nearby, and background requests through one
  scheduler;
- coalesce identical requests and prevent polling from re-submitting them;
- keep the last successful tile visible while a replacement renders;
- invalidate only tiles intersecting a changed chunk;
- write verified PNGs through temporary files and atomic rename;
- separate renderer, asset, world, and tile identity in every cache key;
- expose queue-full, empty, rendering, stale, and error states without hiding
  an existing tile.

## Focused tests

Focused scheduler/cache/invalidation tests and a focused Tauri command test.

## Evidence recorded on 2026-09-18

Earlier tile, Paper, and local build evidence remains useful as a baseline, but
it is not a Phase 17 completion claim. The current runtime still requires the
renderer-asset wiring, grouped tile-request, and real-data fixes before this
phase can pass.

## Diff review checklist

No dead declarations, no old preview fallback, no transparent-success state,
no hidden protocol mismatch, no missing attribution, and no unverified claim in
the release note.

## Phase gate

The tile system is ready for later renderer and UI phases only when the queue
does not duplicate requests, successful images survive restart, and failures
do not erase the last successful image.

## Known non-goals

This phase does not implement all block models, all map perspectives, or final
visual parity. It does not authorize push, PR, release, or external Dynmap
support.

## Follow-up phases

Dimensions and map types begin in Phase 18; final acceptance remains Phase 27.
