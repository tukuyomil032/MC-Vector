# ADR-015: Map Verification and Release

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

Builds, mock tests, real Paper, real Tauri, golden images, and license review
prove different claims and cannot be collapsed into one green check.

## Decision

Use Phase 0-17 gates, separate local/full/real evidence, and never dispatch
remote workflows or publish derived assets without explicit authorization.
Release requires Paper 1.21.10, real Tauri, golden fixture, CI, and attribution
evidence, or an explicit open-gate report.

## Consequences

“Implemented” and “verified” stay distinct in phase reports. Future scope must
be added as a new phase/ADR.
