# ADR-008: Map Feature Boundary

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Map UI, Java bridge, Rust renderer, and Dynmap research were scattered across
`src/`, `bridge/`, and a large Rust command. That layout hid ownership and made
source/license review difficult.

## Decision

Use `src/map/` as the product feature root, `src/map/paper` for the independent
Gradle plugin, `src/map/dynmap/upstream` for selected source snapshots, and
`src-tauri/src/map` for Rust. Keep Tauri commands thin under
`src-tauri/src/commands/map`.

## Consequences

The root `bridge/` is temporary migration input and is removed only after
reference and gate checks. Vite never bundles Java or upstream source.
