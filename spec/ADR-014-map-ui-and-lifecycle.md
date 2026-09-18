# ADR-014: Map UI and Lifecycle

- Status: Accepted for implementation
- Date: 2026-09-18

## Context

The UI previously treated status failures and transparent tiles as a green
success preview and mixed Map lifecycle with ordinary PluginBrowser behavior.

## Decision

Map owns explicit component, bridge, asset, world, tile, and render states. It
requests tiles only after status/configuration is confirmed, displays repair and
failure reasons, keeps stale tiles visible, and leaves managed plugin files out
of PluginBrowser. Pause, restore, and destructive removal remain distinct.

## Consequences

React tests must cover error states and listener cleanup. A connected bridge
alone is never sufficient to enable rendering.
