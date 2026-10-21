## Exact color-scheme resource set and per-resource plans

The pinned inventory contains these 12 selectable/base files. Each file is opened directly or is reachable through the configured `DefaultHDShader` scheme name; this is a source reachability statement, not a redistribution grant.

| Exact resource path | Role in load order |
|---|---|
| `DynmapCore/src/main/resources/extracted/colorschemes/amidst.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/biome_rainfall_temp.txt` | first/base table |
| `DynmapCore/src/main/resources/extracted/colorschemes/default.txt` | second/default table and default selected scheme |
| `DynmapCore/src/main/resources/extracted/colorschemes/dokudark.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/dokuhigh.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/dokulight.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/flames.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/misa.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/ovocean.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/sk89q.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/sphax.txt` | selectable scheme input |
| `DynmapCore/src/main/resources/extracted/colorschemes/standard.txt` | selectable scheme input |

Per-blob copyright/license inspection remains P-003 work. Do not copy any of these bytes into an MC-Vector bundle while `licenseStatus` is unverified.

## Source-derived fixture and capture schema

For each path-derived `FIX-RES-COLORSCHEME-<path digest>` / `REF-RES-COLORSCHEME-<path digest>` pair, capture the exact input bytes digest, selected scheme, all three file-open results and order, parsed row/index tuples, override winner, interpolation inputs, resolved color-table digest, and downstream shader RGBA for a fixed block/biome sample. The Java reference must use identical input bytes, distinguish open/read/parse errors, and pin output JSON/PNG hashes before Rust comparison. `TEST-RES-COLORSCHEME-<path digest>` covers malformed lines, out-of-range indices, missing preset/default table, and duplicate override precedence.

## Exact packaged grass/foliage colormap texture resources

The AST-pinned constants are `field:type:org.dynmap.hdmap.TexturePack#GRASSCOLOR_RP_PNG` at `TexturePack.java:70` and `field:type:org.dynmap.hdmap.TexturePack#FOLIAGECOLOR_RP_PNG` at `:72`; their exact initializer paths are `assets/minecraft/textures/colormap/grass.png` and `assets/minecraft/textures/colormap/foliage.png`. The inventory has exactly these two matching packaged blobs. The runtime constructor at `TexturePack.java:626-793` explicitly opens the names through the two-name `TexturePackLoader.openTPResource` path and sends decoded images to `loadBiomeShadingImage` (`TexturePack.java:1364-1396`). The actual fallback filename choice and resulting biome sample must follow the pinned caller order; these packaged PNGs are only the selected primary paths.

Each of the two exact paths is assigned to P-016 with `FIX-LEGACY-BIOME-COLORMAP-<first-20-hex-of-SHA256(sourcePath)>`, `REF-LEGACY-BIOME-COLORMAP-<same-id>`, and `TEST-LEGACY-BIOME-COLORMAP-<same-id>`. Capture selected path, source precedence/winner, byte digest, image dimensions, decoded lookup coordinate, loaded color sample, and final per-biome multiplier output. Missing/corrupt primary and alternate files remain distinct failures. License and global resource closure stay open; no image bytes are copied into fixtures before per-resource license review.
