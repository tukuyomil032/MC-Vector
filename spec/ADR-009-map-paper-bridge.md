# ADR-009: Paper Bridge

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Dynmap's platform adapters are large and version-specific. MC-Vector needs only
live observations and bounded loaded-chunk snapshots.

## Decision

Use an independent `JavaPlugin` with protocol v2 over authenticated loopback
TCP/JSON Lines. Java observes lifecycle, players, dirty hints, heartbeat, and
loaded snapshots. Rust owns rendering and Anvil reads. No synchronous network
I/O or forced chunk loading occurs on the Paper main thread.

## Consequences

The Java project remains smaller than Dynmap by design; parity complexity lives
in Rust/assets/tiles. Real Paper smoke is mandatory evidence.
