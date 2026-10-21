# 現行implementation/evidence台帳の監査

基準日: 2026-09-23。以下は計画開始時点の確認値や。数が載っていることと実装・parityの証拠は分ける。

## Full pinned-tree AST audit

- Pinned Git revision: `93b454efb8802dc7406d6873434f2aeec5c636f4`; verified Git tree: `632ec26b9f995c8c7acaf525325b359a8a996175`.
- Durable AST inventory: [`java-ast-inventory.json.gz`](../../coverage/java-ast-inventory.json.gz), compressed SHA-256 `9a628eda0b510cef5a17a6100107f792edfdd6df2944fa0286846c38f589dc3c`, decompressed canonical JSON SHA-256 `d2815e3b16042b01be9577d9a9e718f31e65bdf3ab5d7e0bb59c2c5cd292ab43`.
- Durable resource path inventory: [`pinned-resource-inventory.json.gz`](../../coverage/pinned-resource-inventory.json.gz), SHA-256 `169d460c2a9878ec8f89775121287805e345ef188abd1352abdc9c709003cdfa`; 3,673 tracked resource paths across all modules, each bound to Git blob SHA-1 and content SHA-256. Resource consumer closure/classification remains open.
- The materializers compare exact pinned Git path sets and verify every source blob before writing. Exact pinned-checkout, Java AST, AST materialization, and resource inventory commands are recorded in [P-000](../phases/phase-000-source-ast-closure.md) and [P-001](../phases/phase-001-resource-closure.md); they use a fresh temporary checkout rather than an assumed local source path.

  `java spec/map/plan/tools/DynmapAstInventory.java <pinned-source-root> <raw-ast.json> 93b454efb8802dc7406d6873434f2aeec5c636f4`

- Independent JDK javac syntax-only re-enumeration on 2026-09-23: 856/856 parsed files / 18,201 declarations / 296,914 reference candidates / 0 parse errors / 0 duplicate symbol IDs. The re-materialized canonical JSON matches the durable inventory; this is syntactic inventory only, reference candidates remain unresolved, and `semanticDependencyClosureComplete=false`.
- Current symbol-disposition ledger has 18,201 rows; 18,201 declarations exist, leaving 0 without a reviewed disposition. No full declaration scope classification or semantic call/dispatch closure exists yet.
- The 106-file / 22,783-line vendored candidate snapshot is not the full Java tree. It omits 750 Java files; no declaration-by-declaration scope classification, semantic call/dispatch closure, or per-symbol implementation owner exists yet.

## Renderer-root calibration (open)

- Reproducible candidate-only experiments: [`source-root-candidate-audit.json.gz`](../../coverage/source-root-candidate-audit.json.gz), SHA-256 `fc2bf37aaebf614970f6aac1e59c38464b1fe0881d91cc9911dbd320b04f93bc`. The whole-file seed deliberately includes every declaration in all 106 legacy candidate files; the symbol-root run starts from the listed source candidates. Neither run is a closed renderer-root algorithm.
- Whole-file seed result: 2,482 declarations seeded; 87,883 pinned declaration edges traversed; 2,894 declarations in 148 reached files, including 42 files outside the candidate map; 15,307 AST declarations not reached.
- Call-only symbol-root candidate result: 313 declarations in 58 files through method_call and constructor_call candidate edges with AST source and target declaration IDs only (855 traversed call edges). These reached methods expose 3,706 direct non-call reference edges to 801 distinct target declarations; they are reported separately and are not recursively traversed. This remains an open candidate because the graph does not expand virtual/interface dispatch, configuration/reflection registrations, external library implementations, dynamic resource lookup, or manual super/this dispatch.
- The experiment reaches explicit non-renderer review examples (type:org.dynmap.MapManager, type:org.dynmap.storage.MapStorage, type:org.dynmap.markers.impl.MarkerAPIImpl), proving whole-file seeding is over-inclusive. It also omits lexical bindings, dynamic strings, unresolved imports, manual super dispatch, external classpath behavior, and configuration/reflection registration not represented by pinned declaration edges. Therefore neither reached nor unreached is a scope disposition.
- Source-verified renderer/registration root candidates and exact pinned source spans are:

| Candidate symbol (not a closed root set) | Pinned source path | Lines |
| --- | --- | ---: |
| `method:type:org.dynmap.hdmap.HDMapTile#render(MapChunkCache,String)` | DynmapCore/src/main/java/org/dynmap/hdmap/HDMapTile.java | 96-99 |
| `method:type:org.dynmap.hdmap.HDPerspective#render(MapChunkCache,HDMapTile,String)` | DynmapCore/src/main/java/org/dynmap/hdmap/HDPerspective.java | 25-25 |
| `method:type:org.dynmap.hdmap.IsoHDPerspective#render(MapChunkCache,HDMapTile,String)` | DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java | 1250-1459 |
| `method:type:org.dynmap.hdmap.HDMapManager#loadHDPerspectives(DynmapCore)` | DynmapCore/src/main/java/org/dynmap/hdmap/HDMapManager.java | 54-81 |
| `method:type:org.dynmap.hdmap.HDMapManager#loadHDShaders(DynmapCore)` | DynmapCore/src/main/java/org/dynmap/hdmap/HDMapManager.java | 24-52 |
| `method:type:org.dynmap.hdmap.HDMapManager#loadHDLightings(DynmapCore)` | DynmapCore/src/main/java/org/dynmap/hdmap/HDMapManager.java | 83-108 |
| `method:type:org.dynmap.ConfigurationNode#createInstance(Class%3c%3f%3e%5b%5d,Object%5b%5d)` | DynmapCore/src/main/java/org/dynmap/ConfigurationNode.java | 334-356 |
| `method:type:org.dynmap.ConfigurationNode#createInstances(String,Class%3c%3f%3e%5b%5d,Object%5b%5d)` | DynmapCore/src/main/java/org/dynmap/ConfigurationNode.java | 358-368 |
| `method:type:org.dynmap.hdmap.HDBlockModels#loadModels(DynmapCore,ConfigurationNode)` | DynmapCore/src/main/java/org/dynmap/hdmap/HDBlockModels.java | 161-266 |
| `method:type:org.dynmap.hdmap.TexturePack#loadTextureMapping(DynmapCore,ConfigurationNode)` | DynmapCore/src/main/java/org/dynmap/hdmap/TexturePack.java | 1595-1747 |

  Perspective/shader/lighting/model registration continues through these paths, but the full root set must still be traced through actual configuration values, constructors, registration tables, and dynamic dispatch.
- P-000 remains open until the renderer entry-point/configuration roots and all call/data/registration/reflection/resource edges are source-reviewed, every AST declaration is classified with evidence, every external/boundary edge is justified, and independent re-enumeration finds no omitted renderer behavior. Do not convert this calibration result into a closed dependency ledger.

## Pinned Java source candidate catalog

- 106 files / 22,783 lines。現snapshotはDynmapCoreAPI renderer、DynmapCore hdmap/utilsの候補範囲であり、依存closure確定ではない。
- JSONの1,489 rowsには1,334件のmethod-kind候補があるが、Java regex抽出でif / switch / for / return等をmethodとして誤検出し、overloadも区別しない。AST authorityとして無効。
- 現行Rust destinationはcandidate hint。原典の全call/data/resource dependencyを調べてrequired、adapter-only、excludedを確定する。

## Resources / built-ins

- Pinned resource catalog 3673件: boundary-adapter=26, renderer-runtime=279, excluded=346, reference-only=2964, unclassified=58。Web 161件はsource-confirmed provisional exclusion candidates、color-scheme 12件は`DefaultHDShader`/`ColorScheme` load pathに紐づくrenderer-runtime candidatesや。いずれもlicense verificationとglobal consumer closureはopen。
- Exact AST/source mapping has identified 0 unique standard legacy terrain texture paths from 0 numeric mapping slots (0 non-null slots, including repeated names). These exact rows are assigned to P-014 with per-path fixture/reference/test plan IDs, but remain license-unverified and do not close other texture, CTM, model, or version-specific consumers.
- The 3,190 packaged `assets/minecraft/textures/**` paths are not all terrain inputs: the exact subtree contains 3,093 PNG and 97 `.mcmeta` entries across 15 top-level families. Pinned `TexturePackLoader` lookup is custom ZIP/directory → platform resource → optional mod container → packaged standard resource; caller-supplied alternate names are explicit, not singular/plural rewrites. `TexturePack` registers and loads the non-null legacy terrain filename maps, while resource-pack CTM scans only its two configured CTM prefixes for `.properties` and then resolves their declared tiles. The source builds plural `textures/blocks/` paths while the inventory also contains singular `textures/block/`; exact consumers still require per-path tracing. See [source-verified lookup evidence](../phase-details/phase-001-resource-closure.md); resource closure remains open.
- `materialize-resource-catalog-candidates.mjs` is the sole aggregate catalog generator. It composes per-family candidates with the full pinned inventory and must be run with the focused family tests; generated candidate assignment is not final scope/license proof.
- Vendored upstream snapshotには旧Core-only候補3,485 resourceのうち `shaders.txt` 1件しか実体がない。残り3,484 Core resource bytesと別moduleの188 resource bytesは現snapshotに含まれない。現在の3,673-path inventory/catalogはblob/content digestを保持するが、consumer/license/fixture evidenceを代替しない。
- Built-in renderer 39件。現catalogのtranslated表記はsource mapping statusに過ぎない。全entryでfixture/referenceTrace/pixelGolden/requiredAssetsが空なので、renderer parity未検証として扱う。

## Versions / reference / runtime

- Official release metadata 48件、1.14〜26.3。status counts: {"metadata_verified":48}。artifactStatus counts: {"not_downloaded":48}。公式URL/length/SHA-1 metadataがあってもJAR取得・SHA-256・adapter evidenceとは別。
- Mojang official manifest archive: [`mojang-version-manifest-2026-09-23.json.gz`](../../coverage/mojang-version-manifest-2026-09-23.json.gz), raw SHA-256 `6ea1a62a6df711ed21ae74696566b7407ec537ea363ed6eba85c13a1278f0b3f`, stable release-set `48`件。`validate-plan.mjs`が圧縮hash、raw hash/length、release-set hash、version matrixとのexact ID/URL/releaseTime equalityを検証する。
- Version delta ledger: [`version-delta-matrix.json`](../../coverage/version-delta-matrix.json), exact releases 48件。asset delta未verified 48件、saved-Anvil delta未verified 48件、Paper live未verified 48件。これらは現時点でpendingであり、48版対応の実証には数えない。
- Paper official project version listing snapshot (2026-09-23): 44 exact matrix IDs listed、4 exact IDs absent (1.16, 1.20.3, 1.21.2, 26.1). これはversion listingのみでbuild channel/build ID/JAR bytes/SHA-256を確認した証拠ではない。
- Anvil adapter matrix登録: 1.21.4 (4189)。1.21.4 decoder/合成region fixtureが存在しても、captured real world Anvil fixtureや全版parityを証明しない。
- Paper build/snapshot matrix登録 0件、版別referenceCapture 0件。Rust 1.21.4 snapshot decoderとprotocol fixtureは存在するが、real Paper plugin/provider通信は未証明。
- Reference harnessはBox/Cuboid/Pane/Plantのpatch trace fixtureを持つ。version-bound real chunk/assetsとreference PNG/pixel hashは未登録。
- real-acceptance-matrix.jsonはglobal blocked、per-version override 0件。per-version evidenceを後続phaseで明示化する。
- Tauri request_map_renderはrenderer_not_connectedを返し、実rendererへのpipeline接続がない。
