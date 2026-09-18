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

## Overlay contract

World overlays remain separate from tile rendering. Paper emits a protocol v2
`world_status` JSON Lines message containing a `worlds` array. Rust validates
the message and emits a server-scoped `map-world-status` event; React matches
each entry by dimension before displaying time/weather. A malformed status is
ignored with a diagnostic and never treated as successful map data.

World-border metadata is read from the Java Edition `level.dat` `Data` fields,
not from an invented nested compound. Missing or invalid fields produce no
border overlay and do not make world inspection fail.

Paper chat is an independent protocol v2 `chat_message` event. The Java
plugin enqueues the player UUID, display name, message text, and capture time
without performing world or socket work from the asynchronous chat callback.
Rust validates the message and its 16 KiB UTF-8 byte limit before emitting the
server-scoped `map-chat-message` event. React keeps a bounded recent overlay;
chat delivery is diagnostic/overlay data and never makes a tile request or a
bridge connection count as renderer readiness.
