# P-001: 全renderer resource consumer closure

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-001",
  "kind": "common",
  "document": "phases/phase-001-resource-closure.md",
  "dependsOn": [
    "P-000"
  ],
  "commitMessage": "chore: close dynmap renderer resource inventory"
}
```

## 目的と固定対象

- 対象source/symbol: all 3,673 pinned resource paths across every module, exact loader/consumer edges, Minecraft client JAR and resource-pack inputs。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: full resource path/hash inventory, per-path planned owner and consumer review, provenance/license decision, version scope, and fixture/reference/test plan。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: Any path/hash mismatch, unclassified resource, path-only exclusion, unresolved dynamic loader, guessed license, missing renderer consumer, missing per-path owner/fixture/reference/test, or unsafe archive size/zip-bomb behavior fails this phase.

## 実装作業

1. Re-enumerate every path from the exact pinned Git tree and verify byte length, blob SHA-1, and content SHA-256; reject missing or extra paths.
2. Use resolved AST edges plus reflection, registry, configuration, and dynamic path construction to identify exact consumers for texture maps/files, model mappings, CTM, color schemes, shaders, lighting, perspectives, templates, markers, platform bootstrap, and external renderdata.
3. For every path, record one final scope (renderer runtime, reference only, boundary adapter, or excluded); keep provisional candidates distinct from verified final dispositions until consumer closure and version policy are proven.
4. For renderer inputs, assign the resolver/version profile, selected-byte provenance, exact fixture ID, pre-captured Java reference ID, focused test ID, and evidence owner; for exclusions, attach caller/path evidence and a per-path rationale.
5. Audit all 188 non-core platform paths and all 77 legacy Forge 1.12.2 renderdata files individually; preserve generic custom mapping behavior even when a packaged legacy file is out of scope.
6. Inspect copyright, license headers, upstream provenance, and embedded asset origin for every resource before redistribution; unverified assets remain unavailable to bundles and fixtures.
7. Run the aggregate materializer from pinned inventory plus reviewed family manifests, then re-enumerate independently and compare exact path/hash sets.
## Pinned source evidence for direct consumers

- `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java:636-642` probes `pack.mcmeta`; `:1595-1747` loads texture mappings; `:1684-1690` scans `renderdata/*-texture.txt`; `:1829` defines `loadTileSetsFile`; `:1921-2533` loads texture files.
- `DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java:161-266` scans model resources and `renderdata/*-models.txt`; `:336-1206` parses model files.
- AST IDs: `method:type:org.dynmap.hdmap.TexturePack#loadTextureMapping(DynmapCore,ConfigurationNode)`, `method:type:org.dynmap.hdmap.TexturePack#loadTextureFile(InputStream,String,ConfigurationNode,DynmapCore,String)`, `method:type:org.dynmap.hdmap.HDBlockModels#loadModels(DynmapCore,ConfigurationNode)`, `method:type:org.dynmap.hdmap.HDBlockModels#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)`, and `method:type:org.dynmap.DynmapCore#createDefaultFileFromResource(String,File)`.
- `DynmapCore/src/main/resources/extracted/renderdata/README` identifies packaged renderdata as legacy mod mappings while allowing custom mappings separately. The 77 Forge 1.12.2 packaged mappings are outside the supported Minecraft 1.14+ policy; the generic external mapping parser remains in scope.
- `DynmapCore/src/main/java/org/dynmap/DynmapCore.java:2909-3074` (`updateExtractedFiles()`, caller at `:504`) enumerates `extracted/` JAR entries, routes `web/` under the web path or skips it when web updates are disabled, and writes other extracted files under the data folder. `updateStaticWebToStorage()` at `:2852-2907` (caller at `:512`) separately accepts `extracted/web/` and calls `defaultStorage.setStaticWebFile`. These are positive web-publication paths, not proof that every web resource is unreachable from renderer code. The 161 web rows remain provisional until full source/resource closure is checked.
- Root `LICENSE` alone does not prove every embedded texture, mapping, or platform resource is redistributable. Per-blob provenance must be reviewed before bundling or copying bytes into fixtures.

## Pinned resource population and required split

The pinned Git tree contains 3,673 resource paths. These 2026-09-23 counts are inventory evidence only; they do not prove final reachability, licensing, or scope.

| Pinned path family | Count | Required per-path decision |
|---|---:|---|
| `DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/**` | 3,190 | Compare each digest and logical resource ID with every supported exact client JAR. Resolve the matching user-selected/version-verified asset at runtime; do not bundle the upstream image bytes. If upstream bytes differ, preserve the difference as a parity input without redistributing the image. |
| `DynmapCore/src/main/resources/texturepacks/standard/terrain.png` | 1 | Trace legacy atlas consumers and compatibility branches before excluding it. |
| `DynmapCore/src/main/resources/extracted/texturepacks/standard/README` | 1 | Treat as documentation/provenance evidence, not a runtime texture. |
| `DynmapCore/src/main/resources/extracted/colorschemes/**` | 12 | Link to P-016: the configured `DefaultHDShader` scheme selects `<name>.txt`; `ColorScheme.getScheme/loadScheme` reads the base rainfall/temperature table, default table, then selected preset. Keep license and global closure open until independently verified. |
| `DynmapCore/src/main/resources/extracted/web/**` | 161 | Record the static-web publisher per path, but keep exclusion provisional until all Java consumers prove non-reachability from rasterization, model/texture lookup, and renderer configuration. |
| `DynmapCore/src/main/resources/markers/**` | 85 | Distinguish marker/UI output from terrain PNG output. If MC-Vector adds markers, assign a new Rust-owned layer/API rather than inheriting Dynmap web behavior. |
| `DynmapCore/src/main/resources/templates/**` | 21 | Trace template loading and prove whether any rasterization path consumes the template before excluding it as HTTP/web-only. |
| `DynmapCore/src/main/resources/extracted/renderdata/README` | 1 | Retain as evidence for the legacy mapping bundle and separately trace the generic external mapping loader. |
| `forge-1.12.2/src/main/resources/renderdata/**` | 77 | Inspect each mapping. The 1.12.2 packaged cohort is outside the 1.14+ product matrix, but custom mapping parsing/behavior remains in source scope. |
| DynmapCore root definitions/configuration (`char.png`, `core.yml`, lighting/model/perspective/shader/texture/world files) | 13 | Trace each file independently to its parser, selector, model/shader/perspective/lighting behavior, or evidence-backed exclusion. |
| Non-core platform resources excluding legacy renderdata (`fabric-*`, `forge-*`, `spigot`, helper modules) | 111 | Trace every file to its platform bootstrap/snapshot consumer. Paper-only adapter boundaries may exclude non-Paper bootstrap resources, not renderer definitions consumed by built-ins. |

The families sum to 3,673: 3,485 DynmapCore paths plus 188 platform paths. The 13 Core root files require individual rows. The texturepack README says additional/alternative packs can be placed in the data directory, while `TexturePack.java` probes `pack.mcmeta` and loads mappings/files; therefore image provenance must be reviewed separately from Dynmap-authored configuration.

## Source-verified standard texture-pack lookup behavior (2026-09-23)

The 3,190 paths under `texturepacks/standard/assets/minecraft/textures/` are a mixed inventory, not 3,190 proven terrain inputs. The pinned tree contains 3,093 PNG and 97 `.mcmeta` entries in this subtree. Its top-level path distribution is `block/` 1,174, `blocks/` 523, `colormap/` 2, `effect/` 1, `entity/` 477, `environment/` 6, `font/` 226, `gui/` 63, `item/` 457, `map/` 3, `misc/` 16, `mob_effect/` 32, `models/` 17, `painting/` 51, and `particle/` 142. These counts are inventory evidence only; do not assign a whole directory family to the renderer without a traced consumer.

The following pinned-source behavior is directly confirmed:

| Behavior | Pinned source and span | Consequence for the plan |
|---|---|---|
| Resource root | `DynmapCore/src/main/java/org/dynmap/hdmap/TexturePackLoader.java:23` (`texturepacks/standard`) | Packaged lookup prepends this root to the exact requested logical name. |
| Resource precedence | `TexturePackLoader.java:60-120` | Lookup is custom ZIP/directory, platform `openResource(modname, name)`, optional mod-container ZIP/directory when `modname` is non-null, then packaged standard resource. A Rust resolver must preserve the applicable order and record which source won. |
| Alternate-name behavior | `TexturePackLoader.java:47-54` | The alternate is attempted only when a caller explicitly passes it and the primary lookup misses; there is no general singular/plural path rewrite in this API. |
| Legacy vanilla terrain names | `TexturePack.java:280-316`, `:353-364` | The legacy maps construct exact `assets/minecraft/textures/blocks/<name>.png` and `textures/blocks/<name>.png` names for non-null entries. |
| Standard terrain registration | `TexturePack.java:368-395`, `:1139-1193` | `resetFiles` registers mapped legacy tile names and `loadTerrain` loads those registered image entries; this is not a recursive decode of every PNG under `assets/minecraft/textures/`. |
| CTM discovery | `CTMTexturePack.java:920-943` | Resource-pack mode scans ZIP/directory entries for `.properties` only under `assets/minecraft/mcpatcher/ctm/` and `assets/minecraft/optifine/ctm/`, sorting the selected paths before processing. |
| CTM property and referenced tile processing | `CTMTexturePack.java:992-1005` and `CTMProps#registerTiles` | Only selected property files are parsed, and their declared base/tile names are resolved through the configured texture path template; unrelated image files are not automatically CTM inputs. |

Important path distinction: the source explicitly constructs the plural `textures/blocks/` for these legacy terrain names and the CTM vanilla template. The pinned inventory separately contains singular `textures/block/` and plural `textures/blocks/` trees. Do not silently rewrite one into the other. P-001 must trace singular-path consumers independently across model, pack-format, CTM, and custom-pack handling; only then may each exact logical path be classified as required, adapter-only, or excluded.

Required closure procedure for this subtree:

1. For every exact path and content digest, record its logical resource identifier and whether it is opened directly, registered as a legacy tile, reached from a CTM property, referenced through model/texture metadata, or has no renderer-reachable consumer.
2. Trace every lookup caller, including fallback names, namespace construction, resource-pack version behavior, and precedence. Dynamic lookups must be resolved against the exact pinned code and concrete fixture/configuration inputs; directory membership alone is not a consumer edge.
3. For each required path, bind at least one version-specific fixture and Java reference observation to the lookup result and rendered output. For exclusions, record the source-wide non-reachability proof and the exact resource path/digest.
4. Preserve source provenance (user-selected pack, client JAR, mod/platform source, or bundled Dynmap definition) in diagnostics and parity records. A source path or matching filename is not sufficient to establish redistribution rights or version compatibility.

This section closes only the cited lookup facts; it does not close resource reachability, licensing, version compatibility, or the 3,190-path classification.

The same AST inventory also verifies two additional exact standard-pack lookups: `TexturePack.GRASSCOLOR_RP_PNG` → `assets/minecraft/textures/colormap/grass.png` and `TexturePack.FOLIAGECOLOR_RP_PNG` → `assets/minecraft/textures/colormap/foliage.png`. They are assigned to P-016 by `materialize-colormap-texture-resource-candidates.mjs`, independently of the 224 legacy terrain paths assigned to P-014. These two rows remain license-unverified and do not classify the rest of the texture tree.

## Color-scheme resource source chain

The 12 color-scheme paths are renderer-runtime candidates, not redistribution approvals. The chain is `DynmapCore#updateExtractedFiles()` → `ColorScheme#getColorSchemeDirectory(DynmapCore)` → `ColorScheme#getScheme(DynmapCore,String)` → `ColorScheme#loadScheme(DynmapCore,String)` → `DefaultHDShader#<init>(DynmapCore,ConfigurationNode)`. `loadScheme` opens the base rainfall/temperature table, the default table, and the selected preset in that order. Each row has path-derived fixture/reference/test plan IDs; license verification and global resource closure remain open.

## Per-path evidence plan keys

- `RES-FAMILY-MOJANG-ASSET-<sourcePathSha256>`: exact client-JAR logical path/digest comparison and no-redistribution policy.
- `RES-FAMILY-COLORSCHEME-<sourcePathSha256>`: parser/consumer path and output-affecting biome fixture.
- `RES-FAMILY-WEB-<sourcePathSha256>`: exact web consumer or renderer-nonreachability proof.
- `RES-FAMILY-MARKER-<sourcePathSha256>`: marker/UI consumer versus terrain-renderer consumer.
- `RES-FAMILY-TEMPLATE-<sourcePathSha256>`: loader and call-path proof.
- `RES-FAMILY-MOD-MAPPING-<sourcePathSha256>`: mapping parser, version policy, and per-file scope decision.
- `RES-FAMILY-PLATFORM-<sourcePathSha256>`: owning adapter and Paper-boundary proof.

These are planned evidence keys, not completed tests. P-001 remains open until every pinned path has an exact digest, consumer edge or per-path exclusion proof, owner, license/distribution status, and the required fixture/reference/test plan.

## Explicitly unresolved resource rows

The 2026-09-23 candidate integration records 58 exact pinned paths whose consumer/scope is not proven by the current source pass. They remain `scope: unclassified`; neither their path names nor their module directory may be used to guess renderer reachability. Each row is assigned to P-001 and carries a stable `resolutionWorkId` plus per-path fixture/reference/test IDs derived from the first 20 hexadecimal characters of `SHA-256(sourcePath)`:

```text
P001-UNRESOLVED-RESOURCE-<sourcePathSha256[0:20]>
FIX-P001-UNRESOLVED-RESOURCE-<sourcePathSha256[0:20]>
REF-P001-UNRESOLVED-RESOURCE-<sourcePathSha256[0:20]>
TEST-P001-UNRESOLVED-RESOURCE-<sourcePathSha256[0:20]>
```

For each such row, inspect the exact pinned bytes and every load/registration/call path. Then classify it as renderer runtime, versioned reference input, adapter boundary, or evidence-backed exclusion; record the concrete consumer or exclusion proof, license/distribution status, and reference fixture. Until that work is complete, `classificationComplete` and `consumerClosureComplete` must remain false where the ledger contains these rows. The plan-ownership gate may pass only when every unresolved row retains its exact source path/hash, P-001 owner, reason, and those deterministic verification IDs; this is not a resource-closure pass.

- 固定fixture / reference: FIX-RES-ALL-PATHS, FIX-RES-TEXTUREPACK-ROOTS, FIX-RES-DYNAMIC-RENDERDATA, FIX-RES-DEFINITION-FILES, FIX-RES-COLORSCHEME-LOAD-ORDER, FIX-RES-PACK-METADATA, FIX-RES-MISSING-CORRUPT-OVERSIZED, FIX-RES-THIRD-PARTY-LICENSE-BOUNDARY, and FIX-RES-PAPER-ONLY-PLATFORM-BOUNDARY.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: The independent pinned resource path/hash set exactly matches the plan ledger; every path has a scheduled, evidence-producing consumer/license/scope decision, and every renderer resource reaches a concrete resolver, version profile, fixture, Java reference, and focused test before the implementation phase begins.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
node spec/map/plan/tools/materialize-resource-inventory.mjs --source-root <pinned-source-root> --git-dir <pinned-git-dir> --check && node spec/map/plan/tools/materialize-resource-catalog-candidates.mjs --check && node spec/map/plan/tools/validate-plan-coverage.mjs && node --test spec/map/plan/tools/tests/test-materialize-resource-catalog-candidates.mjs spec/map/plan/tools/tests/test-materialize-colorscheme-resource-candidates.mjs spec/map/plan/tools/tests/test-materialize-web-resource-exclusion-candidates.mjs spec/map/plan/tools/tests/test-materialize-resource-disposition-candidates.mjs && git diff --check
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: close dynmap renderer resource inventory
```
