## Exact legacy terrain texture resource consumers

This subsection scopes only the standard resource-pack files named by the pinned `TexturePack.terrain_rp_map`; it does not claim that the remaining `assets/minecraft/textures/**` tree is unused.

| Pinned symbol | Source span | Required behavior recorded for P-014 |
|---|---|---|
| `field:type:org.dynmap.hdmap.TexturePack#terrain_rp_map` | `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java:280-316` | Preserve each numeric legacy terrain slot, `null` slot, and duplicate name exactly. |
| `method:type:org.dynmap.hdmap.TexturePack#getRPFileName(int)` | `TexturePack.java:360-365` | For each non-null in-range name, construct exactly `assets/minecraft/textures/blocks/<name>.png`. |
| `method:type:org.dynmap.hdmap.TexturePack#resetFiles()` | `TexturePack.java:368-401` | Register each generated path as a 1×1 `GRID` file and mark its slot as used. |
| `constructor:type:org.dynmap.hdmap.TexturePack#%3cinit%3e(DynmapCore,String)` | `TexturePack.java:626-793` | Open each used dynamic file with the loader, decode it, then initialize terrain slots and their native scale. |
| `method:type:org.dynmap.hdmap.TexturePack#loadImage(InputStream,int,String,String)` | `TexturePack.java:1250-1294` | Preserve image decode, dimensions, and failure behavior; do not synthesize a replacement color on failure. |
| `method:type:org.dynmap.hdmap.TexturePack#loadTerrain(boolean)` | `TexturePack.java:1139-1247` | Determine native scale from the first available mapped file and populate only registered legacy slots. |
| `method:type:org.dynmap.hdmap.TexturePack#findOrAddDynamicTileFile(String,String,int,int,TileFileFormat,String%5b%5d)` | `TexturePack.java:2986-3083` | Preserve filename identity, format, dimensions, tile-to-dynamic mapping, and duplicate-path reuse. |
| `method:type:org.dynmap.hdmap.TexturePackLoader#openTPResource(String)` | `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java:56-58` | Preserve the no-mod resource lookup entry point. |
| `method:type:org.dynmap.hdmap.TexturePackLoader#openModTPResource(String,String)` | `TexturePackLoader.java:60-123` | Preserve lookup order: selected ZIP/directory, platform `openResource`, optional mod container, then packaged standard resource. |

The full pinned AST initializer contains 267 slots, of which 225 are non-null and 224 resolve to distinct exact packaged paths (the `portal` name is repeated). An inventory-driven materializer must parse that initializer from the pinned AST, build the exact paths, require every path and digest in the pinned resource inventory, and refuse to rewrite a separately reviewed disposition. It may not infer names from the filename catalog, normalize singular `block/` to plural `blocks/`, or classify sibling files by directory membership.

For each of the 224 distinct paths, the resource ledger binds:

- consumer IDs listed above and owner `P-014` / `phases/phase-014-texture-pack-and-atlas.md`;
- `FIX-LEGACY-RP-TERRAIN-<first-20-hex-of-SHA256(sourcePath)>`, using the exact pinned path and digest, slot index, resource winner, decoded dimensions, and resulting terrain slot;
- `REF-LEGACY-RP-TERRAIN-<same-id>`, capturing the pinned-Java lookup path, source winner, native texture scale, slot mapping, and sampled RGBA;
- `TEST-LEGACY-RP-TERRAIN-<same-id>`, checking path construction and successful/absent/malformed image behavior for that exact resource;
- `SRC-DYNMAP-LEGACY-RP-TERRAIN-MAPPING` plus `PLAN-LEGACY-RP-TERRAIN-<same-id>`.

Fixture metadata records hashes rather than copying unverified third-party bytes into the repository. A test may obtain the exact pinned resource from a temporary, revision-verified checkout. A missing or corrupt resource is a structured failure, never guessed color, blank-success texture, or silently shifted legacy slot. Resource license and redistribution status remain unverified until P-003 completes; the candidate materializer must not change `licenseStatus` or `classificationComplete`.

The catalog assignment is only direct-consumer evidence for these 224 paths. It does not close CTM, dynamic texture-set, model, colorscheme, platform, per-version client-JAR, resource license, or global resource closure. Those remain separately owned by their source/resource/version phases.
