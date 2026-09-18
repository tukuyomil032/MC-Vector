# MC-Vector Boundaries

## Feature layout

```text
src/map/
  components hooks api state styles   React Map feature
  paper/mc-vector-core                 Paper telemetry plugin
  dynmap/upstream                      selected source snapshots only

src-tauri/src/map/
  domain application bridge sources assets renderer tiles markers overlays
src-tauri/src/commands/map/             thin Tauri command adapters
```

`src/map` is the product feature root, not a frontend-only folder. Java is an
independent Gradle project and Dynmap source is never bundled by Vite. Rust is
the backend half of the same feature.

## Ownership

| Concern | Owner | Must not own |
| --- | --- | --- |
| Paper event observation | Java plugin | PNG/NBT/model rendering |
| Loopback protocol | Java + Rust bridge | UI assumptions |
| Source normalization | Rust sources/domain | Tauri command details |
| Asset/model resolution | Rust assets | Minecraft world mutation |
| Rendering | Rust renderer | Paper main thread |
| Queue/cache | Rust tiles | React request duplication |
| Map commands/events | Tauri command adapters | parsing/rendering implementation |
| Map controls and diagnostics | React feature | secret/token state |

## Security boundaries

- Every server path is validated against the managed server root.
- Bridge binds to `127.0.0.1` and authenticates per-server tokens.
- Tokens never enter normal logs, UI errors, or cache keys in plaintext.
- User asset paths are canonicalized and checked before opening.
- Minecraft assets are user input and are not silently bundled or redistributed.
- Dynmap source attribution and license artifacts ship with any derived code.

## Non-goals

This boundary does not make the MC-Vector plugin invisible to Paper, provide a
Dynmap-compatible public HTTP API, or promise identical output before the
golden-image gates pass.
