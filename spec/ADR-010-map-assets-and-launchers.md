# ADR-010: Map Assets and Launchers

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Minecraft block appearance is defined by versioned client assets and resource
pack rules, not a small colour table.

## Decision

Resolve explicit or auto-detected user-owned client JAR/resource-pack sources,
record version/hash/pack order, and parse blockstates/models/textures in Rust.
Support PrismLauncher first and provide a manual picker. Do not bundle
Minecraft assets by default.

## Consequences

Missing/mismatched assets are explicit quality states. Cache identity changes
when asset identity changes. Distribution requires a separate asset/license
review.
