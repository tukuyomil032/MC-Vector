# MC-Vector Map Integration Requirements

Status: Draft implementation contract

This document defines the first-party map integration between MC-Vector and a
Paper 1.21.x server. It intentionally does not depend on Dynmap. Dynmap is a
useful UX reference, but its terrain renderer and server adapters are not a
generic renderer service that MC-Vector can safely embed without making Dynmap
a product dependency.

## 1. Product boundary

MC-Vector Map is an opt-in, per-server feature. It is made of two managed
components:

1. `MC-Vector Core`, a lightweight Paper plugin installed in the server's
   `plugins` directory.
2. A Rust runtime inside the Tauri process that owns the local bridge,
   world-file reads, tile generation, and cache.

The plugin observes server-side events and sends hints. It must not render
terrain, scan the world, expose an HTTP server, mutate world files, or execute
game operations received from MC-Vector.

The first release targets Paper 1.21.x only. The Java event contract should
remain Bukkit-compatible where practical so that Spigot support can be added
later, but Spigot is not part of the first compatibility guarantee.

## 2. User consent and lifecycle

The persisted server setting is separate from the observed component and
bridge states. Older server records without `map` are treated as undecided.

```text
MapConsent       = undecided | enabled | disabled
MapComponent     = absent | active | paused | waiting_restart | remove_pending | conflict
MapBridge        = not_applicable | connecting | connected | disconnected | incompatible | error
```

### 2.1 Initial state

- New servers start with `MapConsent=undecided`.
- The server creation flow shows an MC-Vector Map confirmation dialog after
  the server record has been created.
- The dialog explains that a normal Paper plugin is placed in `plugins`, that
  player observations and change hints stay on the same machine, that no
  public web server is opened, and that restart may be required.
- Choosing `Enable Map` persists `MapConsent=enabled` and exposes the Map tab.
- Choosing `Not now` persists `MapConsent=disabled` and keeps the Map tab
  hidden. The feature remains available from General Settings.
- Imported and existing servers are never modified automatically. They remain
  undecided until the user explicitly enables the feature.

### 2.2 Pause and restore

Pause is reversible and does not revoke the user's Map consent.

- The managed file `plugins/mc-vector-core.jar` is renamed to
  `plugins/mc-vector-core.jar.disabled`.
- The running Java plugin is not forcibly unloaded. The next server start is
  the point at which the rename is fully reflected by Paper.
- The Map tab remains visible and reports `paused` or `waiting_restart`.
- Bridge communication is closed before a running server is paused.
- Restore reverses the rename only when the managed artifact identity is known.
- An unknown same-named file is never overwritten.

### 2.3 Full removal

Removal is a separate destructive action.

- MC-Vector never stops a running server automatically for removal.
- A running server produces `remove_pending` until it is stopped.
- Once stopped, only the managed JAR, managed bridge configuration, and managed
  metadata are removed.
- Unknown files in `plugins` and user-created files are preserved.
- The Map tab remains until removal has completed successfully. It is hidden
  only after the managed component is absent and the consent is set to
  `disabled`.
- Cancel changes nothing.

## 3. Paper plugin contract

`MC-Vector Core` uses the conventional `plugin.yml` and `JavaPlugin` entry
point for the first release. The Paper plugin identifier is
`MC-Vector-Core`: Paper rejects spaces in the machine-facing `name` field, so
the UI and documentation use the human-facing name `MC-Vector Core`. The
experimental Paper-only plugin descriptor is not required for this
integration.

The plugin is limited to:

- a hello handshake containing protocol, plugin, Minecraft, Paper, server ID,
  capabilities, and an authentication token;
- immediate join and quit notifications;
- a coalesced player snapshot at a default one-second interval;
- dirty chunk hints;
- a heartbeat;
- bounded requests for already-loaded `ChunkSnapshot` surface data;
- background reconnect with bounded exponential backoff.

The plugin must not perform synchronous network I/O on the Paper main thread.
It must tolerate an unavailable Rust listener and continue the game server
normally. It must also tolerate the Rust process disappearing after a
successful handshake.

The plugin is hidden from MC-Vector's ordinary PluginBrowser by managed path
and artifact identity. It is not hidden from Paper's own `/plugins` output and
MC-Vector does not unregister or tamper with Paper's plugin manager.

## 4. Local bridge protocol

Each enabled server has a loopback-only TCP listener on `127.0.0.1`. A stable
per-server port may be reused after an app restart. The authentication token
is random per server and must never be written to normal logs.

Transport framing is UTF-8 JSON Lines: one complete JSON object per line, with
a maximum accepted line size of 1 MiB. Protocol version 2 is bidirectional
after the handshake: Java sends observations and Rust may request bounded live
surface snapshots. Neither side exposes this socket outside `127.0.0.1`.

### 4.1 Hello

```json
{
  "protocolVersion": 2,
  "type": "hello",
  "serverId": "server-identifier",
  "pluginVersion": "0.1.0",
  "minecraftVersion": "1.21.x",
  "paperVersion": "paper-version",
  "capabilities": ["player_snapshot", "chunk_dirty", "chunk_surface_snapshot_v1"],
  "token": "redacted-in-logs"
}
```

The token is transported in the hello message for the first protocol version.
The Rust side validates server ID, token, and protocol before accepting any
other application message.

The Rust listener replies before closing a rejected handshake. A successful
response is:

```json
{"type":"hello_ack","accepted":true,"protocolVersion":2}
```

A rejected response contains only a stable non-sensitive reason code:

```json
{"type":"hello_ack","accepted":false,"reason":"authentication_failed"}
```

The supported reason codes are `invalid_hello`, `protocol_mismatch`,
`server_mismatch`, and `authentication_failed`. Raw validation errors and
authentication tokens are never included in the response.

### 4.2 Messages

```text
hello
heartbeat
player_snapshot
player_joined
player_quit
chunk_dirty
chunk_snapshot_request
chunk_snapshot
chunk_snapshot_unavailable
```

Player records contain:

```text
playerId, name, dimension, x, y, z, yaw, pitch, capturedAt
```

`player_snapshot` contains the latest value for each player. It is a snapshot,
not an append-only movement log. The Java-side queue is bounded and coalesces
old values for the same player.

`chunk_dirty` is only a read-again hint. Rust must still verify region-file
timestamps and retry reads because Paper events do not guarantee complete
coverage of every world mutation.

Rust can request one already-loaded chunk surface at a time:

```json
{
  "type": "chunk_snapshot_request",
  "requestId": "request-id",
  "dimension": "minecraft:overworld",
  "chunkX": 12,
  "chunkZ": -4,
  "preferLive": true
}
```

Paper processes at most one request per tick and caps the pending request queue
at 128. It checks `World#isChunkLoaded` before reading a snapshot and never
generates a chunk for Map. The response contains a bounded, deflate-compressed
surface payload with block states, biome keys, light values, and at most 16
layers per column. If the chunk is not loaded, the response is
`chunk_snapshot_unavailable` with `reason=not_loaded`.

## 5. World reads and tile contract

The Rust side reads Java Edition Anvil region files and NBT. The renderer uses
`fastanvil` for region framing and complete chunk access, with the 1.21.x
fixture serving as the compatibility gate. Live Paper snapshots are preferred
for the requested center chunk, followed by cached live data, saved Anvil data,
and finally the last successful tile or an explicit degraded state.

Minecraft blockstates, models, and textures are loaded from a user-selected
client JAR/resource pack or a detected 1.21.x client JAR. The asset identity is
stored as a SHA-256 value and is part of the tile key. Missing assets never
turn into the old green grid: the UI reports `missing`, `invalid`, or
`fallback` quality explicitly.

The first renderer is an Overworld-focused, top-down 2D renderer:

- standard XYZ tile addressing;
- 256 x 256 pixel PNG tiles;
- viewport-first generation;
- bounded, deduplicating generation queue;
- last-known-good tile retained while a replacement is generated;
- changed chunks invalidate only intersecting tiles;
- no full-world scan immediately after enablement.

Tile cache keys include:

```text
serverId / worldId / minecraftVersion / assetVersion / zoom / tileX / tileY
```

The implementation additionally includes the renderer version. Successful PNG
tiles are written under `map-cache/<server>/<world>/<minecraft-version>/...`
through a temporary file followed by an atomic rename. A dirty chunk removes
only cached tiles whose block range intersects that chunk.

Unknown block states use a shaded fallback instead of aborting the complete
tile. The renderer is tolerant of missing or unreadable chunks and surfaces
tile errors to the UI. Region timestamp checks, bounded retries, and a full
last-known-good replacement queue remain release-gate work for the exact Paper
fixture; the current path already preserves successful disk tiles and does not
synchronously scan the whole world after enablement.

The Map tab uses Tauri binary responses for PNG tiles and structured events for
status, players, invalidations, progress, and errors. Large image byte arrays
must not be embedded in JSON state.

## 6. UI contract

The Map tab is shown only for a server with `MapConsent=enabled`. It remains
shown while the managed component is paused or awaiting a restart, so that the
user can restore it and understand why the map is unavailable.

The view contains:

- a map surface with pan and zoom controls;
- real PNG terrain tiles when saved or live chunk data is available;
- current-player markers with short interpolation between snapshots;
- a recenter-on-player action;
- tile loading and stale-tile indicators;
- a management panel showing component identity, compatibility, bridge state,
  last heartbeat, and restart requirements;
- pause, restore, and full removal actions.

The ordinary PluginBrowser excludes both `mc-vector-core.jar` and
`mc-vector-core.jar.disabled` when the artifact is managed by MC-Vector. The
Map management panel explains that Paper still sees it as a normal plugin.

## 7. Failure behavior

| Failure | Required behavior |
| --- | --- |
| Rust listener cannot bind | Keep the Paper server start path usable; show bridge `error` or `disconnected`. |
| Paper starts without Rust listener | Continue reconnecting with backoff; never stop the server. |
| Invalid token/server ID | Reject the connection and record a redacted diagnostic. |
| Unsupported protocol/Paper version | Keep the server running; show `incompatible`; do not render as connected. |
| Region write in progress | Retry; keep the last good tile. |
| Unknown block/NBT tag | Ignore where safe and use renderer fallback. |
| Unknown same-named plugin JAR | Do not overwrite, rename, or delete it. |
| Removal requested while running | Keep Map management visible as `remove_pending`; do not auto-stop. |
| Bridge process crash | Keep the server running and reconnect when possible. |

## 8. Test gates

The following evidence is kept separate:

1. Rust unit tests for protocol validation, live payload decoding, coalescing,
   path safety, disk cache atomicity, cache invalidation, tile coordinates, and
   region retry behavior.
2. Java tests or a Paper fixture for non-blocking startup, reconnect, bounded
   queues, and `.jar.disabled` behavior.
3. Integration tests for lifecycle transitions, unknown artifact protection,
   and app restart reconnection.
4. React tests for consent, visibility, management states, marker rendering,
   stale tiles, and accessibility.
5. `bun run build`, Rust formatting/tests, a real Paper 1.21.x startup check,
   and manual Map interaction checks. The current Paper smoke gate verifies
   protocol v2, live loaded/unloaded snapshot responses, offline startup, and
   `.jar.disabled` behavior.

Passing a build or a mocked test does not claim that a real Paper JAR was
loaded. The real-server gate remains explicit.

## 9. Roadmap

### Phase 1

Paper 1.21.x, consent and lifecycle management, Overworld surface map, on-
demand viewport tiles, user-selected or auto-detected asset input, textured
fallback rendering, cache and dirty invalidation, player snapshots, bridge
state, pause/restore/removal, and Japanese/English UI.

### Phase 2

Nether, End, world switching, coordinate search, player following, spawn and
border markers, simple block markers, resource-pack stacking, caves, and more
faithful height/light/water rendering.

### Phase 3

Persistent/custom marker groups, chat and server event layers, time/weather,
map generation controls, tile history, detailed layers, and additional server
implementations.

## 10. Open release gates

- Verify the exact Paper 1.21.x fixture shape against the development
  `fastanvil`/`fastnbt` integration before calling those dependencies release
  supported.
- Produce and load the Java plugin JAR on a real Paper server.
- Confirm the `.jar.disabled` naming behavior on the supported Paper build.
- Decide how Minecraft textures/models are obtained or supplied without
  violating the applicable Minecraft Usage Guidelines.
- Measure tile generation latency and memory before adding extra renderer
  processes or Go.
