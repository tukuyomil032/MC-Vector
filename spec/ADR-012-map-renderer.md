# ADR-012: Rust Iso Renderer

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

The current renderer's representative-colour/sparse-sampling path produced
empty or green-looking output and is not comparable to Dynmap HD.

## Decision

Implement a Rust `PerspectiveRenderer` based on selected Iso HD projection,
patch intersection, asset sampling, alpha/tint, lighting, and shader rules.
Return pixels together with provenance, coverage, unresolved counts, and state.

## Consequences

Renderer work is larger than the Java bridge. Paper remains lightweight and
must never receive NBT/model/PNG responsibilities.
