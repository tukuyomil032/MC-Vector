#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildPhaseGraph, phaseContractBlock, validatePhaseGraph } from './phase-graph.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const planRoot = resolve(scriptDir, '..');
const repoRoot = resolve(planRoot, '../../..');
const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const stageNames = ['assets', 'anvil', 'paper-snapshot', 'reference-and-parity', 'real-acceptance'];
const readJson = async (path) => JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
const slug = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const outputs = new Map();
const add = (path, value) => outputs.set(path, `${value.trimEnd()}\n`);
const link = (path, label) => `[${label}](${path})`;

const corePhases = [
  { n: '000', file: 'source-ast-closure', title: 'Pinned source AST と依存closure', depends: 'なし', source: 'pinned Dynmap Java source tree全体とrenderer-reachable call/data/resource dependencies', output: 'stable AST symbol ledger、call/data/resource edge、required/adapter-only/excluded分類、source-to-phase map', tasks: ['JDK Compiler Tree APIでclass/interface/enum/record、constructor、overloaded method signature、field、enum constant、annotation、source spanを全pinned Java sourceから収集する。', '実行入口をfile prefixやclass全体ではなくsymbol単位で固定する。pinned auditが示す`HDMapTile.render(MapChunkCache,String)` → perspective render dispatchと、`HDMapManager.loadHDPerspectives/loadHDShaders/loadHDLightings` → `ConfigurationNode.createInstance/createInstances`の設定登録経路を起点候補として行番号付きで記録し、実際の設定値・constructor・renderer登録表までsource traceしてroot集合を閉じる。', '既存106-file全宣言seed実験は過剰包含であり、root集合として採用しない。`source-root-candidate-audit.json.gz`のreachabilityをscope判定に転用せず、method call、field/type/data flow、override/interface dispatch、reflection/class-name/config registration、service/provider discovery、resource lookup/build/profile gatingをそれぞれedge種別と根拠付きでモデル化する。', 'method call、field/type参照、reflection/registry/resource lookupを抽出し、pinned source全体に加えて必要なexternal API/boundary契約を含むrenderer dependency graphを作る。unresolved referenceごとに解決または境界除外を理由付きで行う。', '初期candidate packageに限らずrenderer reachable dependencyを再帰追跡し、欠けたsource fileをsource snapshot、AST inventory、owner map、phase index、個別実装phaseへ追加する。', '各AST declarationとdependency edgeをrequired / adapter-only / excludedのいずれかへ個別分類し、excludedはrenderer出力へ影響しない理由、呼出元、代替MC-Vector境界を根拠付きで記録する。候補106ファイル内の全methodを一括でrequiredにしない。', 'regex由来lexical rowsをauthorityから外し、overloadを別IDにしたAST schemaで置き換える。独立したpinned-tree再列挙でsource/declaration/edge ID setの一致とclosure completenessを検査する。'], fixture: 'overload、nested/local/anonymous type、generic/annotation、constructor delegation、interface/override/super dispatch、configured reflection registration、service/provider discovery、dynamic resource lookup、external API adapter境界の小fixtureと全pinned Java file parse report。', fail: 'parse失敗、unresolved required call/data/dispatch/resource edge、未分類AST declaration/edge、未登録source file、誤ったroot、誤分類、重複symbol IDはphase failure。', command: 'node spec/map/plan/tools/audit-source-root-candidates.mjs --check && bun scripts/check-map-renderer-coverage.mjs --require-source-ast --require-closed-dependencies', gate: '全pinned Java declaration/reference/registration/resource edgeがAST台帳とdisposition ledgerへ1対1対応し、真のrenderer entrypointからの依存closureがsource/reference検査済みで閉じ、未分類が0。file-seed candidate auditはopen diagnosticとして残し、closure証拠と呼ばない。', commit: 'chore: close pinned dynmap renderer source inventory' },
  { n: '001', file: 'resource-closure', title: '全renderer resource consumer closure', depends: '000', source: 'pinned revision 93b454efb8802dc7406d6873434f2aeec5c636f4の全module resource blob、resource loader/consumer、versioned client JARとpack resource', output: '全pinned resource pathのblob/content digest、個別license/provenance、consumer edge、scope、owner phase、fixture/reference/test plan IDs', tasks: ['`materialize-resource-inventory.mjs`でGit treeの全resource pathを列挙し、全bytesをpinned blob IDと照合する。2026-09-23 auditでは3,673 pathsを確認済み。既存`resources.json`は3,485 DynmapCore candidatesのみで、188 platform-module pathsが欠落しているため、そのまま完全台帳として扱わない。', 'AST call/data/resource edgeと動的resource lookupを使い、`TexturePack.loadTextureMapping` / `loadTextureFile` / `loadTileSetsFile`、`HDBlockModels.loadModels` / `loadModelFile`、`DynmapCore.createDefaultFileFromResource`等の正確なconsumerへpathを結ぶ。static grepだけでconsumer closureを閉じない。', '全pathを`renderer-runtime` / `reference-only` / `boundary-adapter` / `excluded`へ一件ずつ分類する。excludedはMC-VectorのPaper-only境界または1.14以降のstable-release policyなど、source evidenceに基づく個別理由を持たせる。', '77件のForge 1.12.2 `renderdata/*-models.txt` / `*-texture.txt`はDynmap loaderが読むことを記録しつつ、対象version policy外である根拠を各resource rowに付ける。別途、rendererが`renderdata/`の外部定義を解釈するbehavior自体はrequired source/API coverageへ残す。', 'Fabric/Forge/Spigot moduleの188 omitted pathsを個別に照合する。configuration defaultsと`pack.mcmeta`はrenderer-visible設定/asset loader影響を検査し、mixins/access wideners/plugin metadata/permission examples/icon等はPaper-only product boundaryと実際のloader call pathで判定する。', 'root LICENSEだけを全resourceのlicense証明に流用しない。各resourceのcopyright/header/upstream attribution/embedded asset originを確認し、未確定licenseは明示的にunverifiedのままdistribution禁止としてP-003へ送る。', '各resource rowへexact consumer symbol IDs、resolver/profile、owner phase/document、fixture/reference/focused-test/evidence plan IDsを付与し、renderer-visible resourceはsource bytesからexpected parse/resolve behaviorを検証する。'], fixture: 'FIX-RES-ALL-PATHS (pinned tree equality); FIX-RES-TEXTUREPACK-ROOTS (client JAR vs asset-index provenance and duplicate path precedence); FIX-RES-DYNAMIC-RENDERDATA (models/texture mapping loader); FIX-RES-DEFINITION-FILES (configuration/shaders/lightings/perspectives/colorschemes); FIX-RES-PACK-METADATA; FIX-RES-MISSING-CORRUPT-OVERSIZED; FIX-RES-THIRD-PARTY-LICENSE-BOUNDARY; FIX-RES-PAPER-ONLY-PLATFORM-BOUNDARY.', fail: 'any resource path/hash mismatch, unclassified path, unsupported scope token, unresolved dynamic loader edge, wrong version boundary, guessed license, redistributable third-party/Minecraft asset without permission, renderer-visible resource without owner/fixture/reference/test plan, or zip-bomb/size-limit bypass is a failure.', command: 'bun spec/map/plan/tools/materialize-resource-inventory.mjs --source-root <pinned-source-root> --git-dir <pinned-git-dir> --check && bun spec/map/plan/tools/check-resource-dispositions.mjs --require-closed && node spec/map/plan/tools/validate-plan.mjs --require-plan-complete', gate: 'independent re-enumeration and disposition path sets exactly equal the pinned Git resource set; all rows have verified source digest, per-resource license/provenance state, one of the four allowed scopes, valid owner phase, and evidence-linked consumers or per-row exclusion proof; renderer-runtime rows additionally reach a concrete resolver, fixture, Java reference capture plan, focused test plan, and version profile.', commit: 'chore: close dynmap renderer resource inventory' },
  { n: '002', file: 'version-matrix-lock', title: 'Exact release inventoryとrenderer/Anvil/Paper data-delta profiles', depends: '000,001', source: '2026-09-23時点のMojang official version manifestと、1.14以降の各exact stable releaseに対応する公式client/server artifact。現snapshotは48件・最新26.3。', output: 'exact release set、artifact locks、version-delta-matrix.json、releaseごとのdata delta/evidence records、差分に応じたshared implementation profileと必要なadapter owner', tasks: ['公式manifestのstable release集合を固定し、matrixとのID set equalityを検査する。', '各client/server JARを公式SHA-1/lengthと照合して一時領域へ取得し、SHA-256を記録する。ダウンロード総量を事前表示し、versionごとに抽出後は原本を一時領域外へ残さない。', 'client JAR ZIP entry inventoryとasset-index object inventoryを別々に全件作り、両方の実bytesを検証した上でversion固有のresource source-resolution規則を適用し、canonical logical-path mapを作る。JAR内resourceとasset-index objectをどちらか片方で代替せず、出所・取得hash・優先順位・衝突を記録する。', '隣接stable release間でcanonical renderer-consumed resource closureを比較し、block registry IDの追加/削除/変更、block-state property/value、blockstate variants/multipart、model parent/elements/faces/rotation/uvlock/cullface、texture/alpha、biome tint/material/light/emissionの差分を生成する。block registryはexact runtime registry reportから取得し、resource filename差分で代用しない。', 'exact-version world fixtureを公式serverから生成または正規取得し、DataVersion、dimension min/max Y、chunk NBT fields、sections、block/biome palette encoding、packed state layout、heightmap、sky/block light、block entity、region/compression差分を記録する。', 'Paper stable build/API/Java runtime/mappingとsnapshot serializationをrenderer asset・Anvil profileから独立に記録する。Paper buildが無いreleaseはlive compatibility unavailableとし、saved renderer statusへ混ぜない。', '全releaseにversion-delta-matrix rowを作る。renderer-input/schema fingerprint一致は「データ差分なし」の根拠に限って使う。入力fingerprintが異なる場合も、全renderer-input changeをexact fixture・Dynmap trace・Rust pixel parityへ結び、既存generic profileの正しさが証明できればprofileを共有してよい。', '各changed entryをrenderer_input / provenance_only / non_rendererに証拠付きで分類する。renderer_inputに一つでも既存profileで再現するbehavior gapがあれば、失敗fixture・Dynmap trace・Rust failure evidence・owner phaseを記録してadapterを実装する。新releaseごとにadapter phaseを自動生成しない。', '各releaseの5 verification pagesへ観測済み差分、data profile、implementation profile decision、change IDs、report IDs、fixture/reference/test IDsを埋める。page countだけのseed textを実装readyとして残さない。'], fixture: 'official client/server artifact digest fixtures、全version asset diff report、block/state registry comparison、1.18 height/NBT/palette/biome transition fixtures、verified no-diff fixture、different-data shared-profile parity fixture、observed behavior-gap adapter fixture、Paper-unavailable fixture。', fail: 'official artifact unavailable/mismatch、block registry unresolved、unattributed/conflicting asset source、version-delta row missing、no-diff without matching fingerprints、shared profile without exact per-change parity、adapter without observed behavior-gap evidence、Paper unavailable mislabeled as supported。', command: 'bun scripts/check-map-version-phase.mjs --all --phase delta-audit --require-artifact-diffs && bun scripts/check-map-renderer-coverage.mjs --require-all-versions --require-version-deltas', gate: '公式stable ID setとdelta ledger ID setが完全一致し、全releaseのrenderer/Anvil/Paper差分がartifact-boundである。no-diffのみfingerprint一致で成立する。全renderer_input deltaはfixture/reference/pixel comparisonへ到達し、既存profileが通れば共有、具体的gapが再現されたものだけadapterへ割り当てる。', commit: 'chore: lock exact minecraft release matrix' },
  { n: '003', file: 'license-source-boundary', title: 'Apache-2.0 source attribution and distribution boundary', depends: '000,001', source: 'pinned Dynmap source/resource licenses, vendored Java reference snapshot, Rust origin manifest', output: 'NOTICE, license records, per-module origin IDs, redistributed asset policy', tasks: ['Retain pinned commit, upstream paths, copyright/license notices, translation statement and source hash.','Separate Rust translations, Java reference-only harness, fixture data, Minecraft assets, mod assets and MC-Vector-authored code.','Define which assets may be downloaded at runtime versus stored as redistributable fixtures; record source/licensing proof per item.','Verify release/package excludes unrelated Dynmap web/storage/lifecycle binaries and user Minecraft assets.'], fixture: 'origin manifest completeness, source revision mismatch, missing license, asset allowlist and package contents checks.', fail: 'unknown provenance, missing attribution, asset redistribution without policy, copied executable source in app package.', command: 'bun scripts/verify-map-renderer-source.mjs && bun scripts/verify-map-renderer-package-boundary.mjs', gate: 'every vendored/translated/reference/resource artifact has an auditable license and provenance decision.', commit: 'chore: define map renderer source and license boundary' },
  { n: '004', file: 'java-reference-harness', title: 'Pinned Java reference renderer harness', depends: '000,001,003', source: 'actual Dynmap Java renderer closure at pinned revision; existing four empty-context patch traces only as bootstrap', output: 'repeatable chunk+asset input adapter and traces/PNG from unmodified Java renderer semantics', tasks: ['Extend harness to inject complete versioned chunk cache, block state, biome/light, texture/model resources and perspective/shader settings.','Replace empty-context-only invocation with deterministic fixture manifest and explicit requested renderer/tile.','Capture projection, ray steps, block/model resolution, patch hits, UV, shade/light, shader output, boundary events, RGBA and PNG SHA-256.','Compile actual required pinned Java algorithms; stubs may implement only excluded host interfaces and may not provide renderer outputs.','Capture reference artifacts before Rust comparisons and verify immutable manifest hashes.'], fixture: 'flat, cliff, water, forest/leaves, snow, stairs, slab, door, fence, glass, boundary, malformed and custom-pack fixture families.', fail: 'stubbed algorithm path, hidden method behavior, nondeterministic trace, empty fallback or runtime-generated expected output.', command: 'bun run test:map:reference && bun run test:map:reference:fixtures', gate: 'reference output is reproducible from pinned Java source and fixture digest for every required renderer primitive.', commit: 'test: build pinned dynmap java reference harness' },
  { n: '005', file: 'renderer-core-isolation', title: 'Warning-clean Rust renderer crate boundary', depends: '000,003', source: 'src-tauri/crates/map-renderer-core/** and app integration boundary', output: 'crate/module graph with no unconnected app compilation and no warning suppression', tasks: ['Inventory each Rust module and bind it to a phase/source symbol or remove only after explicit ownership review.','Keep renderer algorithm independent of Tauri, Paper Java types, filesystem cache, app state and UI.','Establish crate CI commands with warnings as errors; fix renderer warnings at their ownership source.','Prohibit blanket allow(dead_code)/unused, underscore renaming for warning hiding and changing warning policy.'], fixture: 'standalone crate check, feature-disabled app check, warning regression test in CI.', fail: 'unfinished renderer silently compiled into app, Tauri types in core, lint suppression hiding unwired symbols.', command: 'cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check && cargo check --manifest-path src-tauri/Cargo.toml -p map-renderer-core && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'independent core builds and clippy is clean with all renderer paths intentionally wired or explicitly pending.', commit: 'ref: isolate map renderer core boundary' },
  { n: '006', file: 'source-independent-domain', title: 'Dynmap-equivalent source-independent chunk domain', depends: '000,005', source: 'Dynmap MapChunkCache/MapIterator/MapDataContext/DynmapBlockState contracts', output: 'shared versioned ChunkView/MapChunkCache, availability, world/chunk/section and render input types', tasks: ['Define BlockState identity/properties, palettes/packed states, biome, height, sky/block light, dimension/world identity, coordinates and version profile.','Represent loaded, unloaded, missing, partial, malformed and unavailable as distinct typed states.','Define negative coordinate and inclusive/exclusive tile/chunk boundary semantics.','Keep source provenance and decode diagnostics outside renderer decisions while guaranteeing equal domain content yields identical renderer input digest.'], fixture: 'negative chunks, height boundaries, palette-width changes, missing light/biome, partial/unloaded chunks, equal digest across source adapters.', fail: 'missing treated as air, unloaded treated as empty, version-specific parser types leaking into renderer algorithms.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core domain && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'Saved Anvil/Paper/fixture adapters can produce the same validated domain without renderer source conditionals.', commit: 'feat: define complete map chunk renderer domain' },
  { n: '007', file: 'saved-anvil-common-decoder', title: 'Shared Saved Anvil/NBT decoder', depends: '002,006', source: 'Anvil region/NBT primitives and every versioned chunk-layout dependency', output: 'bounded common region/NBT reader plus per-version decoder interface', tasks: ['Decode region header/sector table/compression/NBT with checked offsets, lengths, endianness and allocation ceilings.','Decode chunk status, sections, palettes, packed states, heightmaps, biomes and light into domain.','Handle negative region/chunk coordinates, cross-region neighbors, legacy section formats and modern layouts via version adapters.','Report truncated, malformed, wrong DataVersion, missing chunk and valid empty generated chunk distinctly.'], fixture: 'real captured region plus deterministic malformed/truncated/overflow/negative-coordinate fixtures for each supported family.', fail: 'panic, overread, allocation outside budget, invalid chunk normalized to valid empty, wrong adapter accepted.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core world::anvil && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'shared decoder yields stable domain digest for valid chunks and structured non-success for every malformed case.', commit: 'feat: add bounded anvil decoder core' },
  { n: '008', file: 'versioned-assets', title: 'Verified client JAR/resource pack loading', depends: '001,002,003,005', source: 'TexturePackLoader and both Minecraft client-JAR and asset-index resource roots', output: 'version-bound read-only resource union with exact per-path provenance and deterministic source resolution', tasks: ['Verify the exact client JAR and asset-index metadata against version JSON SHA-1/length, then hash downloaded bytes with SHA-256; enumerate client-JAR ZIP entries and asset-index logical-path/object mappings as separate complete inventories.','Build a canonical logical-resource map from both roots; preserve each candidate source, byte digest, official SHA-1/size where applicable, and per-version source-resolution rule. Identical duplicates may deduplicate; byte-conflicting duplicates fail unless exact-version vanilla runtime behavior proves a deterministic precedence rule and the evidence is recorded.','Resolve renderer closure from block registry/state through blockstate variant/multipart selectors, model parent/texture variables, models and texture/metadata bytes across the canonical map; record added/removed/changed IDs, properties, selectors, model edges, texture pixel/alpha digests, biome/material/light inputs and source-location changes against the preceding stable release.','Require complete inventories for all client-JAR entries, asset-index objects, block registry, block states, canonical resource map, resolved model graph and renderer-only closure; bind every manifest to exact target/baseline artifacts and fail unresolved, missing, unverified or ambiguous paths.','Load exact-version renderer assets with namespace/path canonicalization, pack.mcmeta and explicit vanilla/user-pack precedence; keep Minecraft assets separate from Dynmap source and Core artifact.','Use the 1.14 and 26.3 client-JAR probes only as packaging-layout regression fixtures; they do not prove semantic version deltas, adapter coverage or pixel parity.'], fixture: 'exact 1.14 and 26.3 JAR/index packaging probes, path relocation, JAR-only/index-only/identical duplicate/conflicting logical path, traversal/zip bomb, version mismatch, model inheritance, multipart selection, texture alpha and corrupted bytes.', fail: 'path escape, unverified bytes, unproven source precedence, ambiguous duplicate, unresolved blockstate/model/texture edge, guessed checkerboard/material fallback or cross-version cache reuse.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core assets && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'the asset report is schema v2, both official source roots are exact-digest-bound, every renderer-visible block/state resolves through verified model and texture bytes, and semantic deltas or verified no-diff fingerprints are linked to fixtures and Java-reference pixel evidence.', commit: 'feat: load versioned minecraft renderer assets' },
  { n: '009', file: 'dynmap-matrix-perspective', title: 'Matrix/vector and HD perspective transforms', depends: '004,006', source: 'Matrix3D, Vector3D, HDPerspective, IsoHDPerspective, HDPerspectiveState', output: 'operation-order-compatible transform/projection/ray setup and exact tile bounds', tasks: ['Port matrix multiplication, inverse, determinant, vector operations and floating-point order from pinned Java source.','Port azimuth/inclination/shear/scale and world↔map projection, pixel↔ray construction and perspective state.','Port tile coordinates, bounds, required chunks and adjacent tile transforms with exact boundary rules.','Trace each transform stage against Java fixtures, including negative values and numerical singularities.'], fixture: 'matrix basis/inverse, known orientation/ray, each tile corner/edge, negative coordinates, adjacent tiles, singular/near-singular inputs.', fail: 'algebraically similar but reordered floating operations causing trace/pixel drift, arbitrary clamping or world-center rollback.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::dynmap::transform && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'all pinned transform and tile-bound traces match under fixed numeric tolerance defined by reference capture.', commit: 'feat: port dynmap matrix and perspective transforms' },
  { n: '010', file: 'dynmap-patch-geometry', title: 'RenderPatch/patch factory geometry', depends: '004,006,009', source: 'PatchDefinition, PatchDefinitionFactory, RenderPatch, RenderPatchFactory, Polygon', output: 'face/partial/rotated patch construction, intersection and UV basis', tasks: ['Port patch plane, origin, axes, normal, winding, side visibility, texture index, UV rotation and bounds.','Port factory methods and parameter semantics from the exact API; preserve float order and validation behavior.','Implement ray/plane/patch intersection, parallel/degenerate/backface rules, face orientation and culling.','Expose trace fields needed to compare vertices, face index, hit distance and UV with Java.'], fixture: 'all cube faces, partial/diagonal/rotated patch, transparent patch, parallel ray, degenerate basis, backface and boundary hit.', fail: 'wrong winding/UV/side visibility silently accepted or invalid geometry rendered with guessed fallback.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core geometry && bun run test:map:reference', gate: 'factory construction and patch-hit traces match fixed Java reference vectors.', commit: 'feat: port dynmap patch geometry and intersections' },
  { n: '011', file: 'dynmap-voxel-traversal', title: 'MapIterator and voxel/ray traversal', depends: '006,007,009,010', source: 'MapChunkCache, MapIterator, BlockStep, TileFlags, visibility limits', output: 'Dynmap traversal sequence, section skipping, neighboring chunk reads and ordered hits', tasks: ['Port voxel stepping and exact tie/boundary order; record every stepped block and direction.','Port chunk/section cache lookup and visibility/height limits without interpreting missing as air.','Select model patches, cull faces, cross chunk boundaries, and process opaque/translucent layers in source order.','Bound traversal work and surface cancellation/limit states as errors rather than empty pixels.'], fixture: 'axis/diagonal rays, exact edge/corner crossings, negative chunk boundary, transparent stacks, unloaded neighbor, visibility cutoffs.', fail: 'skipped/duplicated voxel, wrong tie order, infinite traversal, wrong neighboring chunk or missing data hidden.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::dynmap::traversal && bun run test:map:reference', gate: 'block sequence, hit face/patch, distance, alpha order and chunk transitions match Java trace.', commit: 'feat: port dynmap map iterator and voxel traversal' },
  { n: '012', file: 'blockstate-model-resolution', title: 'Versioned blockstate and model resolver', depends: '001,002,008,010', source: 'DynmapBlockState, blockstate JSON/model references, version data definitions', output: 'deterministic variant/multipart/model inheritance resolver', tasks: ['Parse blockstate variants and multipart conditions with exact property matching, defaults and state aliases.','Resolve model parent chains, texture variables, x/y rotations, uvlock, cullface, AO and element faces.','Support version-specific registries and resource format profiles without version branches in shared ray code.','Return unsupported/missing/cycle failures with source IDs and selected branch trace.'], fixture: 'stone, grass, stairs, slabs, fences, doors, leaves, glass, fluids, redstone, rails; parent cycles and malformed JSON.', fail: 'fallback to default/guessed model on unmatched state, parent cycle, wrong asset version or malformed face.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core assets::blockstate && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'selected variant/multipart branch, parent chain and final face descriptors match the Java/reference resolver.', commit: 'feat: resolve minecraft blockstate models' },
  { n: '013', file: 'hd-block-model-registry', title: 'HDBlockModels and custom/volumetric model registry', depends: '000,006,010,012,019', source: 'HDBlockModels, HDBlockModel, HDBlockPatchModel, HDBlockVolumetricModel, HDScaledBlockModels, CustomBlockModel, HDBlockStateTextureMap', output: 'state-to-model/patch registry with scale, alias and custom API semantics', tasks: ['Port model registration, state alias, version/visibility conditions and registry precedence.','Port patch model, volumetric model, scaled model, subblock/scale and texture map behavior.','Port custom model registration using the exact MapDataContext/RenderPatch contracts.','Record lookup and patch-order trace for every registry decision; reject duplicate/conflicting registration.'], fixture: 'patch/volumetric/scaled model, alias, multiple state maps, block updates, duplicate key and missing texture mapping.', fail: 'registry order drift, silently dropped patches, guessed default model or third-party renderer implementation treated as built-in.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core models && bun run test:map:reference', gate: 'model ID, selected state mapping, scale, patch count/order, texture map and API behavior match Java.', commit: 'feat: port dynmap block model registry' },
  { n: '014', file: 'texture-pack-and-atlas', title: 'TexturePack atlas, UV and alpha pipeline', depends: '001,004,008,010,012,013', source: 'TexturePack, TexturePackLoader, texture map/atlas/resampling', output: 'texture index and source pixel to sampled RGBA pipeline', tasks: ['Port texture indexing/registration, atlas coordinates, UV clipping, rotation and face texture selection.','Port resampling/interpolation, tile ARGB, alpha and color sample order from source.','Handle animated texture frame policy, transparency categories and missing texture diagnostics.','Trace texture source path identity/hash, atlas slot, UV and sampled pixel for each face.'], fixture: 'opaque/cutout/translucent textures, all rotations, atlas edges, UV clipping, animation frames, missing/corrupt image.', fail: 'wrong interpolation/alpha order, texture atlas nondeterminism, guessed missing asset or digest mismatch.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core textures && bun run test:map:reference', gate: 'texture index, atlas/UV sample, rotation, alpha and pixel output match pinned reference.', commit: 'feat: port dynmap texture pack and atlas' },
  { n: '015', file: 'ctm-texture-pack', title: 'Connected Texture Mod (CTM) behavior', depends: '011,012,014', source: 'CTMTexturePack and CTMVertTextureRenderer', output: 'neighbor-sensitive CTM rule selection and texture index/UV output', tasks: ['Inventory all CTM rule formats and neighbor/block-state read paths in the pinned implementation.','Port rule parsing, match precedence, face/edge/corner selection and texture coordinate transformation.','Version-bind CTM resources and preserve unsupported rule types as explicit failures.','Add fixtures for each rule branch and neighboring material/state combination.'], fixture: 'all supported CTM method types, missing neighbor, chunk edge, matching/nonmatching state, transparent face and malformed rule.', fail: 'rule skipped, first-match order changed, neighbor unavailable treated as non-match success, unknown method guessed.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core textures::ctm && bun run test:map:reference', gate: 'selected CTM rule, texture index, UV transform and final pixel match Java for every source branch.', commit: 'feat: port dynmap connected texture rules' },
  { n: '016', file: 'biome-color-material', title: 'Biome tint, color multipliers and materials', depends: '006,007,012,014', source: 'CustomColorMultiplier implementations, biome lookup, grass/foliage/water colors', output: 'versioned biome/material RGBA multiplier and missing-data semantics', tasks: ['Port grass/foliage/water tint and each pinned CustomColorMultiplier algorithm.','Use exact world/biome sample coordinates and neighbor rules required by Dynmap.','Preserve material opacity/cutout/translucent/emissive classification and compositing inputs.','Version-bind colormap/resource hashes and record raw biome ID to resolved color trace.'], fixture: 'same block across distinct biomes, tint enabled/disabled, missing biome, foliage, grass, water, mod color multipliers.', fail: 'fixed biome color, missing biome defaulted, multiplier order changed or material alpha guessed.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core shaders::color && bun run test:map:reference', gate: 'biome identity, multiplier output, material and sampled color trace match Java.', commit: 'feat: port dynmap biome colors and materials' },
  { n: '017', file: 'hd-lighting', title: 'HDLighting implementations', depends: '006,007,010,011,016', source: 'HDLighting, DefaultHDLighting, LightLevelHDLighting, ShadowHDLighting, LightLevels', output: 'exact face shade, ambient, sky/block light, shadow and brightness result', tasks: ['Port brightness table, face direction shade, ambient and emitted light behavior from Java.','Use decoded sky/block samples and perspective hit geometry; do not inject fixed light.','Port default/light-level/shadow policies and configuration boundaries.','Expose per-ray lighting trace including raw sample, selected rule, multiplier and output channel.'], fixture: 'sky/block light 0..15 cross product, day/night, all face directions, shadow on/off, emissive, cave and water.', fail: 'fixed light fallback, guessed missing light, wrong table rounding or face orientation dependence.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::dynmap::lighting && bun run test:map:reference', gate: 'light selection, shade factor, ambient and output RGBA match Java traces across the finite matrix.', commit: 'feat: port dynmap hd lighting' },
  { n: '018', file: 'hd-shader', title: 'HDShader lifecycle and shader resources', depends: '001,014,016,017', source: 'HDShader, HDShaderState, Default/TexturePack/Underwater/Cave/Topo/ChunkStatus/ChunkVersion/Inhabited shaders', output: 'per-ray shader state, resource/config parser and RGBA output', tasks: ['Port shader state initialization, per-block transitions, pixel completion and required-data declarations.','Port each built-in shader and shader/lightings/perspectives definition resource.','Match shader-selected material/biome/height/light/underwater/cave inputs and alpha.','Reject unknown shader configuration and missing required data with explicit structured errors.'], fixture: 'all shader variants, above/below water, cave, height bands, chunk status/version, inhabited state, missing required sample.', fail: 'shader state skipped/reset at wrong pixel, config default guessed, missing input rendered as success.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core shaders && bun run test:map:reference', gate: 'lifecycle events, data requirements, selected shader branch and output RGBA match reference.', commit: 'feat: port dynmap hd shader lifecycle' },
  { n: '019', file: 'custom-renderer-api', title: 'Dynmap CustomRenderer/MapDataContext API contract', depends: '000,006,010', source: 'DynmapCoreAPI renderer six source files', output: 'Rust-compatible API semantics needed by all Dynmap built-ins', tasks: ['Port lifecycle, block-state context, neighbor reads, tile/entity data access and missing-data behavior from API source.','Port RenderPatch/Factory interface contract and CustomColorMultiplier call semantics without importing Bukkit.','Document every API method as implemented, adapter-only or out-of-scope with reason and fixture.','Run every built-in against the same Rust API model; keep method results and call order traceable.'], fixture: 'neighbor reads at chunk edge, absent tile data, property lookup, patch factory args, color multiplier lifecycle.', fail: 'API method stub returns synthetic data that changes renderer output, hidden context dependency or untracked method.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_api_contract && bun run test:map:reference', gate: 'every required API symbol is mapped and each built-in consumes identical contract semantics.', commit: 'feat: port dynmap renderer api contracts' },
  { n: '020', file: 'builtin-registry', title: 'Complete built-in renderer registry', depends: '000,019', source: 'all pinned Dynmap renderer implementations and their registration/dispatch call sites', output: 'one-to-one registry map and a class-specific phase owner for every verified built-in', tasks: ['Compare Java AST class list and registration/dispatch references with the seed catalog and full pinned source tree.','Record identifiers, state selectors, version/mod gates, construction inputs and implementation page for each class.','Add generator/coverage rule that every discovered built-in has a child phase before implementation.','Mark every old translated flag unverified until child fixture/reference/pixel gate passes.'], fixture: 'source class/registration set equality, duplicate registration, unknown class and all condition branches.', fail: 'unregistered class, catalog-only class without phase file, false translated-as-verified or third-party renderer added as core built-in.', command: 'bun spec/map/plan/tools/generate-phase-files.mjs --check && bun scripts/check-map-renderer-coverage.mjs --require-builtin-plan-owners', gate: 'every in-scope pinned Dynmap built-in has exactly one child phase and registry owner; no extra or missing class.', commit: 'chore: map every dynmap builtin to an implementation phase' },
  { n: '021', file: 'builtin-renderer-family-gate', title: 'Individual built-in renderer phases', depends: '004,006,009-020 and every built-in renderer phase', source: 'generated-index.md and class-specific child pages under phases/builtins/', output: 'independently committed implementations and reference evidence for every in-scope built-in', tasks: ['Execute each B-* child in dependency order; each class owns one commit and one AST-symbol subset.','Split any source class whose methods do not form one reviewable task into additional symbol-group child phases before coding it.','For mod-integrated built-ins use isolated API data fixtures; do not copy third-party renderer implementations.','Run the registry-wide cross-renderer fixture after the final class and check registration collisions.'], fixture: 'class-specific source-branch fixture sets plus registry interaction fixtures for every in-scope built-in.', fail: 'child skipped because another renderer is similar, class covered only by family-level visual test, or evidence inherited from adjacent class.', command: 'bun scripts/check-map-renderer-coverage.mjs --require-all-builtins && bun run test:map:reference:fixtures', gate: 'all cataloged in-scope built-in child pages passed and class-specific reference/pixel evidence is recorded.', commit: 'feat: complete dynmap builtin renderer set' },
  { n: '022', file: 'raster-compositing', title: 'Pixel rasterization and alpha compositing', depends: '014,016,017,018', source: 'Dynmap buffered image, pixel writer, HD perspective render output', output: 'deterministic tile RGBA and PNG encoding boundary', tasks: ['Port scanline/pixel placement, texture sampling, shade/tint/lighting order and alpha compositing.','Define clipping, tile edge and empty-pixel behavior from reference.','Use deterministic color conversion and PNG encoder settings; hash normalized RGBA separately from PNG bytes.','Track pixel provenance through face, texture, shader, lighting and compositing.'], fixture: 'overlapping opaque/cutout/translucent faces, tile edges, alpha 0/partial/255, clipping, color rounding.', fail: 'coverage-only success, transparent PNG marked terrain, encoder nondeterminism or changed alpha order.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::png && bun run test:map:reference', gate: 'pixel coordinates and normalized RGBA equal Java oracle on fixed raster fixtures.', commit: 'feat: port dynmap raster and alpha compositing' },
  { n: '023', file: 'reference-pixel-parity', title: 'Full intermediate trace and pixel parity', depends: '004,009-022', source: 'all required symbols/resources/built-ins and immutable Java capture set', output: 'fixture-catalog keyed Java/Rust intermediate parity report and pixel goldens', tasks: ['Bind each required source symbol to at least one exercising reference fixture or a source-proved adapter boundary.','Cover flat, mountain/cliff, water/lava, forest/leaves, snow, stairs/slabs, doors, fences/walls/panes, glass, rails/redstone, containers/heads, CTM, boundary, negative coordinate, malformed/unloaded and custom pack.','Compare traversal, model, texture, UV, lighting, shader, tile boundary, alpha, normalized RGBA and PNG hash independently.','Freeze capture input/source/tool hashes before tests and do not regenerate expected values from Rust.'], fixture: 'versioned fixture catalog with input, asset, reference trace/PNG digest and expected structured diagnostics.', fail: 'unexplained pixel delta, reference made by Rust, missing symbol fixture, tolerance enlarged without source-level cause.', command: 'bun run test:map:reference:fixtures && cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_reference_parity', gate: 'required symbol/resource/builtin reference coverage complete; all intermediate/pixel comparisons pass.', commit: 'test: enforce full dynmap reference and pixel parity' },
  { n: '024', file: 'paper-snapshot-protocol', title: 'Paper snapshot provider, Core artifact and protocol', depends: '002,003,006,007,019', source: 'Paper plugin lifecycle boundary, bridge protocol, per-version child paper-snapshot pages', output: 'verified provider artifact, identity-bound snapshot transport and failure states', tasks: ['Implement hello/heartbeat/reconnect/requestId, loaded/not_loaded, queue limits, cancellation and structured unavailable reason.','Implement version-bound Paper serializers only as data adapters; renderer logic stays Rust-only.','Validate server/version/world/dimension/chunk/DataVersion identity and bound packet/snapshot sizes.','Integrate Core artifact manifest/hash/install/restart lifecycle with the Paper provider and local release-like validation; no remote publication.','Run each generated version paper-snapshot child after the common protocol passes.'], fixture: 'real and loopback protocol fixtures for loaded/unloaded, wrong identity, timeout, queue full, reconnect, malformed payload and oversized snapshot.', fail: 'bridge-connected treated as terrain-ready, wrong chunk accepted, unknown snapshot as empty, renderer code added to plugin.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core bridge && ./gradlew --no-daemon test', gate: 'Paper artifact loads and data protocol is identity-safe; per-version real communication remains each version child gate.', commit: 'feat: implement paper snapshot provider protocol' },
  { n: '025', file: 'saved-live-equivalence', title: 'Saved Anvil and Paper live renderer equivalence', depends: '007,024,all-version-anvil-paper-stage', source: 'same chunk bytes through Anvil and Paper provider into ChunkView', output: 'source-independent input digest, identical Java/Rust trace and PNG', tasks: ['Capture same loaded chunk into saved fixture and Paper response with exact identity and asset set.','Normalize both adapters to same domain and compare every block/palette/biome/height/light field digest.','Render both through one Rust renderer instance and compare full trace and normalized RGBA.','Report source and unavailable counts separately; zero live responses never means generated terrain absent.'], fixture: 'same flat/complex/mixed biome/light chunk from both adapters plus unloaded/timeout and malformed cases.', fail: 'source-specific renderer branch, coordinate mismatch, accepted partial snapshot or empty terrain inference.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test saved_live_equivalence', gate: 'equivalent domain digest and output bytes match; unavailable states remain explicit.', commit: 'test: prove saved and live renderer equivalence' },
  { n: '026', file: 'tile-geometry-pyramid', title: 'WorldXZ/Iso tile geometry and zoom pyramid', depends: '009,011,025', source: 'Dynmap tile/perspective bounds plus MC-Vector zoom 0..8 contract', output: 'version/world/zoom tile coordinates, requested chunks and adjacent continuity', tasks: ['Implement the existing MC-Vector product mapping exactly: WorldXZ at zoom 0..4 and IsoProjected at zoom 5..8; within each band reproduce pinned Dynmap transforms and boundaries without inventing renderer behavior.','Map the same world coordinate across all zoom levels, negative coordinates and dimension identity without recenter rollback.','Select viewport-centered live chunks while retaining geometric bounds and the bounded request cap specified by the Paper protocol phase.','Prove adjacent tiles share exact world/pixel boundaries and requested chunks include the visible center.'], fixture: 'zoom 0..8, center/edge coordinates, negative chunks, adjacent tile pairs, iso boundaries, zoom 4/5 transition.', fail: 'tile-center-only live sampling, gaps/overlaps, unbounded chunk fanout or center jump across zoom.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core tiles && bun run test:map:viewport', gate: 'all tile mappings and adjacency traces pass fixed geometry references and saved terrain fixtures.', commit: 'feat: implement map tile geometry and zoom pyramid' },
  { n: '027', file: 'verified-tile-cache', title: 'Verified tile cache, stale and retry states', depends: '022,023,026', source: 'MC-Vector map-cache metadata and renderer/version/asset/chunk digest', output: 'atomic PNG+metadata cache with verified/stale/empty/failed/retryable states', tasks: ['Define cache key by world/dimension/zoom/tile/renderer/version/asset and input digest.','Atomically stage/sync/rename output and metadata; validate PNG, dimensions, digest and renderer version on read.','Do not cache zero-source/transparent/error result as fresh success; preserve stale metadata semantics.','Invalidate by chunk_dirty footprint and retry old empty/unknown cache without deleting unrelated/user files.'], fixture: 'cache hit, corrupted PNG, missing metadata, old schema, stale chunk, interrupted write, empty terrain and concurrent install.', fail: 'partial success file, old unknown cache trusted, failed tile fresh-cached or checksum mismatch ignored.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core cache && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'only verified tile and matching metadata are reusable; failures remain retryable and atomic.', commit: 'feat: add verified map tile cache' },
  { n: '028', file: 'bounded-render-scheduler', title: 'Bounded tile scheduler and cancellation', depends: '026,027', source: 'viewport generations, per-server worker lifecycle and render deduplication', output: 'bounded concurrency, singleflight tile renders, cancellation and retry backoff', tasks: ['Set per-server/global worker and memory limits; deduplicate identical tile key renders.','Use viewport generation/identity so stale completed tasks cannot overwrite current results.','Cancel obsolete tasks safely while preserving reusable verified cache hits.','Expose queue-full, timeout, retryable, cache-hit and cancellation diagnostics without raw path/stack.'], fixture: 'same-key concurrent request, rapid viewport changes, cancel vs finish race, queue full, transient failure and cache short circuit.', fail: 'duplicate network snapshot/render, old generation wins, unbounded backlog or cancel deletes newer output.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core scheduler', gate: 'bounded resource use, singleflight and generation correctness under deterministic concurrency tests.', commit: 'feat: add bounded map render scheduler' },
  { n: '029', file: 'tauri-ipc-diagnostics', title: 'Connect verified renderer to Tauri IPC', depends: '025,027,028', source: 'src-tauri/src/commands/map_render.rs, app state, map events', output: 'real request→source→renderer→cache→event path with redacted status', tasks: ['Replace renderer_not_connected blocked stub only after verified pipeline APIs are ready.','Validate version/world/viewport input, choose saved/live source, call bounded scheduler, and return structured state/progress/result.','Expose bridge state separately from terrain/render state, source counts, cache, retryability and error code.','Redact absolute paths, token, raw HTTP/server response and internal panic detail.'], fixture: 'invalid request, cache hit, actual saved fixture raster, live protocol fixture, timeout, cancellation, malformed source and privacy checks.', fail: 'command reports success without tile bytes, frontend event emitted before atomic cache completion, raw secret/path leaks.', command: 'cargo test --manifest-path src-tauri/Cargo.toml --lib commands::map_render && bun run test:map:ipc', gate: 'real Rust command produces verified tile or explicit failure and each event reports matching generation/request identity.', commit: 'feat: connect map renderer to tauri ipc' },
  { n: '030', file: 'status-consent-ui', title: 'Map status, diagnostic and consent UI', depends: '029', source: 'src/map/**, MapView, MapSetupModal, App server map consent, i18n', output: 'Core/client asset/renderer/terrain/source states separated in UI and IPC types', tasks: ['Represent Core artifact, bridge connectivity, client rendering assets, tile state, source and live counts independently.','Render downloading/verifying/rendering/empty/unloaded/offline/invalid/retry/restart states with localized redacted codes.','Persist consent only when renderer verified and terrain component active or waiting_restart; do not infer from bridge connected.','Keep clipboard/App error states outside Map diagnostic mapping.'], fixture: 'TypeScript state mapping, unresolved enable result, verified active, waiting restart, asset selected but Core missing, raw path/token/body redaction.', fail: 'consent enabled for unresolved renderer, bridge mislabeled terrain-ready, unresolved failure shown as empty world.', command: 'bun run check && bun run test && bun run typecheck:tests', gate: 'frontend state and Rust return contract agree, all consent/error tests pass in Japanese and English.', commit: 'feat: expose verified map renderer status' },
  { n: '031', file: 'smooth-zoom-pan', title: 'Cursor-anchored continuous zoom and committed pan', depends: '026,027,029,030', source: 'MapView viewport interactions and project/unproject functions', output: 'continuous preview transform with verified target tile swapping', tasks: ['Preserve renderedZoom/previewZoom/targetZoom/previewScale/anchor separately and format fractional display to two decimals.','Unproject cursor to world coordinate, debounce integer backend target, retain old valid layer until all target tiles verified.','Commit pointerup displacement to canonical world center and request adjacent tiles with new center.','Apply same center anchor for +/- controls; clamp 0..8; maintain marker/player/boundary layers under one transform.'], fixture: 'project/unproject roundtrip for WorldXZ/IsoProjected, center/edges, zoom 8→0, preview during render, failure retention, pan pointerup commit.', fail: 'blank grid during target generation, cursor-world drift, no center commit, over-boundary request, raw floating precision in UI.', command: 'bun run typecheck:tests && bun run test -- map-viewport-interaction', gate: 'automated anchor/pan tests pass and real UI manipulation is recorded in every required real acceptance.', commit: 'feat: add cursor anchored map zoom and pan' },
  { n: '032', file: 'failure-safety', title: 'Cross-layer failure and consent safety', depends: '025,027-031', source: 'artifact/source/render/cache/IPC/UI failure transitions', output: 'single failure taxonomy and no false terrain/consent success path', tasks: ['Map missing asset, malformed Anvil, unsupported version, unloaded, world mismatch, timeout, queue full, checksum failure, conflict and renderer error to stable redacted codes.','Guarantee failed/empty target retains old verified layer and remains retryable as appropriate.','Gate listener, scheduler and consent behind verified artifact/config/runtime readiness.','Inject failure at each download/decode/render/cache/IPC boundary and assert no partial active artifact/tile.'], fixture: 'all structured error codes through Rust event and TypeScript view; raw HTTP/path/token sanitization.', fail: 'failure becomes empty/success, listener starts unresolved, tile loop retries unbounded or consent persists invalid state.', command: 'bun run check && bun run test && bun run typecheck:tests && cargo test --manifest-path src-tauri/Cargo.toml --lib', gate: 'all failure transitions are deterministic, bounded and cannot enable Map or erase previous verified content.', commit: 'fix: enforce map renderer failure safety' },
  { n: '033', file: 'resource-security-performance', title: 'Renderer input bounds, security and memory', depends: '007,008,011,027-029', source: 'ZIP/NBT/Anvil/model/texture/cache/network inputs and worker concurrency', output: 'explicit byte/count/time/memory ceilings with safe cancellation', tasks: ['Set hard limits for region/NBT/compressed chunk/model/texture/archive/atlas/tile/snapshot/queue sizes and document each constant.','Reject path traversal, zip bombs, duplicate identities, decompression bombs, integer overflow, malformed recursion and oversized JSON/model inheritance.','Bound pixel ray count, block traversal, per-server parallelism, memory and time; cancellation must release buffers.','Property/fuzz test parsers and recover without panic, partial cache writes or secret-bearing diagnostics.'], fixture: 'boundary at limit/limit+1, overflow, cyclic model parent, corrupt zip/NBT, timeout, cancel, memory-budget concurrency.', fail: 'unbounded allocation, panic, path escape, partial write, stack/secret leak.', command: 'cargo fuzz run map_input_parsers && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'all untrusted inputs bounded and security/fuzz suites produce structured errors with no panic.', commit: 'fix: bound map renderer resource usage' },
  { n: '034', file: 'ci-warning-quality', title: 'Warning-clean Rust and exhaustive CI matrix', depends: '000-033', source: 'Cargo workspace, Java/Gradle harness, TypeScript scripts and catalogs', output: 'reproducible CI gates derived from source/version manifests', tasks: ['Run fmt/check/clippy -D warnings/test for renderer crate independently from unrelated application warnings.','Run Java oracle and immutable fixture verifier; reject runtime golden generation.','Generate all per-version CI jobs from version-matrix JSON; do not keep hand-written duplicate release list.','Run Bun check/test/typecheck/build and cargo app-library tests with separately reported outcomes.','Keep real Paper/Tauri manual evidence as an explicit gate rather than claiming CI mock proves it.'], fixture: 'clean checkout workflow, changed version manifest, missing phase file, unexpected new source/resource/builtin, lint regression.', fail: 'catalog drift ignored, action/version matrix stale, warning suppression, CI green while required target silently omitted.', command: 'bun run check && bun run test && bun run typecheck:tests && bun run build && cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core', gate: 'all automated supported gates are green, with real acceptance still separately evidenced.', commit: 'ci: enforce map renderer coverage matrix' },
  { n: '035', file: 'real-acceptance-orchestration', title: 'All-version Paper/Tauri acceptance runs', depends: '023-034 and every version real-acceptance child', source: 'all exact-version real-acceptance pages and evidence matrix', output: 'one evidence record per exact release and final UI/process/port results', tasks: ['Provision version-matched Paper and Java runtime for each matrix entry; if unavailable, keep that version blocked and continue independent versions.','Execute the version-specific real-acceptance command and manual UI sequence from each child page.','Record plugin load, hello/heartbeat, loaded snapshots, actual terrain, cache, zoom/pan, failure safety and artifact digests per release.','Stop Paper via app UI; record process exit and port 25565 release before closing app.','Never copy evidence from fixture/mock/smoke or a neighboring version.'], fixture: 'real server worlds and client assets for every exact version; no synthetic-only substitution.', fail: 'missing version row, Paper mock, app stopped by force without UI evidence, port check omitted, evidence without hashes/commit.', command: 'bun scripts/check-map-acceptance-evidence.mjs --require-complete', gate: 'all exact releases in the verified manifest snapshot have independently verified real evidence; unresolved row blocks entire Goal.', commit: 'test: record complete map renderer real acceptance' },
  { n: '036', file: 'final-coverage-audit', title: 'Strict final source-to-runtime closure audit', depends: '000-035 and all generated specialist phases', source: 'AST/resource/builtin/version catalogs, Java references, Rust tests, all acceptance rows', output: 'immutable final audit report and complete Goal status', tasks: ['Run strict source-symbol/resource/builtin/version/fixture/reference/evidence coverage checks.','Cross-check every required source symbol→Rust owner→fixture→Java trace→focused test→evidence edge.','Run all repository/Rust/frontend/build checks and review each evidence class separately.','Verify no planned/unverified/blocked required entry, legacy phase link, false translated status or warning suppression remains.','Record unsupported product boundaries explicitly and ensure none is a required renderer feature.'], fixture: 'clean-room final audit from committed tree, regenerated plan index and version/source manifest change detection.', fail: 'any required blocker, test skip, unsourced claim, uncommitted plan/code, mismatched evidence digest or incomplete release.', command: 'bun run test:map:final-audit && bun scripts/check-map-renderer-coverage.mjs --require-all-symbols --require-all-resources --require-all-builtins --require-all-versions --require-reference-evidence && bun scripts/check-map-acceptance-evidence.mjs --require-complete && git diff --check', gate: 'zero unresolved required coverage/evidence rows and all final gates pass from a clean committed tree.', commit: 'test: close complete map renderer coverage audit' },
];

const phasePlanOverrides = {
  '000': {
    source: 'all 856 Java files at pinned Dynmap revision and every renderer-reachable declaration/reference/resource edge',
    tasks: [
      'Run the pinned JDK Compiler Tree API inventory against every Java blob; preserve exact declaration IDs, overload signatures, nested/local/anonymous types, source spans, and javac diagnostics.',
      'Resolve attributed calls, field/type references, inheritance/constructor dispatch, imports, reflection/registries, and dynamic resource strings; store resolved, adapter-boundary, excluded, and unresolved candidates without treating regex names as declarations.',
      'Start from renderer entry points and traverse the source/resource graph transitively across every module; add every newly reachable source file/resource to the inventory before assigning an owner.',
      'Assign every discovered declaration to a required renderer phase, adapter phase, or evidence-backed exclusion; route unresolved candidates to this phase with an explicit review record rather than silently dropping them.',
      'Generate stable per-symbol disposition and dependency-edge ledgers, then independently compare their IDs and source hashes against the pinned Git tree and AST inventory.',
    ],
    fixture: 'AST parser corpus covering overloads, nested/local/anonymous types, generics/annotations, constructor delegation, inheritance, reflection registration, dynamic resource lookup, external API boundaries, plus the complete pinned-tree javac report.',
    fail: 'Any parse error, source/hash drift, declaration-ID collision, unassigned declaration/reference candidate, unresolved renderer-reachable edge, heuristic-only exclusion, or source file outside the audited inventory fails this phase.',
    command: 'java spec/map/plan/tools/DynmapAstInventory.java <pinned-source-root> <raw-ast.json> 93b454efb8802dc7406d6873434f2aeec5c636f4 && node spec/map/plan/tools/materialize-ast-inventory.mjs --source-root <pinned-source-root> --git-dir <pinned-git-dir> --ast-json <raw-ast.json> --check && node spec/map/plan/tools/validate-plan-coverage.mjs && git diff --check',
    gate: 'Every pinned Java declaration and reference candidate is in the ledgers, every renderer-reachable edge is resolved or has a source-backed adapter/exclusion decision, and each required declaration has a concrete Rust phase plus fixture/reference/test/evidence plan.',
  },
  '001': {
    source: 'all 3,673 pinned resource paths across every module, exact loader/consumer edges, Minecraft client JAR and resource-pack inputs',
    output: 'full resource path/hash inventory, per-path planned owner and consumer review, provenance/license decision, version scope, and fixture/reference/test plan',
    tasks: [
      'Re-enumerate every path from the exact pinned Git tree and verify byte length, blob SHA-1, and content SHA-256; reject missing or extra paths.',
      'Use resolved AST edges plus reflection, registry, configuration, and dynamic path construction to identify exact consumers for texture maps/files, model mappings, CTM, color schemes, shaders, lighting, perspectives, templates, markers, platform bootstrap, and external renderdata.',
      'For every path, record one final scope (renderer runtime, reference only, boundary adapter, or excluded); keep provisional candidates distinct from verified final dispositions until consumer closure and version policy are proven.',
      'For renderer inputs, assign the resolver/version profile, selected-byte provenance, exact fixture ID, pre-captured Java reference ID, focused test ID, and evidence owner; for exclusions, attach caller/path evidence and a per-path rationale.',
      'Audit all 188 non-core platform paths and all 77 legacy Forge 1.12.2 renderdata files individually; preserve generic custom mapping behavior even when a packaged legacy file is out of scope.',
      'Inspect copyright, license headers, upstream provenance, and embedded asset origin for every resource before redistribution; unverified assets remain unavailable to bundles and fixtures.',
      'Run the aggregate materializer from pinned inventory plus reviewed family manifests, then re-enumerate independently and compare exact path/hash sets.',
    ],
    fixture: 'FIX-RES-ALL-PATHS, FIX-RES-TEXTUREPACK-ROOTS, FIX-RES-DYNAMIC-RENDERDATA, FIX-RES-DEFINITION-FILES, FIX-RES-COLORSCHEME-LOAD-ORDER, FIX-RES-PACK-METADATA, FIX-RES-MISSING-CORRUPT-OVERSIZED, FIX-RES-THIRD-PARTY-LICENSE-BOUNDARY, and FIX-RES-PAPER-ONLY-PLATFORM-BOUNDARY.',
    fail: 'Any path/hash mismatch, unclassified resource, path-only exclusion, unresolved dynamic loader, guessed license, missing renderer consumer, missing per-path owner/fixture/reference/test, or unsafe archive size/zip-bomb behavior fails this phase.',
    command: 'node spec/map/plan/tools/materialize-resource-inventory.mjs --source-root <pinned-source-root> --git-dir <pinned-git-dir> --check && node spec/map/plan/tools/materialize-resource-catalog-candidates.mjs --check && node spec/map/plan/tools/validate-plan-coverage.mjs && node --test spec/map/plan/tools/tests/test-materialize-resource-catalog-candidates.mjs spec/map/plan/tools/tests/test-materialize-colorscheme-resource-candidates.mjs spec/map/plan/tools/tests/test-materialize-web-resource-exclusion-candidates.mjs spec/map/plan/tools/tests/test-materialize-resource-disposition-candidates.mjs && git diff --check',
    gate: 'The independent pinned resource path/hash set exactly matches the plan ledger; every path has a scheduled, evidence-producing consumer/license/scope decision, and every renderer resource reaches a concrete resolver, version profile, fixture, Java reference, and focused test before the implementation phase begins.',
  },
  '016': {
    source: 'ColorScheme, DefaultHDShader biome color resolution, every CustomColorMultiplier, biome lookup, grass/foliage/water tint, and material alpha/emission',
    output: 'Rust biome/color-scheme resolver with exact Dynmap file precedence, interpolation, per-version RGBA tables, and missing-data failures',
    tasks: [
      'Port the pinned ColorScheme file-open order: biome_rainfall_temp.txt, default.txt, then the configured preset; reproduce comment/blank handling, token parsing, block/biome indexing, later-file override precedence, and rainfall/temperature interpolation.',
      'Resolve the selected scheme exactly as DefaultHDShader does; reject path traversal, absent files, malformed/truncated rows, and invalid block or biome indices instead of synthesizing colors.',
      'Port every pinned CustomColorMultiplier and grass/foliage/water lookup with exact biome identity, sample coordinates, neighbor reads, and version-specific table values.',
      'Preserve material opacity, cutout, translucent, emissive, and alpha-compositing inputs; do not infer material behavior from texture color alone.',
      'Bind colormap/resource hashes and record raw biome ID, selected scheme, winning override file, interpolation inputs, and final RGBA in the Java reference trace.',
    ],
    fixture: 'Every pinned scheme path plus selected custom scheme; three-file load/override order; malformed, missing, truncated, out-of-range inputs; same block across distinct biomes; tint on/off; grass, foliage, water, and each custom multiplier.',
    fail: 'Fixed or guessed biome color, defaulting missing biome/table data, changed multiplier order, unverified colormap bytes, path traversal, or guessed material alpha fails this phase.',
    command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core shaders::color && bun run test:map:reference && node spec/map/plan/tools/materialize-colorscheme-resource-candidates.mjs --check && git diff --check',
    gate: 'ColorScheme parsing/load order, biome identity, multiplier output, material class, and sampled RGBA trace match the pinned Java reference for every in-scope resource/version fixture.',
  },
};
for (const phase of corePhases) Object.assign(phase, phasePlanOverrides[phase.n] ?? {});

const readPhaseDetail = async (name) => (await readFile(resolve(planRoot, 'phase-details', name), 'utf8')).trimEnd();
const resourceClosureDetail = await readPhaseDetail('phase-001-resource-closure.md');
const legacyTerrainTextureDetail = await readPhaseDetail('phase-014-legacy-terrain-texture-map.md');
const colorSchemeDetail = await readPhaseDetail('phase-016-color-scheme.md');

const ownerFor = (entry) => {
  const name = entry.sourcePath.split('/').at(-1).replace(/\.java$/, '');
  if (entry.sourcePath.includes('/hdmap/renderer/')) return `phases/builtins/${slug(name)}.md`;
  if (entry.sourcePath.includes('DynmapCoreAPI/')) return 'phases/phase-019-custom-renderer-api.md';
  if (/^(HDPerspective|IsoHDPerspective|Matrix3D|Vector3D|IndexedVector3D)/.test(name)) return 'phases/phase-009-dynmap-matrix-perspective.md';
  if (/^(PatchDefinition|PatchDefinitionFactory|Polygon)$/.test(name)) return 'phases/phase-010-dynmap-patch-geometry.md';
  if (/^(MapChunkCache|MapIterator|BlockStep|TileFlags|VisibilityLimit|RoundVisibilityLimit|RectangleVisibilityLimit)$/.test(name)) return 'phases/phase-011-dynmap-voxel-traversal.md';
  if (/^(HDBlockModel|HDBlockModels|HDScaledBlockModels|HDBlockPatchModel|HDBlockVolumetricModel|CustomBlockModel|HDBlockStateTextureMap)$/.test(name)) return 'phases/phase-013-hd-block-model-registry.md';
  if (/^(TexturePack|TexturePackLoader)$/.test(name)) return 'phases/phase-014-texture-pack-and-atlas.md';
  if (name === 'CTMTexturePack') return 'phases/phase-015-ctm-texture-pack.md';
  if (name.endsWith('ColorMultiplier')) return 'phases/phase-016-biome-color-material.md';
  if (/Lighting$|^LightLevels$/.test(name)) return 'phases/phase-017-hd-lighting.md';
  if (/Shader$|ShaderState$/.test(name)) return 'phases/phase-018-hd-shader.md';
  if (/^(DynmapBufferedImage|ImageIOManager)$/.test(name)) return 'phases/phase-022-raster-compositing.md';
  if (/^(HDMap|HDMapManager|HDMapTile|DynmapLogger|ForgeConfigFile|IpAddressMatcher)$/.test(name)) return 'phases/phase-000-source-ast-closure.md';
  if (/^(DataBitsPacked|BlockStateParser|BufferInputStream|BufferOutputStream)$/.test(name)) return 'phases/phase-007-saved-anvil-common-decoder.md';
  return 'phases/phase-006-source-independent-domain.md';
};

const versionMetadata = (entry) => [
  '| 項目 | exact matrix value |',
  '| --- | --- |',
  `| release/time | ${entry.minecraftVersion} / ${entry.releaseTime ?? 'matrix未記録'} |`,
  `| official version JSON | ${entry.officialVersionManifestEntry ?? '未記録。公式manifestから取得して固定する'} |`,
  `| client JAR | ${entry.clientJar ? `${entry.clientJar.url}; SHA-1 ${entry.clientJar.sha1}; ${entry.clientJar.byteLength} bytes` : '未記録'} |`,
  `| server JAR | ${entry.serverJar ? `${entry.serverJar.url}; SHA-1 ${entry.serverJar.sha1}; ${entry.serverJar.byteLength} bytes` : '未記録'} |`,
  `| asset index | ${entry.assetIndex ? `id ${entry.assetIndex.id}; SHA-1 ${entry.assetIndex.sha1}; ${entry.assetIndex.byteLength} bytes; ${entry.assetIndex.url}` : '未記録'} |`,
  `| DataVersion / minimum Java | ${entry.dataVersion ?? '未取得。公式server artifactから抽出'} / ${entry.minJavaVersion ?? '未取得。公式version JSONから抽出'} |`,
  `| Paper version catalog | ${matrix.paperVersionListingSnapshot?.listedExactMinecraftVersions?.includes(entry.minecraftVersion) ? 'exact version listed; build/channel/artifact unverified' : 'exact version not listed in 2026-09-23 snapshot'} |`,
  `| Paper build / jar SHA-256 | ${entry.paperBuild ?? '未登録'} / ${entry.paperJarSha256 ?? '未登録'} |`,
  `| Anvil / Paper snapshot / reference | ${entry.anvilAdapter ?? '未登録'} / ${entry.paperSnapshotAdapter ?? '未登録'} / ${entry.referenceCapture ?? '未登録'} |`,
  `| matrix state | ${entry.status}; artifact ${entry.artifactStatus} |`,
].join('\n');

const compareVersionIds = (left, right) => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

const previousStableRelease = (version) => {
  const sorted = [...matrix.entries].sort((left, right) => compareVersionIds(left.minecraftVersion, right.minecraftVersion));
  const index = sorted.findIndex((entry) => entry.minecraftVersion === version);
  return index > 0 ? sorted[index - 1].minecraftVersion : null;
};

const stageDefinition = (stage, version) => ({
  assets: {
    title: 'renderer asset delta audit and compatibility assignment', purpose: 'このexact releaseの実client JAR・asset-index・runtime registryを直前stable releaseと比較し、データ差分とRust implementation-profile差分を分けて証明する。',
    tasks: ['version-matrix.jsonのexact client JAR、version JSON、asset-index JSONを公式SHA-1/lengthと実取得bytesで照合し、各取得ファイルのSHA-256を保存する。', 'client JAR ZIP entryとasset-index object mappingを別々に完全inventory化し、両rootの実bytesを検証する。JAR内resourceとindex objectのどちらか片方に全assetsがあると仮定しない。', '両rootからprovenanceを保持したcanonical logical-resource mapを作る。source path、logical path、official SHA-1/size、downloaded SHA-256、consumer/model edge、version-specific runtime precedenceを記録する。同一logical pathの同一bytesだけdeduplicate可。異なるbytesはexact runtime source resolutionでdeterministic precedenceを証明し、rule fixture/referenceを残すまではfailureとする。', 'blockstate→variant/multipart selector→resolved model graph（model inheritance/texture variable/geometry/face）→texture/metadataのrenderer closureを両rootから解決し、added/removed/changed block registry ID・full state property/value・selector・model edge・texture pixel/alpha digest・biome/material/light/emission・source locationのdelta entryを`version-deltas/${version}/assets.json`へ記録する。', '完全なclientJarEntries、assetIndexObjects、canonicalResourceMap、blockRegistry、blockStates、resolvedModelGraph、rendererAssetClosure inventoryを生成し、exact target/baseline artifactsへ結びつける。unmapped block/state、missing/unverified bytes、unresolved edge、ambiguous/conflicting sourceをcoverage failureにする。', '全new/changed renderer-visible stateをfixture→exact-version Dynmap trace→Rust pixel comparisonへ結ぶ。removed/renamed stateは既存world chunk decode behaviorもfixture化し、resource filename差分だけを新ブロック証拠にしない。', 'データ差分があっても、既存汎用implementation profileですべてのchanged-state fixturesがreference parityを通る場合はそのprofileを再利用し、版固有adapterは作らない。現行profileで失敗する場合だけbehavior-gapと失敗traceを記録し、独立implementation phaseへ送る。', 'renderer-input差分なしと主張する場合は両source-root artifact digest、runtime resource-resolution policy digest、registry/model/resource closure digest、extractor revision、normalized renderer-input fingerprintの一致を保存する。'],
    commit: `test: audit minecraft ${version} renderer asset delta`,
  },
  anvil: {
    title: 'Anvil schema delta audit and decoder-profile assignment', purpose: 'このexact releaseの公式server由来world fixtureから保存形式差分を抽出し、既存Rust decoder profileで扱えるか実fixtureで確認する。',
    tasks: ['exact server JARを公式SHA-1/lengthで検証し、seed/options/edition/level settings/source digestを固定した生成world fixtureを作る。DataVersion整数だけをschema同一性の根拠にしない。', 'dimension別min/max Y、region sector/compression、chunk NBT fields、sections、block/biome palette containerとpacked bit layout、heightmap、sky/block light、block entity、chunk statusをfixture bytesから抽出する。', '直前stable releaseの同一world recipeと比較し、field add/remove/rename/type/encoding changesを`version-deltas/${version}/anvil.json`へ記録する。no-diffはnormalized schema fingerprint一致を要する。', '実schemaが異なる場合も、既存generic decoder profileがその差分を正しく扱えるか exact fixture/reference domain digestで試験する。既存profileが拒否・誤解するsemantic layout差がある場合だけversion adapter phaseを作り、差分・失敗trace・更新後のdecode evidenceをリンクする。', '1.18のheight expansionとchunk NBT/section/biome layout transitionなど、format boundaryごとに実fixtureを作り、該当する既存または新adapterのdecode/result digestを比較する。', 'negative coordinate、missing/truncated/corrupt section、wrong DataVersion、neighboring region/section boundaryは当該schema profileに対応したfailure fixtureへ割り当てる。'],
    commit: `test: audit minecraft ${version} anvil schema delta`,
  },
  'paper-snapshot': {
    title: 'Paper snapshot compatibility audit', purpose: 'Paperのexact-version build/API/runtime/snapshot差分をrenderer asset/Anvilとは別軸で検証し、共有protocol profileか新しいadapterが必要かを決める。',
    tasks: ['Paper official endpointでexact Minecraft releaseのSTABLE build availabilityを確認し、build number/channel/download SHA-256/Java requirementを保存する。project listingだけではbuild存在をpassにしない。', '隣接Paper profileとのAPI/mapping/runtime差分を調べる。1.20.5のruntime mapping transitionのようにplugin互換に影響する変更候補は独立fixtureへ落とし、実artifact/API差分を確認する。', 'exact buildからloaded/not_loaded snapshotを取得し、request/server/world/dimension/chunk/version/DataVersion identity、palette/biome/height/sky/block lightをwire fixtureへ記録する。', '既存protocol/provider profileでexact snapshotを同じChunkViewへ変換できるか確認する。全差分が同profileで通るなら再利用し、wire/API/data-contractのbehavior gapが証明された場合のみ別Paper adapter phaseを作る。', 'Paper build不在は`liveCompatibility=unavailable`として記録する。これをsaved Anvil rendererのversion statusへ波及させたり、Paper support済みと表示したりしない。', 'queue full/timeout/reconnect/malformed/world mismatchは個別failure fixtureとし、terrain emptyに正規化しない。'],
    commit: `test: audit minecraft ${version} paper snapshot compatibility`,
  },
  'reference-and-parity': {
    title: 'version-delta Java reference and pixel parity', purpose: 'この版で追加/変更されたrenderer input/state、Dynmap version-specific source change、format-boundary fixtureについて対応済みJava referenceとRust outputを比較する。',
    tasks: ['`version-deltas/${version}/assets.json`、`anvil.json`、`dynmap-oracle.json`、`dynmap-source-delta.json`で列挙された全renderer-visible/data/source changeをfixtureへ展開し、変更なしはhash-verified shared-profile fixtureへ割り当てる。', '選定済みの`selected exact-version Dynmap source revision`でreference harnessをbuild・実行し、source capabilityとMinecraft releaseの適合を確認する。pinned baselineを無条件にreferenceに使わない。', 'ray origin/direction/step/hit/face/patch/UV/rotation/shade/light/alpha/projected pixelとversion-specific resolution branchをcaptureする。', 'reference trace/PNGはtest時に生成せず、capture source commit、input digest、exact client/server/asset digest、toolchain、PNG hashを固定する。', 'normalized RGBAをpixel単位比較し、差異をspecific block/state/resource/Anvil profile/Dynmap source symbolへ帰属させる。release IDだけを変えたshared goldenは認めない。'],
    commit: `test: verify dynmap parity for minecraft ${version}`,
  },
  'real-acceptance': {
    title: 'exact-version real acceptance', purpose: 'このreleaseの観測済みdata profileと実Paper availabilityに基づき、saved/live renderer product pathの対応状態を確認する。',
    tasks: ['exact version-delta profileとSHA-pinned Minecraft client assetを選択し、実world Anvil sourceから代表的なnew/changed block statesが出るtileを生成する。', 'Paper stable buildがある場合のみ、そのexact build/Core artifactでplugin load、hello/heartbeat、loaded/unloaded snapshotを確認する。Paper unavailableはlive support unavailableとして記録し、renderer asset/Anvil passと混ぜない。', '実Paper環境ではsaved/live same-chunk digest、tile cache reuse、failure state、consent gateを確認する。', 'renderer-wide UI acceptance（zoom 8→0、cursor/edge anchor、pan、adjacent tile、old layer retention）は全version profile boundaryと各異なるasset/Anvil/Paper profileで実施し、版固有表示/adapter差分も確認する。', 'UIからPaperを停止し、Java process終了とport 25565解放を記録してからdebug appを閉じる。'],
    commit: `test: record real map acceptance for minecraft ${version}`,
  },
}[stage]);

const versionPage = (entry, stage, phaseNode) => {
  const definition = stageDefinition(stage, entry.minecraftVersion);
  const resolvedTasks = definition.tasks.map((task) => task
    .replaceAll('${version}', entry.minecraftVersion)
    .replaceAll('version-deltas/', 'spec/map/evidence/version-deltas/'));
  return [
    `# V-${entry.minecraftVersion}-${stage}: ${entry.minecraftVersion} ${definition.title}`,
    '',
    phaseContractBlock(phaseNode),
    '',
    '## exact version identity',
    '',
    '- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。',
    `- 直前stable release: ${previousStableRelease(entry.minecraftVersion) ?? 'baseline (no earlier supported release)'}`,
    `- Required delta reports: assets=\`spec/map/evidence/version-deltas/${entry.minecraftVersion}/assets.json\`, Anvil=\`spec/map/evidence/version-deltas/${entry.minecraftVersion}/anvil.json\`, Dynmap oracle=\`spec/map/evidence/version-deltas/${entry.minecraftVersion}/dynmap-oracle.json\`, Dynmap source delta=\`spec/map/evidence/version-deltas/${entry.minecraftVersion}/dynmap-source-delta.json\`, Paper=\`spec/map/evidence/version-deltas/${entry.minecraftVersion}/paper.json\`, parity=\`spec/map/evidence/version-deltas/${entry.minecraftVersion}/parity.json\`.`,
    '- current version matrix record:',
    '',
    versionMetadata(entry),
    '',
    '## 目的と依存',
    '',
    definition.purpose,
    '',
    '## データ差分と実装profileの判定',
    '',
    'このrelease固有のデータ差分は省略せず記録・fixture化する。一方、データfingerprintが違うことだけを理由にRust adapterを追加しない。既存汎用profileが全対象difference caseでexact-version reference parityを通せば共有し、既存profileで再現できないformat/API/render behavior gapが具体的traceで確認された場合だけ、phase graphに独立したadapter実装phaseを追加する。データfingerprint一致はno-delta判定の条件であり、implementation profile共有の唯一条件ではない。',
    '',
    '- 入力契約: 上表の公式release artifact、dynmap-oracle reportが選定したexact-version対応Dynmap source/build、shared renderer contract。',
    '- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。',
    '- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。',
    '',
    '## 個別作業',
    '',
    ...resolvedTasks.map((task, index) => `${index + 1}. ${task}`),
    '',
    '## 失敗と検証',
    '',
    'artifact unavailable、digest/size mismatch、Paper build不存在、DataVersion mismatch、malformed input、asset missing、reference difference、real environment unavailableは個別のfailed/blocked証拠として記録する。隣接版、mock、fixture-only、bridge connectedのみでこの版をpassにしない。',
    '',
    '```bash',
    `bun scripts/run-map-version-phase.mjs --version ${entry.minecraftVersion} --phase ${stage}`,
    `bun scripts/check-map-version-phase.mjs --version ${entry.minecraftVersion} --phase ${stage} --require-evidence`,
    '```',
    '',
    '両runnerはphase 002で作る。PASSはexact version/stage、artifact digest、fixture/reference identity、focused result、evidence IDを含む場合だけ許可する。入力未取得時はexit failureにする。',
    '',
    '## Commit',
    '',
    '```text',
    definition.commit,
    '```',
  ].join('\n');
};

const corePage = (phase, phaseNode) => [
  `# P-${phase.n}: ${phase.title}`,
  '',
  phaseContractBlock(phaseNode),
  '',
  '## 目的と固定対象',
  '',
  `- 対象source/symbol: ${phase.source.replace(/[。．.]$/, '')}。詳細な宣言IDはP-000 AST ledgerを正とする。`,
  `- Rust destination / output: ${phase.output}。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。`,
  `- 依存phase: ${phase.depends}。依存gateが未達のまま、このphaseを実装済みにしない。`,
    '- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。',
  '',
  '## 入力・failure contract',
  '',
  '入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。',
  `このphase固有の失敗条件: ${phase.fail}`,
  '',
  '## 実装作業',
  '',
  ...phase.tasks.map((task, index) => `${index + 1}. ${task}`),
  ...(phase.n === '000' ? [
    '',
    '## Current full-tree candidate inventory (not closure proof)',
    '',
    `- The independently materialized source tree has ${astInventory.counts.sourceFiles.toLocaleString('en-US')} Java files, ${astInventory.counts.declarations.toLocaleString('en-US')} stable declarations, and ${astInventory.counts.referenceCandidates.toLocaleString('en-US')} syntax reference candidates.`,
    `- The attributed candidate graph records ${dependencyCandidates.counts.semanticReferences.toLocaleString('en-US')} semantic references, ${dependencyCandidates.counts.resolvedPinnedDeclarationEdges.toLocaleString('en-US')} pinned declaration edges, ${dependencyCandidates.counts.unmatchedSemanticReferences.toLocaleString('en-US')} unmatched semantic references, ${dependencyCandidates.counts.externalReferenceGroups.toLocaleString('en-US')} external reference groups, ${dependencyCandidates.counts.dynamicStringReviewCandidates.toLocaleString('en-US')} dynamic-string review candidates, ${dependencyCandidates.counts.importResolutionCandidates.toLocaleString('en-US')} import-resolution candidates, ${dependencyCandidates.counts.manualSuperDispatchReviewCandidates.toLocaleString('en-US')} manual super/this dispatch candidates, and ${dependencyCandidates.counts.javacAnalysisDiagnostics.toLocaleString('en-US')} javac analysis diagnostics.`,
    `- All ${dependencyCandidates.unmatchedSemanticReferences?.length?.toLocaleString('en-US') ?? 0} unmatched semantic references retain their stable IDs, source spans, compiler resolution, and available context. Resolution breakdown: ${Object.entries(unmatchedSemanticResolutionCounts).map(([resolution, count]) => `${resolution}=${count.toLocaleString('en-US')}`).join(', ')}. Each row must be resolved or evidence-backed as an adapter boundary/exclusion; none may be silently dropped as compiler noise.`,
    `- These are candidate totals, not reviewed renderer dependencies. The dependency inventory status is \`${dependencyCandidates.status}\`; P-000 must resolve or justify every applicable candidate and must not set closure complete based on matching counts alone.`,
    `- The current dependency-edge ledger records ${sourceDependencyEdges.resolvedReferenceCandidateCount.toLocaleString('en-US')} classified AST reference candidates and ${sourceDependencyEdges.unresolvedReferenceCandidateCount.toLocaleString('en-US')} unresolved candidates out of ${sourceDependencyEdges.referenceCandidateCount.toLocaleString('en-US')}; its status is \`${sourceDependencyEdges.status}\`. The unresolved count is assigned to P-000 only and is not semantically resolved.`,
    '- Open-candidate evidence is preserved in `source-dependency-edges.json#/unresolved/0` and the exact inventories listed below. The P-000 workflow must join every AST reference candidate by source path, span, context, and kind, then record each target or evidence-backed boundary/exclusion; count-only closure is forbidden.',
    '- Current supplemental candidate families include unmatched semantic references, external reference groups, lexical binding groups, dynamic strings, imports, manual super/this dispatch, and javac diagnostics. These group counts can overlap and are investigation indexes, not a partition of the AST candidate total.',
  ] : []),
  ...(phase.n === '001' ? resourceClosureDetail.split('\n') : []),
  ...(phase.n === '014' ? legacyTerrainTextureDetail.split('\n') : []),
  ...(phase.n === '016' ? colorSchemeDetail.split('\n') : []),
  ...(phase.n === '002' ? [
    '',
    '## Dynmap oracle source lineage',
    '',
    '- `93b454efb8802dc7406d6873434f2aeec5c636f4`は共通behavior baselineやが、後発Minecraft releaseへの対応を自動的に証明せえへん。各releaseで対応するDynmap source commit/module/buildを、version-specific adapter、block mapping、registry/registration path、実build evidenceから個別に選定する。',
    '- baseline以後のsource revisionを使うreleaseではrenderer-relevant Java symbol/resource diffを全件AST/resource ledgerへ追加し、Rust destination、fixture、Java trace、testを割り当てる。source deltaが未分類ならreleaseを未対応とする。',
    '- `spec/map/evidence/version-deltas/<version>/dynmap-oracle.json`はselected source revision/tree digest、exact release support evidence、reference build digest、baselineとの差分manifest、new/changed block-state renderer mapping coverageを持つ。固定pinをそのまま流用しただけのreportはstrict gateで拒否する。',
    '- 26.1の調査入口: Mojang公式release notesはworld storage/data format変更、lightmap algorithmの書き換え、Golden Dandelion/block texture追加、tripwire alpha-cutout、block-state rendering変更を記載する。これらをcandidate listとして実client/server artifactsから検証し、実際にrenderer入力へ影響する項目だけを差分とする。',
    '- upstream Dynmap PR #4271は26.2 mapping作業でSulfur/Cinnabar family、Sulfur Spike、Golden Dandelion、`creaking_heart` property変更、special-rendered Copper Golem Statueのcube approximationを挙げている。これは発見用leadであり、未merge PRをrelease supportやparity proofに使わない。',
    '- vendored `ChunkVersionHDShader`のDataVersion表は1.21.0 / 3953で終わるが、これはそのshaderの表の範囲だけを示す。renderer全体の対応可否はsymbol/data/resource単位で別に証明する。',
    '',
    '## バージョン対応をpassにする実データ証拠',
    '',
    '- 版別asset対応はclient JARとasset-indexの両rootから作る。client JARのZIP entries、asset-index JSON、renderer-consumed object bytesを独立してexact digest/size検証し、どちらか片方に全resourcesがあると仮定しない。',
    '- `canonical logical-resource map`はclient-JAR ZIP entry inventoryとasset-index object inventoryの両方を含み、各pathの出所を保持する。`deterministic source precedence`は対象Minecraft runtimeで実証した規則だけを使い、同一pathの異なるbytesを推測で優先しない。',
    '- `client-jar-entry-inventory.json`はdirect JAR entry path/CRC/uncompressed size/bytes SHA-256/consumerを、`asset-object-inventory.json`はlogical path/index object SHA-1/size/downloaded SHA-256/consumer edgeを固定する。`canonical-resource-map.json`は両方のsource provenanceとruntime-proven precedenceを結び、conflicting same-path bytesを根拠なく選ばない。',
    '- `spec/map/evidence/version-deltas/<version>/assets.json` schema v2は、client JAR entries、asset-index objects、canonical resource map、runtime block registry、full block-state inventory、resolved model graph、renderer-only asset closureのmanifest path/hash/countをexact target/baseline digestへbindし、各added/removed/changed entryにstable change ID、render-impact classification、理由またはfixture/reference ownerを持つ。新規・変更stateはstate→selector→model graph→verified texture bytes→fixture→Dynmap trace→Rust pixel比較まで追跡する。',
    '- 1.14/26.3の実JARと26.3 asset-index probeは[version asset container audit](../version-asset-container-audit.md)に固定したpackaging-layout regression evidenceであり、48-release semantic deltaやversion supportの証拠には数えない。',
    '- saved-world対応はexact releaseのworld bytesからdimension height、region compression、chunk NBT、section/palette/packed states、biome、heightmap、sky/block light、block entityを抽出する。`DataVersion`だけではschema deltaを確定できないためfixture bytesとnormalized schema fingerprintが必要や。fingerprintが違うAnvil schemaも、既存decoder profileが全変更fixtureを正しく処理すれば同じimplementation profileを共有できる。',
    '- `no_renderer_visible_delta`は両releaseのartifact digestとinput/schema fingerprintが一致したときだけ許可する。空配列、同じversion family、隣接patchの結果だけではno-diffにできない。異なるfingerprintの差分を同じコードprofileで扱うには、変更IDごとのexact fixture/reference trace/pixel comparisonが全件必要で、adapterは観測されたbehavior gapに限る。',
    '- Paperはclient asset/Anvilのどちらとも別軸にする。exact stable buildの有無/API/runtime/mapping/snapshot wireを個別に記録し、Paper live unavailableでもsaved Anvilのrenderer statusを変えない。',
    '- first release (`1.14`) はprevious release比較ではなくabsolute baseline inventoryと全state coverageを作る。後続releaseは直前のofficial stable releaseと比較する。',
  ] : []),
  '',
  `- 固定fixture / reference: ${phase.fixture}`,
  '- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。',
  '',
  '## 検証gate',
  '',
  `- 合格条件: ${phase.gate}`,
  '- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。',
  '- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。',
  '',
  '```bash',
  phase.n === '002'
    ? `${phase.command.replace('--require-artifact-diffs', '--require-artifact-diffs --require-dynmap-oracle')} && bun spec/map/plan/tools/validate-plan.mjs --require-dynmap-oracle`
    : phase.command,
  'git diff --check',
  '```',
  '',
  '## 完了状態の記録',
  '',
  '完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。',
  '',
  '## Commit',
  '',
  'このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。',
  '',
  '```text',
  phase.commit,
  '```',
].join('\n');

const coreIndex = corePhases.map((phase) => `| P-${phase.n} | ${phase.title} | ${link(`phases/phase-${phase.n}-${phase.file}.md`, 'phase file')} | ${phase.depends} | \`${phase.commit}\` |`).join('\n');
add('phase-index.md', `# MC-Vector Map Renderer Phase Index

基準: 2026-09-23。全体Goalの完了条件は[definition-of-done.md](definition-of-done.md)、継続実行指示は[goal-prompt.md](goal-prompt.md)。phaseは依存順に進め、失敗を別phaseのpassで覆わない。

## 共通実装phase

| ID | 内容 | 個別phase | 依存 | 独立commit message |
| --- | --- | --- | --- | --- |
${coreIndex}

## 必須の個別phase

- [built-in renderer個別phaseとversion stage index](phases/generated-index.md)
- 各exact stable release（snapshot時点48件）にはassets / Anvil / Paper snapshot / reference parity / real acceptanceの個別検証文書を持つ。ただし240というページ数はversion coverageを意味しない。全releaseのblock/state/model/texture・chunk schemaの実差分台帳が先に完成する。データfingerprintが同じ場合だけno-deltaとする。データfingerprintが異なる場合はchange IDごとのfixture/reference trace/pixel parityが通れば既存generic profileを共有でき、別adapterは既存profileの失敗が実測された場合にだけ作る。
- AST closureで追加されるpinned source class/method group/resource consumerにもimplementation phaseを追加する。予定済み件数でclosureを切らない。

## 実行順

1. P-000〜P-005でsource/resource/version/license/oracle/crate境界を確定する。
2. P-006〜P-023でdomain、必要なversion adapters、Dynmap renderer、built-insを実装し、catalog確定後の全個別renderer phaseを各自で完了する。
3. [P-002のrenderer data delta実行詳細](phase-details/phase-002-renderer-data-delta.md)に従って、全releaseのrenderer asset・Anvil schema deltaを実artifactから確定する。その後、全exact releaseのverification stageを実差分とprofile ownerに沿って実施し、現行generic implementationで処理できないbehavior gapだけを追加adapter phaseへ分ける。
4. P-024〜P-025でPaper protocolとsaved/live equivalenceを完成する。
5. P-026〜P-034でtile/cache/scheduler/IPC/UI/zoom/failure/security/CIを接続する。
6. 全matrix版のreal acceptance pageを実施する。Paper unavailableな版はblockedでありpassではない。
7. P-035が版別acceptance証拠を統合し、P-036が全source/resource/version/feature coverageをfail-closedで監査する。

一つの巨大phaseをまとめてcommitしない。各個別built-in、実差分から導いたversion profile/adapter、追加source method groupを一つのレビュー可能な作業単位とし、他のunrelated changesをstageせえへん。
`);

const sourceCatalog = await readJson('spec/map/coverage/source-symbols.json');
const resourceCatalog = await readJson('spec/map/coverage/resources.json');
const sourceDispositionLedger = await readJson('spec/map/coverage/source-symbol-dispositions.json');
const sourceDependencyEdges = await readJson('spec/map/coverage/source-dependency-edges.json');
const dependencyCandidateBytes = await readFile(resolve(repoRoot, 'spec/map/coverage/source-dependency-candidates.json.gz'));
const dependencyCandidates = JSON.parse(gunzipSync(dependencyCandidateBytes).toString('utf8'));
const unmatchedSemanticResolutionCounts = (dependencyCandidates.unmatchedSemanticReferences ?? []).reduce((counts, reference) => {
  counts[reference.resolution ?? 'unresolved'] = (counts[reference.resolution ?? 'unresolved'] ?? 0) + 1;
  return counts;
}, {});
const builtinCatalog = await readJson('spec/map/coverage/builtin-renderers.json');
const matrix = await readJson('spec/map/coverage/version-matrix.json');
const versionDeltas = await readJson('spec/map/coverage/version-delta-matrix.json');
const astInventoryBytes = await readFile(resolve(repoRoot, 'spec/map/coverage/java-ast-inventory.json.gz'));
const resourceInventoryBytes = await readFile(resolve(repoRoot, 'spec/map/coverage/pinned-resource-inventory.json.gz'));
const sourceRootCandidateAuditBytes = await readFile(resolve(repoRoot, 'spec/map/coverage/source-root-candidate-audit.json.gz'));
const astInventory = JSON.parse(gunzipSync(astInventoryBytes).toString('utf8'));
const resourceInventory = JSON.parse(gunzipSync(resourceInventoryBytes).toString('utf8'));
const sourceRootCandidateAudit = JSON.parse(gunzipSync(sourceRootCandidateAuditBytes).toString('utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (sourceCatalog.entries.length === 0 || resourceCatalog.entries.length === 0 || builtinCatalog.entries.length === 0 || matrix.entries.length === 0) throw new Error('Coverage catalogs must be non-empty');
if (matrix.entries[0].minecraftVersion !== matrix.range.minimum || matrix.entries.at(-1).minecraftVersion !== matrix.range.maximum) throw new Error('Version matrix entries do not match the recorded manifest snapshot boundaries');
for (const catalog of [sourceCatalog, resourceCatalog, builtinCatalog]) if (catalog.sourceRevision !== revision) throw new Error('Dynmap revision mismatch');
if (astInventory.sourceRevision !== revision || resourceInventory.sourceRevision !== revision || astInventory.sourceTreeSha1 !== resourceInventory.sourceTreeSha1) throw new Error('Pinned source inventory provenance mismatch');
if (sourceRootCandidateAudit.sourceRevision !== revision || sourceRootCandidateAudit.sourceTreeSha1 !== astInventory.sourceTreeSha1
    || sourceRootCandidateAudit.status !== 'open_overinclusive_file_seed_not_renderer_closure') throw new Error('Source-root experiment is missing, stale, or incorrectly marked closed');

for (const entry of builtinCatalog.entries) {
  entry.phaseId = `B-${slug(entry.class)}`;
  entry.phaseDocument = `phases/builtins/${slug(entry.class)}.md`;
}
add('../coverage/builtin-renderers.json', JSON.stringify(builtinCatalog, null, 2));

const phaseGraph = buildPhaseGraph({
  corePhases,
  builtinEntries: builtinCatalog.entries,
  versionEntries: matrix.entries,
  stageNames,
});
const phaseGraphErrors = validatePhaseGraph(phaseGraph);
if (phaseGraphErrors.length > 0) throw new Error(`Invalid phase dependency graph:\n- ${phaseGraphErrors.join('\n- ')}`);
const phaseNodesById = new Map(phaseGraph.nodes.map((node) => [node.id, node]));
add('coverage/phase-graph.json', JSON.stringify(phaseGraph, null, 2));

let sourceLines = 0;
for (const entry of sourceCatalog.entries) {
  const upstream = resolve(repoRoot, 'src-tauri/crates/map-renderer-core/third_party/dynmap/upstream', entry.sourcePath);
  sourceLines += (await readFile(upstream, 'utf8')).split('\n').length - 1;
}

const sourceMap = sourceCatalog.entries.map((entry) => ({ sourcePath: entry.sourcePath, candidateRustDestination: entry.destination, candidateOwnerDocument: ownerFor(entry), classification: 'candidate_requires_ast_call_and_resource_review' }));
add('coverage/source-phase-map.json', JSON.stringify({ schemaVersion: 1, revision, trust: 'candidate ownership map only; not proof of complete dependency closure or implementation', entries: sourceMap }, null, 2));
const sourceTable = sourceMap.map((entry, index) => `| ${index + 1} | ${entry.sourcePath} | ${link(`../${entry.candidateOwnerDocument}`, entry.candidateOwnerDocument.split('/').at(-1))} | ${entry.candidateRustDestination} | AST review required |`).join('\n');
add('coverage/source-candidates.md', `# Pinned Java source candidate inventory

Baseline 2026-09-23: ${sourceCatalog.entries.length} candidate Java files, ${sourceLines.toLocaleString('en-US')} lines, revision ${revision}. This is the existing package-prefix snapshot, not a proven renderer dependency closure. Phase 000 recursively follows renderer call/data/resource dependencies and adds any required upstream file missing here.

The existing 1,489 lexical rows are not authoritative symbols: the extractor uses regular expressions, counts control-flow tokens as methods, and collapses overloads by name. Phase 000 replaces them with compiler AST records for declarations, signatures, fields, enum constants, references, source span, and stable ID.

| # | Pinned source | Candidate owner | Current Rust destination hint | Gate |
| ---: | --- | --- | --- | --- |
${sourceTable}
`);

const resourceScopes = Object.fromEntries([...new Set(resourceCatalog.entries.map((entry) => entry.scope))].map((scope) => [scope, resourceCatalog.entries.filter((entry) => entry.scope === scope).length]));
const directLegacyTerrainResourceCount = resourceCatalog.counts.plannedLegacyTerrainRuntime ?? 0;
const directLegacyTerrainSlotCount = resourceCatalog.counts.legacyTerrainMappingSlots ?? 0;
const directLegacyTerrainNonNullSlotCount = resourceCatalog.counts.legacyTerrainNonNullSlots ?? 0;
const statusCounts = (records, key) => Object.fromEntries([...new Set(records.map((entry) => entry[key]))].map((status) => [status, records.filter((entry) => entry[key] === status).length]));
const anvilVersions = matrix.entries.filter((entry) => entry.anvilAdapter).map((entry) => `${entry.minecraftVersion} (${entry.dataVersion})`);
const paperVersions = matrix.entries.filter((entry) => entry.paperBuild || entry.paperSnapshotAdapter).length;
const referenceVersions = matrix.entries.filter((entry) => entry.referenceCapture).length;
const paperListedVersions = matrix.paperVersionListingSnapshot?.listedExactMinecraftVersions ?? [];
const paperUnlistedVersions = matrix.paperVersionListingSnapshot?.exactMinecraftVersionsNotListed ?? [];
const pendingAssetDeltas = versionDeltas.entries.filter((entry) => entry.rendererAssets.status !== 'verified').length;
const pendingAnvilDeltas = versionDeltas.entries.filter((entry) => entry.savedAnvil.status !== 'verified').length;
const pendingPaperDeltas = versionDeltas.entries.filter((entry) => entry.paperLive.status === 'unverified').length;
const lexicalMethods = sourceCatalog.entries.reduce((sum, entry) => sum + entry.symbols.filter((symbol) => symbol.kind === 'method').length, 0);
const rendererRootRows = sourceRootCandidateAudit.rendererDispatchRoots.map((entry) => `| \`${entry.symbolId}\` | ${entry.sourcePath} | ${entry.startLine}-${entry.endLine} |`).join('\n');
add('coverage/current-catalog-audit.md', `# 現行implementation/evidence台帳の監査

基準日: 2026-09-23。以下は計画開始時点の確認値や。数が載っていることと実装・parityの証拠は分ける。

## Full pinned-tree AST audit

- Pinned Git revision: \`${revision}\`; verified Git tree: \`${astInventory.sourceTreeSha1}\`.
- Durable AST inventory: [\`java-ast-inventory.json.gz\`](../../coverage/java-ast-inventory.json.gz), compressed SHA-256 \`${sha256(astInventoryBytes)}\`, decompressed canonical JSON SHA-256 \`${sha256(gunzipSync(astInventoryBytes))}\`.
- Durable resource path inventory: [\`pinned-resource-inventory.json.gz\`](../../coverage/pinned-resource-inventory.json.gz), SHA-256 \`${sha256(resourceInventoryBytes)}\`; ${resourceInventory.counts.resources.toLocaleString('en-US')} tracked resource paths across all modules, each bound to Git blob SHA-1 and content SHA-256. Resource consumer closure/classification remains open.
- The materializers compare exact pinned Git path sets and verify every source blob before writing. Exact pinned-checkout, Java AST, AST materialization, and resource inventory commands are recorded in [P-000](../phases/phase-000-source-ast-closure.md) and [P-001](../phases/phase-001-resource-closure.md); they use a fresh temporary checkout rather than an assumed local source path.

  \`java spec/map/plan/tools/DynmapAstInventory.java <pinned-source-root> <raw-ast.json> ${revision}\`

- Independent JDK javac syntax-only re-enumeration on 2026-09-23: ${astInventory.counts.parsedFiles.toLocaleString('en-US')}/${astInventory.counts.sourceFiles.toLocaleString('en-US')} parsed files / ${astInventory.counts.declarations.toLocaleString('en-US')} declarations / ${astInventory.counts.referenceCandidates.toLocaleString('en-US')} reference candidates / ${astInventory.counts.parseErrors} parse errors / ${astInventory.counts.duplicateSymbolIds} duplicate symbol IDs. The re-materialized canonical JSON matches the durable inventory; this is syntactic inventory only, reference candidates remain unresolved, and \`semanticDependencyClosureComplete=false\`.
- Current symbol-disposition ledger has ${sourceDispositionLedger.entries.length.toLocaleString('en-US')} rows; ${astInventory.counts.declarations.toLocaleString('en-US')} declarations exist, leaving ${Math.max(0, astInventory.counts.declarations - sourceDispositionLedger.entries.length).toLocaleString('en-US')} without a reviewed disposition. No full declaration scope classification or semantic call/dispatch closure exists yet.
- The ${sourceCatalog.entries.length}-file / ${sourceLines.toLocaleString('en-US')}-line vendored candidate snapshot is not the full Java tree. It omits ${astInventory.counts.sourceFiles - sourceCatalog.entries.length} Java files; no declaration-by-declaration scope classification, semantic call/dispatch closure, or per-symbol implementation owner exists yet.

## Renderer-root calibration (open)

- Reproducible candidate-only experiments: [\`source-root-candidate-audit.json.gz\`](../../coverage/source-root-candidate-audit.json.gz), SHA-256 \`${sha256(sourceRootCandidateAuditBytes)}\`. The whole-file seed deliberately includes every declaration in all ${sourceRootCandidateAudit.counts.candidateSourceFiles} legacy candidate files; the symbol-root run starts from the listed source candidates. Neither run is a closed renderer-root algorithm.
- Whole-file seed result: ${sourceRootCandidateAudit.counts.fileSeedDeclarations.toLocaleString('en-US')} declarations seeded; ${sourceRootCandidateAudit.counts.traversedPinnedEdges.toLocaleString('en-US')} pinned declaration edges traversed; ${sourceRootCandidateAudit.counts.reachableDeclarations.toLocaleString('en-US')} declarations in ${sourceRootCandidateAudit.counts.reachableFiles.toLocaleString('en-US')} reached files, including ${sourceRootCandidateAudit.counts.reachableFilesOutsideCandidateMap} files outside the candidate map; ${sourceRootCandidateAudit.counts.declarationsNotReachedByFileSeed.toLocaleString('en-US')} AST declarations not reached.
- Call-only symbol-root candidate result: ${sourceRootCandidateAudit.counts.rendererRootCandidateDeclarations.toLocaleString('en-US')} declarations in ${sourceRootCandidateAudit.counts.rendererRootCandidateFiles.toLocaleString('en-US')} files through ${sourceRootCandidateAudit.rendererRootReachability.traversedEdges} (${sourceRootCandidateAudit.counts.rendererRootCallEdgesTraversed.toLocaleString('en-US')} traversed call edges). These reached methods expose ${sourceRootCandidateAudit.counts.rendererRootDirectNonCallReferenceEdges.toLocaleString('en-US')} direct non-call reference edges to ${sourceRootCandidateAudit.counts.rendererRootDirectNonCallTargetDeclarations.toLocaleString('en-US')} distinct target declarations; they are reported separately and are not recursively traversed. This remains an open candidate because the graph does not expand virtual/interface dispatch, configuration/reflection registrations, external library implementations, dynamic resource lookup, or manual super/this dispatch.
- The experiment reaches explicit non-renderer review examples (${sourceRootCandidateAudit.reviewExamplesReached.map((entry) => entry.symbolId).join(', ')}), proving whole-file seeding is over-inclusive. It also omits lexical bindings, dynamic strings, unresolved imports, manual super dispatch, external classpath behavior, and configuration/reflection registration not represented by pinned declaration edges. Therefore neither reached nor unreached is a scope disposition.
- Source-verified renderer/registration root candidates and exact pinned source spans are:

| Candidate symbol (not a closed root set) | Pinned source path | Lines |
| --- | --- | ---: |
${rendererRootRows}

  Perspective/shader/lighting/model registration continues through these paths, but the full root set must still be traced through actual configuration values, constructors, registration tables, and dynamic dispatch.
- P-000 remains open until the renderer entry-point/configuration roots and all call/data/registration/reflection/resource edges are source-reviewed, every AST declaration is classified with evidence, every external/boundary edge is justified, and independent re-enumeration finds no omitted renderer behavior. Do not convert this calibration result into a closed dependency ledger.

## Pinned Java source candidate catalog

- ${sourceCatalog.entries.length} files / ${sourceLines.toLocaleString('en-US')} lines。現snapshotはDynmapCoreAPI renderer、DynmapCore hdmap/utilsの候補範囲であり、依存closure確定ではない。
- JSONの1,489 rowsには${lexicalMethods.toLocaleString('en-US')}件のmethod-kind候補があるが、Java regex抽出でif / switch / for / return等をmethodとして誤検出し、overloadも区別しない。AST authorityとして無効。
- 現行Rust destinationはcandidate hint。原典の全call/data/resource dependencyを調べてrequired、adapter-only、excludedを確定する。

## Resources / built-ins

- Pinned resource catalog ${resourceCatalog.entries.length}件: ${Object.entries(resourceScopes).map(([key, value]) => `${key}=${value}`).join(', ')}。Web 161件はsource-confirmed provisional exclusion candidates、color-scheme 12件は\`DefaultHDShader\`/\`ColorScheme\` load pathに紐づくrenderer-runtime candidatesや。いずれもlicense verificationとglobal consumer closureはopen。
- Exact AST/source mapping has identified ${directLegacyTerrainResourceCount} unique standard legacy terrain texture paths from ${directLegacyTerrainSlotCount} numeric mapping slots (${directLegacyTerrainNonNullSlotCount} non-null slots, including repeated names). These exact rows are assigned to P-014 with per-path fixture/reference/test plan IDs, but remain license-unverified and do not close other texture, CTM, model, or version-specific consumers.
- The 3,190 packaged \`assets/minecraft/textures/**\` paths are not all terrain inputs: the exact subtree contains 3,093 PNG and 97 \`.mcmeta\` entries across 15 top-level families. Pinned \`TexturePackLoader\` lookup is custom ZIP/directory → platform resource → optional mod container → packaged standard resource; caller-supplied alternate names are explicit, not singular/plural rewrites. \`TexturePack\` registers and loads the non-null legacy terrain filename maps, while resource-pack CTM scans only its two configured CTM prefixes for \`.properties\` and then resolves their declared tiles. The source builds plural \`textures/blocks/\` paths while the inventory also contains singular \`textures/block/\`; exact consumers still require per-path tracing. See [source-verified lookup evidence](../phase-details/phase-001-resource-closure.md); resource closure remains open.
- \`materialize-resource-catalog-candidates.mjs\` is the sole aggregate catalog generator. It composes per-family candidates with the full pinned inventory and must be run with the focused family tests; generated candidate assignment is not final scope/license proof.
- Vendored upstream snapshotには旧Core-only候補3,485 resourceのうち \`shaders.txt\` 1件しか実体がない。残り3,484 Core resource bytesと別moduleの188 resource bytesは現snapshotに含まれない。現在の3,673-path inventory/catalogはblob/content digestを保持するが、consumer/license/fixture evidenceを代替しない。
- Built-in renderer ${builtinCatalog.entries.length}件。現catalogのtranslated表記はsource mapping statusに過ぎない。全entryでfixture/referenceTrace/pixelGolden/requiredAssetsが空なので、renderer parity未検証として扱う。

## Versions / reference / runtime

- Official release metadata ${matrix.entries.length}件、${matrix.range.minimum}〜${matrix.range.maximum}。status counts: ${JSON.stringify(statusCounts(matrix.entries, 'status'))}。artifactStatus counts: ${JSON.stringify(statusCounts(matrix.entries, 'artifactStatus'))}。公式URL/length/SHA-1 metadataがあってもJAR取得・SHA-256・adapter evidenceとは別。
- Mojang official manifest archive: [\`mojang-version-manifest-${matrix.snapshotDate}.json.gz\`](../../coverage/mojang-version-manifest-${matrix.snapshotDate}.json.gz), raw SHA-256 \`${matrix.officialManifestSnapshot.rawManifestSha256}\`, stable release-set \`${matrix.officialManifestSnapshot.stableReleaseCount}\`件。\`validate-plan.mjs\`が圧縮hash、raw hash/length、release-set hash、version matrixとのexact ID/URL/releaseTime equalityを検証する。
- Version delta ledger: [\`version-delta-matrix.json\`](../../coverage/version-delta-matrix.json), exact releases ${versionDeltas.entries.length}件。asset delta未verified ${pendingAssetDeltas}件、saved-Anvil delta未verified ${pendingAnvilDeltas}件、Paper live未verified ${pendingPaperDeltas}件。これらは現時点でpendingであり、48版対応の実証には数えない。
- Paper official project version listing snapshot (${matrix.paperVersionListingSnapshot?.auditedAt ?? '未記録'}): ${paperListedVersions.length} exact matrix IDs listed、${paperUnlistedVersions.length} exact IDs absent (${paperUnlistedVersions.join(', ')}). これはversion listingのみでbuild channel/build ID/JAR bytes/SHA-256を確認した証拠ではない。
- Anvil adapter matrix登録: ${anvilVersions.join(', ') || 'なし'}。1.21.4 decoder/合成region fixtureが存在しても、captured real world Anvil fixtureや全版parityを証明しない。
- Paper build/snapshot matrix登録 ${paperVersions}件、版別referenceCapture ${referenceVersions}件。Rust 1.21.4 snapshot decoderとprotocol fixtureは存在するが、real Paper plugin/provider通信は未証明。
- Reference harnessはBox/Cuboid/Pane/Plantのpatch trace fixtureを持つ。version-bound real chunk/assetsとreference PNG/pixel hashは未登録。
- real-acceptance-matrix.jsonはglobal blocked、per-version override 0件。per-version evidenceを後続phaseで明示化する。
- Tauri request_map_renderはrenderer_not_connectedを返し、実rendererへのpipeline接続がない。
`);

const generatedIndexRows = [];
for (const phase of corePhases) {
  const node = phaseNodesById.get(`P-${phase.n}`);
  add(`phases/phase-${phase.n}-${phase.file}.md`, corePage(phase, node));
  generatedIndexRows.push(`| common | P-${phase.n} | ${link(`phase-${phase.n}-${phase.file}.md`, phase.title)} | ${phase.source} | ${node.dependsOn.join(', ') || 'none'} |`);
}
for (const entry of builtinCatalog.entries) {
  const node = phaseNodesById.get(entry.phaseId);
  generatedIndexRows.push(`| built-in | ${entry.phaseId} | ${link(`builtins/${slug(entry.class)}.md`, entry.class)} | ${entry.sourcePath} | ${node.dependsOn.join(', ')} |`);
}
for (const entry of matrix.entries) for (const stage of stageNames) {
  const file = stage === 'paper-snapshot' ? 'paper-snapshot' : stage === 'reference-and-parity' ? 'reference-and-parity' : stage === 'real-acceptance' ? 'real-acceptance' : stage;
  const node = phaseNodesById.get(`V-${entry.minecraftVersion}-${stage}`);
  add(`phases/versions/${entry.minecraftVersion}/${file}.md`, versionPage(entry, stage, node));
  generatedIndexRows.push(`| version | ${node.id} | ${link(`versions/${entry.minecraftVersion}/${file}.md`, stage)} | exact release | ${node.dependsOn.join(', ')} |`);
}
add('phases/generated-index.md', `# Generated renderer-specialist phase index

再生成コマンド:
1. \`bun spec/map/plan/tools/generate-phase-files.mjs --write\`でcommon/version phaseとindexを生成する。
2. \`bun spec/map/plan/tools/populate-builtin-plan-pages.mjs --write\`でbuilt-in AST/branch/configuration detailを生成する。
3. \`bun spec/map/plan/tools/validate-plan.mjs --require-plan-complete\`で両generatorとphase graphを照合する。

個別generatorのcheckは \`--check\` を使う。Generatorは古くなったfileを自動削除せえへん。matrix縮小時も削除候補をdiffで人が確認する。

${corePhases.length} common phase、${builtinCatalog.entries.length} built-in candidate page、${matrix.entries.length} exact releases × ${stageNames.length} verification pages = **${corePhases.length + builtinCatalog.entries.length + matrix.entries.length * stageNames.length}個のseed文書**。版別ページ数はcoverage proofではない。P-002のartifact-derived version delta ledgerがすべてのblock/state/model/texture/Anvil/Paper差分とno-diff fingerprintを持ち、差分ごとのadapter/fixture/reference ownerに結びつくまでimplementation planは未完成や。確定したAST closureから追加されるwork unitにも個別文書を加える。

| 種別 | Phase ID | Phase file | 固定対象 | 依存Phase ID |
| --- | --- | --- | --- | --- |
${generatedIndexRows.join('\n')}
`);

add('phase-index.md', outputs.get('phase-index.md').replace(
  '## 必須の個別phase',
  '- 機械検証可能な依存DAG: [phase-graph.json](coverage/phase-graph.json)。全common/built-in/exact-version phaseのID・文書・依存edgeを収録し、cycle・missing dependency・unreachable nodeはvalidatorで拒否する。\n\n## 必須の個別phase',
));

const check = process.argv.includes('--check');
const write = process.argv.includes('--write');
if (check === write) throw new Error('Pass exactly one of --write or --check');
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--check' && arg !== '--write');
if (unknownArgs.length > 0) throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
const stale = [];
const expectedPhaseMarkdown = new Set([...outputs.keys()].filter((path) => path.startsWith('phases/') && path.endsWith('.md')));
const walk = async (directory) => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else if (entry.name.endsWith('.md')) paths.push(path);
  }
  return paths;
};
const actualPhaseMarkdown = await walk(resolve(planRoot, 'phases'));
for (const actual of actualPhaseMarkdown) {
  const relative = actual.slice(planRoot.length + 1);
  if (!expectedPhaseMarkdown.has(relative) && !relative.startsWith('phases/builtins/')) stale.push(`${relative} (unexpected generated phase)`);
}
for (const [path, expected] of outputs) {
  const target = resolve(planRoot, path);
  if (write) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, expected, 'utf8');
  } else {
    let actual;
    try { actual = await readFile(target, 'utf8'); } catch { actual = null; }
    if (actual !== expected) stale.push(path);
  }
}
if (stale.length) {
  console.error(`Generated plan files stale/missing (${stale.length}):\n${stale.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${write ? 'Generated' : 'Verified'} ${outputs.size} plan artifacts: ${corePhases.length} common phases, ${builtinCatalog.entries.length} built-ins, ${matrix.entries.length * stageNames.length} version stages, ${sourceCatalog.entries.length} source candidates.`);
}
