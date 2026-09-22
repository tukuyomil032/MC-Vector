# Map Renderer Definition of Done

The map renderer is complete only when all of these are true:

- the pinned Dynmap renderer closure has no unclassified required symbol or
  resource;
- every built-in renderer has a Rust destination, fixture, reference trace,
  and pixel golden;
- every version in `version-matrix.json` has verified client/server artifacts,
  Anvil input, Paper snapshot input, and acceptance evidence;
- saved and live inputs produce the same renderer-domain digest and output for
  equivalent chunks;
- reference intermediate traces and normalized RGBA pixels match;
- missing assets, malformed data, unsupported states, and unavailable live
  chunks remain explicit failures;
- failed or empty tiles are retryable and cannot become fresh successful cache;
- renderer code is isolated from the Tauri app until the verified pipeline is
  connected;
- `map-renderer-core` passes `cargo clippy -- -D warnings` without blanket
  dead-code allowances;
- Tauri IPC, cache, scheduler, Map UI, smooth zoom, pan, server stop, process
  exit, and port release are verified separately;
- the evidence ledger contains no unresolved required row.

The following are not completion evidence by themselves:

- a PNG file exists;
- coverage is non-zero;
- a bridge says connected;
- a Paper plugin says loaded;
- a mock test passes;
- the UI does not show an error.
