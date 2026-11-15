# Config schema format

Each `*.json` file in this folder describes one configuration file that a
Minecraft server generates. The Native editor uses them for completion, hover
documentation and validation. Keys and values are never translated; only `doc`
text is localized.

## File

```json
{
  "id": "paper-global",
  "title": "Paper global configuration",
  "format": "yaml",
  "files": ["config/paper-global.yml"],
  "software": ["paper", "leaf"],
  "since": "1.19",
  "until": null,
  "sources": ["https://docs.papermc.io/paper/reference/global-configuration"],
  "entries": [ ... ]
}
```

| Field | Meaning |
|---|---|
| `id` | Unique, kebab-case. Matches the file name (`paper-global.json`). |
| `title` | Short English name shown in the hover card header. |
| `format` | `properties`, `yaml`, `toml` or `json`. |
| `files` | Paths relative to the server folder, `/`-separated, matched exactly. |
| `software` | Server software ids that generate the file: `vanilla`, `paper`, `spigot`, `leaf`, `forge`, `fabric`. A file that every software writes (e.g. `server.properties`) lists all of them. |
| `since`, `until` | Minecraft versions the whole file exists in, inclusive. `null` means open-ended. Versions are compared numerically per component (`1.21.4` < `1.21.10` < `26.1`). |
| `sources` | URLs the data was taken from. At least one. |
| `entries` | Every key the file can contain. |

## Entry

```json
{
  "path": "chunk-loading-basic.player-max-chunk-load-rate",
  "type": "float",
  "default": 100.0,
  "min": -1,
  "max": null,
  "values": null,
  "since": "1.19",
  "until": null,
  "doc": { "en": "…", "ja": "…" }
}
```

| Field | Meaning |
|---|---|
| `path` | Dot-separated key path. For `properties` it is the key itself (it may contain dots and dashes, e.g. `rcon.port`; the whole key is one path). For `yaml`/`toml` each segment is one nesting level; a TOML table `[a.b]` is the prefix `a.b`. A segment that is any name chosen by the user is written `*` (e.g. `world-settings.*.verbose`). |
| `type` | `bool`, `int`, `float`, `string`, `enum`, `list`, `map` or `section`. `section` is a key whose value is a nested block. `list` and `map` describe simple collections the editor does not complete inside. |
| `default` | The value the server writes when it creates the file, or `null` when there is none. |
| `min`, `max` | Inclusive numeric bounds for `int`/`float`, or `null`. |
| `values` | For `enum`: every allowed value as written in the file. Optional for `string` when the documentation lists suggestions; those are completed but not enforced. |
| `since`, `until` | Minecraft versions the key exists in, inclusive, or `null`. |
| `doc.en` | One or two plain sentences from the official documentation, reworded where needed. No Markdown, no HTML. |
| `doc.ja` | The same meaning in natural Japanese (です・ます). Keep key names, values and units as written. |

### JSON list files

`ops.json`, `whitelist.json`, `banned-players.json` and `banned-ips.json` are
arrays of objects. Their entries use the path prefix `[]` for "each element",
e.g. `[].uuid`, `[].level`.

## Rules

- Only data from the cited sources. Do not invent keys, defaults or bounds; leave a field `null` when the source does not say.
- Keys that were renamed get one entry per name with matching `since`/`until`.
- Keep entries in the order the server writes them.
