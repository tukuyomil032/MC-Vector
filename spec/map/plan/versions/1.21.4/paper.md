# Minecraft 1.21.4 Paper snapshot adapter

## Status

`protocol_fixture_verified`; a real Paper 1.21.4 process, loaded snapshot,
queue behavior, reconnect behavior, and live renderer equivalence remain
pending.

## Adapter contract

- Minecraft version: `1.21.4`
- DataVersion: `4189`
- Protocol: `2`
- Rust adapter: `bridge::snapshots::v1_21_4`
- Shared output: `MapChunkCache`
- Provider responsibility: Paper snapshot only
- Renderer responsibility: Rust renderer only

The adapter checks request identity before decoding. It requires heightmap and
biome samples, validates section palettes and packed block-state capacity, and
expands nibble light arrays without supplying fixed fallback light.

## Evidence boundary

The current evidence is an in-memory protocol fixture. It proves the adapter's
conversion and failure semantics but does not prove Paper API serialization,
network transport, loaded chunk availability, or saved/live pixel parity.
