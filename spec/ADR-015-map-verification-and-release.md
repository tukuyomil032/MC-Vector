# ADR-015: Map Verification and Release

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Builds, mock tests, real Paper, real Tauri, golden images, and license review
prove different claims and cannot be collapsed into one green check. The
product target is the complete in-app map capability, while Dynmap's embedded
web/API and unrelated server integrations are explicitly excluded.

## Decision

Use Phase 0-27 gates, separate local/full/real evidence, and never dispatch
remote workflows or publish derived assets without explicit authorization.
Full review is performed at subsystem boundaries, not after every small diff.
Release requires Paper 1.21.10, real Tauri, golden fixtures, all declared map
types, CI, and attribution evidence, or an explicit open-gate report.

## Consequences

“Implemented” and “verified” stay distinct in phase reports. A selected asset
path, a transparent PNG, or a passing Paper hello is not renderer parity. Future
scope must be added as a new phase/ADR.
