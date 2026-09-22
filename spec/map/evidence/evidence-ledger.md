# Map Renderer Evidence Ledger

Evidence is recorded separately by boundary. A passing build does not prove
renderer parity, and a passing mock does not prove real Tauri behavior.

| Evidence class | Required proof | Status |
| --- | --- | --- |
| Source closure | Every required Dynmap symbol/resource is classified and mapped | pending |
| Rust renderer | `map-renderer-core` focused tests and warning gate | pending |
| Version matrix | Every exact target version has verified artifacts | pending |
| Saved Anvil | Real fixture decode and terrain render | pending |
| Java reference | Pinned Dynmap intermediate and PNG capture | pending |
| Pixel parity | Trace and normalized RGBA comparison | pending |
| Paper bridge | Hello/heartbeat and loaded snapshot | pending |
| Saved/live parity | Equivalent input produces equivalent output | pending |
| Tile pipeline | Cache, stale, retry, failure, cancellation | pending |
| Tauri IPC | Real Rust command/event boundary | pending |
| Manual Map UI | Zoom, pan, old-layer retention, diagnostics | pending |
| Shutdown | Java exit and port `25565` release | pending |

No row may be marked verified without a command, fixture/artifact identity,
timestamp, commit, and result reference.
