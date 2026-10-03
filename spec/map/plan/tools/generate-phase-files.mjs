#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  { n: '000', file: 'source-ast-closure', title: 'Pinned source AST と依存closure', depends: 'なし', source: 'pinned Dynmap Java 106 candidate filesとその全call/resource dependencies', output: 'stable AST symbol ledger、call/data/resource edge、required/adapter-only/excluded分類、source-to-phase map', tasks: ['JDK Compiler Tree APIでclass/interface/enum/record、constructor、overloaded method signature、field、enum constant、annotation、source spanを収集する。', 'method call、field/type参照、reflection/registry/resource lookupを抽出し、pinned source tree上のdependency graphを作る。', 'candidate 106 fileに限らずrenderer reachable dependencyを再帰追跡し、欠けたsource fileをsource snapshotとcoverage manifestへ追加する。', '各symbolをrequired / adapter-only / excludedへ分類し、excludedは呼び出し元とMC-Vector境界を根拠として記録する。', 'regex由来1,489 rowsをauthorityから外し、overloadを別IDにしたAST schemaで置き換える。'], fixture: 'overload、nested type、generic/annotation、constructor delegation、reflection登録、resource lookup、外部API adapter境界の小fixtureと全pinned Java file parse report。', fail: 'parse失敗、unresolved required call edge、未分類symbol、未登録source file、重複symbol IDはphase failure。', command: 'bun scripts/check-map-renderer-coverage.mjs --require-source-ast --require-closed-dependencies', gate: 'pinned Java declaration/referenceがAST台帳へ1対1対応し、renderer dependency closureの未分類が0。', commit: 'chore: close pinned dynmap renderer source inventory' },
  { n: '001', file: 'resource-closure', title: '全renderer resource consumer closure', depends: '000', source: 'DynmapCore resources全件、Java resource loader/consumer、client JAR/pack resource', output: '全resourceのhash・consumer symbol・scope・version adapter・fixture/evidence link', tasks: ['3,485 current candidatesに限らずpinned resource tree全entryをenumerateしdigestを計算する。', 'AST call edgeと文字列/resource lookup解析からtexturepacks、renderdata、colorschemes、shaders、lightings、perspectives等のconsumerを特定する。', '全resourceをrequired-renderer / adapter-input / excluded-platformに分類し、path heuristicのみの分類を解除する。', 'required resourceごとにparse/resolve fixtureとmissing/invalid failureを割り当てる。'], fixture: 'valid/duplicate/missing/corrupt/oversized asset、namespaceとoverride precedence、各定義file parse fixtures。', fail: 'consumerなしのrequired項目、同一path衝突、実参照を未説明でexcludedにする分類、asset zip bombはfailure。', command: 'bun scripts/check-map-renderer-coverage.mjs --require-all-resource-consumers', gate: 'pinned resource tree全件にscope/root/hash/consumerまたは根拠付きexcludeがある。', commit: 'chore: close dynmap renderer resource inventory' },
  { n: '002', file: 'version-matrix-lock', title: 'Minecraft exact release matrixとartifact lock', depends: '000,001', source: 'Mojang official version manifestと48 exact stable release metadata', output: 'releaseごとのclient/server/asset index/DataVersion/Java profile/Paper availability/digestsとrunner', tasks: ['公式manifestを再取得し1.14〜26.3のstable releaseをexact IDで列挙する。範囲内追加releaseは自動でmatrixと5 phaseを増やす。', '各client/server/version JSON URL、official SHA-1、lengthを保存し、artifact取得後のSHA-256を別fieldに記録する。', 'DataVersion、height range、chunk/asset format、minimum Java、Paper build/API availabilityを一次artifactから個別取得する。', 'run-map-version-phase.mjsとcheck-map-version-phase.mjsを作り、exact --version/--phaseを必須にしてmissing artifact/evidenceでexit 1にする。'], fixture: 'manifest version set comparison、official metadata schema changes、wrong digest/length, nonexistent release, adjacent-version substitution。', fail: 'manifest/metadata unavailable、artifact mismatch、Paper support unknownはpassでなくblocked/failed。', command: 'bun scripts/check-map-version-phase.mjs --all --phase metadata --require-official-records', gate: '48 exact releases (baseline) each have source URLs and official metadata; missing exact release zero; artifact not downloaded remains explicit.', commit: 'chore: lock exact minecraft release matrix' },
  { n: '003', file: 'license-source-boundary', title: 'Apache-2.0 source attribution and distribution boundary', depends: '000,001', source: 'pinned Dynmap source/resource licenses, vendored Java reference snapshot, Rust origin manifest', output: 'NOTICE, license records, per-module origin IDs, redistributed asset policy', tasks: ['Retain pinned commit, upstream paths, copyright/license notices, translation statement and source hash.','Separate Rust translations, Java reference-only harness, fixture data, Minecraft assets, mod assets and MC-Vector-authored code.','Define which assets may be downloaded at runtime versus stored as redistributable fixtures; record source/licensing proof per item.','Verify release/package excludes unrelated Dynmap web/storage/lifecycle binaries and user Minecraft assets.'], fixture: 'origin manifest completeness, source revision mismatch, missing license, asset allowlist and package contents checks.', fail: 'unknown provenance, missing attribution, asset redistribution without policy, copied executable source in app package.', command: 'bun scripts/verify-map-renderer-source.mjs && bun scripts/verify-map-renderer-package-boundary.mjs', gate: 'every vendored/translated/reference/resource artifact has an auditable license and provenance decision.', commit: 'chore: define map renderer source and license boundary' },
  { n: '004', file: 'java-reference-harness', title: 'Pinned Java reference renderer harness', depends: '000,001,003', source: 'actual Dynmap Java renderer closure at pinned revision; existing four empty-context patch traces only as bootstrap', output: 'repeatable chunk+asset input adapter and traces/PNG from unmodified Java renderer semantics', tasks: ['Extend harness to inject complete versioned chunk cache, block state, biome/light, texture/model resources and perspective/shader settings.','Replace empty-context-only invocation with deterministic fixture manifest and explicit requested renderer/tile.','Capture projection, ray steps, block/model resolution, patch hits, UV, shade/light, shader output, boundary events, RGBA and PNG SHA-256.','Compile actual required pinned Java algorithms; stubs may implement only excluded host interfaces and may not provide renderer outputs.','Capture reference artifacts before Rust comparisons and verify immutable manifest hashes.'], fixture: 'flat, cliff, water, forest/leaves, snow, stairs, slab, door, fence, glass, boundary, malformed and custom-pack fixture families.', fail: 'stubbed algorithm path, hidden method behavior, nondeterministic trace, empty fallback or runtime-generated expected output.', command: 'bun run test:map:reference && bun run test:map:reference:fixtures', gate: 'reference output is reproducible from pinned Java source and fixture digest for every required renderer primitive.', commit: 'test: build pinned dynmap java reference harness' },
  { n: '005', file: 'renderer-core-isolation', title: 'Warning-clean Rust renderer crate boundary', depends: '000,003', source: 'src-tauri/crates/map-renderer-core/** and app integration boundary', output: 'crate/module graph with no unconnected app compilation and no warning suppression', tasks: ['Inventory each Rust module and bind it to a phase/source symbol or remove only after explicit ownership review.','Keep renderer algorithm independent of Tauri, Paper Java types, filesystem cache, app state and UI.','Establish crate CI commands with warnings as errors; fix renderer warnings at their ownership source.','Prohibit blanket allow(dead_code)/unused, underscore renaming for warning hiding and changing warning policy.'], fixture: 'standalone crate check, feature-disabled app check, warning regression test in CI.', fail: 'unfinished renderer silently compiled into app, Tauri types in core, lint suppression hiding unwired symbols.', command: 'cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check && cargo check --manifest-path src-tauri/Cargo.toml -p map-renderer-core && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'independent core builds and clippy is clean with all renderer paths intentionally wired or explicitly pending.', commit: 'ref: isolate map renderer core boundary' },
  { n: '006', file: 'source-independent-domain', title: 'Dynmap-equivalent source-independent chunk domain', depends: '000,005', source: 'Dynmap MapChunkCache/MapIterator/MapDataContext/DynmapBlockState contracts', output: 'shared versioned ChunkView/MapChunkCache, availability, world/chunk/section and render input types', tasks: ['Define BlockState identity/properties, palettes/packed states, biome, height, sky/block light, dimension/world identity, coordinates and version profile.','Represent loaded, unloaded, missing, partial, malformed and unavailable as distinct typed states.','Define negative coordinate and inclusive/exclusive tile/chunk boundary semantics.','Keep source provenance and decode diagnostics outside renderer decisions while guaranteeing equal domain content yields identical renderer input digest.'], fixture: 'negative chunks, height boundaries, palette-width changes, missing light/biome, partial/unloaded chunks, equal digest across source adapters.', fail: 'missing treated as air, unloaded treated as empty, version-specific parser types leaking into renderer algorithms.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core domain && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'Saved Anvil/Paper/fixture adapters can produce the same validated domain without renderer source conditionals.', commit: 'feat: define complete map chunk renderer domain' },
  { n: '007', file: 'saved-anvil-common-decoder', title: 'Shared Saved Anvil/NBT decoder', depends: '002,006', source: 'Anvil region/NBT primitives and every versioned chunk-layout dependency', output: 'bounded common region/NBT reader plus per-version decoder interface', tasks: ['Decode region header/sector table/compression/NBT with checked offsets, lengths, endianness and allocation ceilings.','Decode chunk status, sections, palettes, packed states, heightmaps, biomes and light into domain.','Handle negative region/chunk coordinates, cross-region neighbors, legacy section formats and modern layouts via version adapters.','Report truncated, malformed, wrong DataVersion, missing chunk and valid empty generated chunk distinctly.'], fixture: 'real captured region plus deterministic malformed/truncated/overflow/negative-coordinate fixtures for each supported family.', fail: 'panic, overread, allocation outside budget, invalid chunk normalized to valid empty, wrong adapter accepted.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core world::anvil && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'shared decoder yields stable domain digest for valid chunks and structured non-success for every malformed case.', commit: 'feat: add bounded anvil decoder core' },
  { n: '008', file: 'versioned-assets', title: 'Verified client JAR/resource pack loading', depends: '001,002,003,005', source: 'TexturePackLoader and Minecraft resource-index/pack contracts', output: 'version-bound read-only asset archive and deterministic resource precedence', tasks: ['Verify archive identity, hashes and lengths before use; validate ZIP paths, duplicate names, expansion ratio and total bytes.','Implement namespace/path canonicalization, pack.mcmeta, vanilla+user pack precedence, duplicate conflict and hash binding.','Load only renderer-consumed texture/model/definition assets; preserve missing and invalid states.','Separate Minecraft assets from Dynmap source and Core artifact; do not bundle user JARs or arbitrary packs.'], fixture: 'valid archive, traversal/duplicate/zip bomb, version mismatch, missing namespace, override precedence and corrupted texture fixtures.', fail: 'path escape, unverified source, guessed checkerboard/material color fallback or cross-version cache reuse.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core assets && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings', gate: 'asset bytes and interpretation are pinned to exact Minecraft version and content digest.', commit: 'feat: load versioned minecraft renderer assets' },
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
  { n: '019', file: 'custom-renderer-api', title: 'Dynmap CustomRenderer/MapDataContext API contract', depends: '000,006,010,013', source: 'DynmapCoreAPI renderer six source files', output: 'Rust-compatible API semantics needed by all Dynmap built-ins', tasks: ['Port lifecycle, block-state context, neighbor reads, tile/entity data access and missing-data behavior from API source.','Port RenderPatch/Factory interface contract and CustomColorMultiplier call semantics without importing Bukkit.','Document every API method as implemented, adapter-only or out-of-scope with reason and fixture.','Run every built-in against the same Rust API model; keep method results and call order traceable.'], fixture: 'neighbor reads at chunk edge, absent tile data, property lookup, patch factory args, color multiplier lifecycle.', fail: 'API method stub returns synthetic data that changes renderer output, hidden context dependency or untracked method.', command: 'cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_api_contract && bun run test:map:reference', gate: 'every required API symbol is mapped and each built-in consumes identical contract semantics.', commit: 'feat: port dynmap renderer api contracts' },
  { n: '020', file: 'builtin-registry', title: 'Complete built-in renderer registry', depends: '000,019', source: 'all 39 pinned hdmap/renderer Java classes and registration call sites', output: 'one-to-one registry map and 39 child phase ownership entries', tasks: ['Compare Java AST class list and registration references with the 39 candidate catalog.','Record identifiers, state selectors, version/mod gates, construction inputs and implementation page for each class.','Add generator/coverage rule that newly discovered upstream built-in adds a child phase before implementation.','Mark every old translated flag unverified until child fixture/reference/pixel gate passes.'], fixture: 'source class/registration set equality, duplicate registration, unknown class and all condition branches.', fail: 'unregistered class, catalog-only class without phase file, false translated-as-verified or third-party renderer added as core built-in.', command: 'bun spec/map/plan/tools/generate-phase-files.mjs --check && bun scripts/check-map-renderer-coverage.mjs --require-builtin-plan-owners', gate: 'every pinned Dynmap built-in has exactly one child page and a registry owner; no extra claimed built-in.', commit: 'chore: map every dynmap builtin to an implementation phase' },
  { n: '021', file: 'builtin-renderer-family-gate', title: '39 individual built-in renderer phases', depends: '004,006,009-020', source: 'generated-index.md and 39 child pages under phases/builtins/', output: '39 independently committed implementations and reference evidence rows', tasks: ['Execute each B-* child in dependency order; each class owns one commit and one AST-symbol subset.','Split any source class whose methods do not form one reviewable task into additional symbol-group child phases before coding it.','For mod-integrated built-ins use isolated API data fixtures; do not copy third-party renderer implementations.','Run the registry-wide cross-renderer fixture after the final class and check registration collisions.'], fixture: '39 class-specific source-branch fixture sets plus registry interaction fixtures.', fail: 'child skipped because another renderer is similar, class covered only by family-level visual test, or evidence inherited from adjacent class.', command: 'bun scripts/check-map-renderer-coverage.mjs --require-all-builtins && bun run test:map:reference:fixtures', gate: 'all 39 child pages passed and class-specific reference/pixel evidence is recorded.', commit: 'feat: complete dynmap builtin renderer set' },
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
  { n: '035', file: 'real-acceptance-orchestration', title: 'All-version Paper/Tauri acceptance runs', depends: '023-034 and every version real-acceptance child', source: 'all exact-version real-acceptance pages and evidence matrix', output: 'one evidence record per exact release and final UI/process/port results', tasks: ['Provision version-matched Paper and Java runtime for each matrix entry; if unavailable, keep that version blocked and continue independent versions.','Execute the version-specific real-acceptance command and manual UI sequence from each child page.','Record plugin load, hello/heartbeat, loaded snapshots, actual terrain, cache, zoom/pan, failure safety and artifact digests per release.','Stop Paper via app UI; record process exit and port 25565 release before closing app.','Never copy evidence from fixture/mock/smoke or a neighboring version.'], fixture: 'real server worlds and client assets for every exact version; no synthetic-only substitution.', fail: 'missing version row, Paper mock, app stopped by force without UI evidence, port check omitted, evidence without hashes/commit.', command: 'bun scripts/check-map-acceptance-evidence.mjs --require-complete', gate: 'all 48 baseline exact releases have independently verified real evidence; unresolved row blocks entire Goal.', commit: 'test: record complete map renderer real acceptance' },
  { n: '036', file: 'final-coverage-audit', title: 'Strict final source-to-runtime closure audit', depends: '000-035 and all generated specialist phases', source: 'AST/resource/builtin/version catalogs, Java references, Rust tests, all acceptance rows', output: 'immutable final audit report and complete Goal status', tasks: ['Run strict source-symbol/resource/builtin/version/fixture/reference/evidence coverage checks.','Cross-check every required source symbol→Rust owner→fixture→Java trace→focused test→evidence edge.','Run all repository/Rust/frontend/build checks and review each evidence class separately.','Verify no planned/unverified/blocked required entry, legacy phase link, false translated status or warning suppression remains.','Record unsupported product boundaries explicitly and ensure none is a required renderer feature.'], fixture: 'clean-room final audit from committed tree, regenerated plan index and version/source manifest change detection.', fail: 'any required blocker, test skip, unsourced claim, uncommitted plan/code, mismatched evidence digest or incomplete release.', command: 'bun run test:map:final-audit && bun scripts/check-map-renderer-coverage.mjs --require-all-symbols --require-all-resources --require-all-builtins --require-all-versions --require-reference-evidence && bun scripts/check-map-acceptance-evidence.mjs --require-complete && git diff --check', gate: 'zero unresolved required coverage/evidence rows and all final gates pass from a clean committed tree.', commit: 'test: close complete map renderer coverage audit' },
];

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
  if (/ColorMultiplier$/.test(name)) return 'phases/phase-016-biome-color-material.md';
  if (/Lighting$|^LightLevels$/.test(name)) return 'phases/phase-017-hd-lighting.md';
  if (/Shader$|ShaderState$/.test(name)) return 'phases/phase-018-hd-shader.md';
  if (/^(DynmapBufferedImage|ImageIOManager)$/.test(name)) return 'phases/phase-022-raster-compositing.md';
  if (/^(HDMap|HDMapManager|HDMapTile|DynmapLogger|ForgeConfigFile|IpAddressMatcher)$/.test(name)) return 'phases/phase-000-source-ast-closure.md';
  if (/^(DataBitsPacked|BlockStateParser|BufferInputStream|BufferOutputStream)$/.test(name)) return 'phases/phase-007-saved-anvil-common-decoder.md';
  return 'phases/phase-006-source-independent-domain.md';
};

const builtinPage = (entry) => {
  const name = entry.class;
  const id = `B-${slug(name)}`;
  const source = entry.sourcePath;
  const rustPath = `src-tauri/crates/map-renderer-core/src/builtins/${slug(name)}.rs`;
  return [
    `# ${id}: Dynmap built-in renderer ${name}`,
    '',
    '## 固定範囲とowner',
    '',
    `- Pinned Java source: ${source}。revision ${revision}、Apache-2.0。`,
    `- Rust destination: ${rustPath}。共通処理はdomain/model/traversalへ置く。`,
    '- 依存: phase 000 AST source closure、004 Java reference harness、006 domain、該当する009–019 core、020 registry。',
    '- 現在のcatalogにあるtranslated表記は検証 evidenceを意味せえへん。このclassのfixture/reference trace/pixel goldenは個別に作る。',
    '',
    '## 実装タスク',
    '',
    '1. AST台帳からこのclassの全constructor、method、field、state/property read、call edgeを列挙し、分岐と呼び出し元を特定する。',
    '2. class registration、block-state matcher、version/mod条件、近傍block参照、texture/model参照を原典の順序で再現する。第三者mod rendererの実装は移植せず、Dynmap built-inが必要とする入力契約を実装する。',
    '3. 全boolean branch、finite property値、orientation/rotation、neighbor組合せ、境界値、欠落入力をfixture化する。連続値はsource上の境界・退化・代表値をfixture manifestに列記する。',
    '4. 原典Javaからpatch order、頂点、normal、visibility、texture index、UV、shade/material参照をcaptureし、Rust traceをfield単位で比較する。',
    '5. 各fixtureのnormalized RGBA goldenを事前生成・hash固定し、test実行時のgolden生成を禁止する。',
    '',
    '## 失敗条件と検証',
    '',
    'Missing asset、unsupported state/version、mod入力不足、未解決call edge、原典との差分を透明success・代表色・固定light・推測modelへfallbackしない。source上の分岐にfixtureが一つでも欠ける場合は未完了。',
    '',
    '```bash',
    `cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_builtins ${name}`,
    `bun scripts/run-dynmap-reference-harness.mjs --renderer ${name} --fixture-set ${slug(name)}`,
    `bun scripts/verify-map-reference-fixtures.mjs --renderer ${name}`,
    'cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings',
    '```',
    '',
    'Gate: AST coverage 100%、原典registration parity、全branch fixtures pass、中間trace一致、固定pixel parity pass、失敗入力の意味一致。',
    '',
    '## Commit',
    '',
    '```text',
    `feat: port dynmap builtin ${name}`,
    '```',
  ].join('\n');
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
  `| Paper build / jar SHA-256 | ${entry.paperBuild ?? '未登録'} / ${entry.paperJarSha256 ?? '未登録'} |`,
  `| Anvil / Paper snapshot / reference | ${entry.anvilAdapter ?? '未登録'} / ${entry.paperSnapshotAdapter ?? '未登録'} / ${entry.referenceCapture ?? '未登録'} |`,
  `| matrix state | ${entry.status}; artifact ${entry.artifactStatus} |`,
].join('\n');

const stageDefinition = (stage, version) => ({
  assets: {
    title: 'official assets', purpose: '公式client JAR・asset indexと、この版のrenderer-consumed resource全件をdigest付きprofileにする。',
    tasks: ['official metadataのURL/length/SHA-1を照合し、取得bytesのSHA-256も保存する。', 'ZIP entry path、duplicate、entry数、展開量、圧縮率、namespace、pack metadataを上限付きで検証する。', 'blockstate/model/texture/CTM/tint/animationをsource resource closureと照合し、全consumerとresolution precedenceを記録する。', 'missing/format mismatchをunsupportedまたはerrorとして返し、version外assetを混入させない。'],
    commit: `feat: add minecraft ${version} asset profile`,
  },
  anvil: {
    title: 'saved Anvil adapter', purpose: 'このexact releaseの実Anvil chunkをshared MapChunkCacheへ復元する。',
    tasks: ['official server artifactからDataVersionを読み取りversion matrixへ固定する。', 'region header/sector/compression/NBT/chunk status、section palette、packed states、heightmap、biome、sky/block light、vertical rangeを実world fixtureと照合する。', 'negative chunk coordinate、missing/truncated/malformed chunk、neighboring region/section boundaryを別fixtureで検証する。', 'input/output digestsを固定し、他versionのDataVersionを受理しない。'],
    commit: `feat: add minecraft ${version} anvil adapter`,
  },
  'paper-snapshot': {
    title: 'Paper snapshot adapter', purpose: '対象版のPaper processが返すsnapshotをAnvilと同じMapChunkCacheへ変換する。',
    tasks: ['exact Paper build、jar SHA-256、required Java runtimeをversion matrixへ記録する。', 'loaded/not_loaded、requestId/server/world/dimension/chunk/version/DataVersionのidentityを照合する。', 'palette、biome、height、sky/block lightのwire bytesを実Paper responseとfixtureで比較する。', 'queue full/timeout/reconnect/malformed/world mismatchは個別unavailable reasonとし、地形なしと混同しない。'],
    commit: `feat: add paper snapshot adapter for minecraft ${version}`,
  },
  'reference-and-parity': {
    title: 'Java reference and pixel parity', purpose: '同じversion-bound assets/chunk/settingsをpinned Java rendererとRust rendererへ渡してtraceと画像を比較する。',
    tasks: ['ray origin/direction/step/hit/face/patch/UV/rotation/shade/light/alpha/projected pixelを固定schemaでcaptureする。', 'reference trace/PNGをtest時に生成せず、capture source commit、input digest、toolchain、PNG hashを固定する。', 'normalized RGBAをpixel単位比較する。許容差を広げて差分を隠さず、差異はsource symbolへ帰属させる。', '当該versionで登録される全required symbols/resources/built-insにfixtureまたは根拠付き非適用記録を結びつける。'],
    commit: `test: verify dynmap parity for minecraft ${version}`,
  },
  'real-acceptance': {
    title: 'real Paper/Tauri acceptance', purpose: '実Paperと実Tauriでterrain生成から停止・port releaseまで、この版の証拠を採取する。',
    tasks: ['verified Core artifactとversion-matched Paperを起動し、plugin load、hello/heartbeat、loaded snapshotを記録する。', '実world terrain、Anvil/live diagnostics、PNG生成、tile cache reuse、client assetとCore分離を確認する。', 'UIでzoom 8→0、cursor anchor、上下左右edge anchor、pan、adjacent tile、old layer保持を操作する。', 'offline/malformed/missing assetではconsentがenabledにならず、retryable reasonがredactedであることを確認する。', 'UIからPaperを停止し、Java process終了とport 25565解放を確認した後にdebug appを閉じる。'],
    commit: `test: record real map acceptance for minecraft ${version}`,
  },
}[stage]);

const versionPage = (entry, stage) => {
  const definition = stageDefinition(stage, entry.minecraftVersion);
  return [
    `# V-${entry.minecraftVersion}-${stage}: ${entry.minecraftVersion} ${definition.title}`,
    '',
    '## exact version identity',
    '',
    '- 対象はこのrelease一件だけ。family代表・隣接patchのpassで代用しない。',
    '- current version matrix record:',
    '',
    versionMetadata(entry),
    '',
    '## 目的と依存',
    '',
    definition.purpose,
    '',
    '- 入力契約: 上表の公式release artifact、revision-pinned Dynmap reference、shared renderer contract。',
    '- 依存: phases 002–006のversion/source/domain gateと、このstageが使うcore phase。',
    '- この文書作成時点では、matrix metadata verifiedはartifact取得・adapter実装・実Paper検証の代わりにならない。',
    '',
    '## 個別作業',
    '',
    ...definition.tasks.map((task, index) => `${index + 1}. ${task}`),
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

const corePage = (phase) => [
  `# P-${phase.n}: ${phase.title}`,
  '',
  '## 目的と固定対象',
  '',
  `- 対象source/symbol: ${phase.source}。詳細な宣言IDはP-000 AST ledgerを正とする。`,
  `- Rust destination / output: ${phase.output}。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。`,
  `- 依存phase: ${phase.depends}。依存gateが未達のまま、このphaseを実装済みにしない。`,
  '- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。',
  '',
  '## 入力・failure contract',
  '',
  '入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。',
  `このphase固有の失敗条件: ${phase.fail}`,
  '',
  '## 実装作業',
  '',
  ...phase.tasks.map((task, index) => `${index + 1}. ${task}`),
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
  phase.command,
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

- [39 built-in renderer個別phaseとversion stage index](phases/generated-index.md)
- 48 exact releaseごとのassets / Anvil / Paper snapshot / reference parity / real acceptance: **240個の版別文書**。それぞれ別gate・証拠・commitを持つ。
- AST closureで追加されるpinned source class/method group/resource consumerにもimplementation phaseを追加する。予定済み件数でclosureを切らない。

## 実行順

1. P-000〜P-005でsource/resource/version/license/oracle/crate境界を確定する。
2. P-006〜P-023でdomain、version adapters、Dynmap renderer、built-insを実装し、全39個別renderer phaseを各自で完了する。
3. 48版それぞれのassets/Anvil/Paper/reference parity stageを、その版の依存が満たされた順に実施する。
4. P-024〜P-025でPaper protocolとsaved/live equivalenceを完成する。
5. P-026〜P-034でtile/cache/scheduler/IPC/UI/zoom/failure/security/CIを接続する。
6. 全48版のreal acceptance pageを実施する。Paper unavailableな版はblockedでありpassではない。
7. P-035が版別acceptance証拠を統合し、P-036が全source/resource/version/feature coverageをfail-closedで監査する。

一つの巨大phaseをまとめてcommitしない。各個別built-in、各version-stage、追加source method groupを一つのレビュー可能な作業単位とし、他のunrelated changesをstageせえへん。
`);

const sourceCatalog = await readJson('spec/map/coverage/source-symbols.json');
const resourceCatalog = await readJson('spec/map/coverage/resources.json');
const builtinCatalog = await readJson('spec/map/coverage/builtin-renderers.json');
const matrix = await readJson('spec/map/coverage/version-matrix.json');
if (sourceCatalog.entries.length !== 106 || builtinCatalog.entries.length !== 39 || matrix.entries.length !== 48) throw new Error('Expected current lock counts: 106 source candidates, 39 built-ins, 48 releases');
if (matrix.entries[0].minecraftVersion !== '1.14' || matrix.entries.at(-1).minecraftVersion !== '26.3') throw new Error('Version boundaries do not match the plan lock');
for (const catalog of [sourceCatalog, resourceCatalog, builtinCatalog]) if (catalog.sourceRevision !== revision) throw new Error('Dynmap revision mismatch');

let sourceLines = 0;
for (const entry of sourceCatalog.entries) {
  const upstream = resolve(repoRoot, 'src-tauri/crates/map-renderer-core/third_party/dynmap/upstream', entry.sourcePath);
  sourceLines += (await readFile(upstream, 'utf8')).split('\n').length - 1;
}
if (sourceLines !== 22_783) throw new Error(`Expected 22,783 vendored source lines at plan lock; found ${sourceLines}`);

const sourceMap = sourceCatalog.entries.map((entry) => ({ sourcePath: entry.sourcePath, candidateRustDestination: entry.destination, candidateOwnerDocument: ownerFor(entry), classification: 'candidate_requires_ast_call_and_resource_review' }));
add('coverage/source-phase-map.json', JSON.stringify({ schemaVersion: 1, revision, trust: 'candidate ownership map only; not proof of complete dependency closure or implementation', entries: sourceMap }, null, 2));
const sourceTable = sourceMap.map((entry, index) => `| ${index + 1} | ${entry.sourcePath} | ${link(`../${entry.candidateOwnerDocument}`, entry.candidateOwnerDocument.split('/').at(-1))} | ${entry.candidateRustDestination} | AST review required |`).join('\n');
add('coverage/source-candidates.md', `# Pinned Java source candidate inventory

Baseline 2026-09-23: 106 candidate Java files, ${sourceLines.toLocaleString('en-US')} lines, revision ${revision}. This is the existing package-prefix snapshot, not a proven renderer dependency closure. Phase 000 recursively follows renderer call/data/resource dependencies and adds any required upstream file missing here.

The existing 1,489 lexical rows are not authoritative symbols: the extractor uses regular expressions, counts control-flow tokens as methods, and collapses overloads by name. Phase 000 replaces them with compiler AST records for declarations, signatures, fields, enum constants, references, source span, and stable ID.

| # | Pinned source | Candidate owner | Current Rust destination hint | Gate |
| ---: | --- | --- | --- | --- |
${sourceTable}
`);

const resourceScopes = Object.fromEntries([...new Set(resourceCatalog.entries.map((entry) => entry.scope))].map((scope) => [scope, resourceCatalog.entries.filter((entry) => entry.scope === scope).length]));
const statusCounts = (records, key) => Object.fromEntries([...new Set(records.map((entry) => entry[key]))].map((status) => [status, records.filter((entry) => entry[key] === status).length]));
const anvilVersions = matrix.entries.filter((entry) => entry.anvilAdapter).map((entry) => `${entry.minecraftVersion} (${entry.dataVersion})`);
const paperVersions = matrix.entries.filter((entry) => entry.paperBuild || entry.paperSnapshotAdapter).length;
const referenceVersions = matrix.entries.filter((entry) => entry.referenceCapture).length;
const legacySymbols = sourceCatalog.entries.reduce((sum, entry) => sum + entry.symbols.length, 0);
const lexicalMethods = sourceCatalog.entries.reduce((sum, entry) => sum + entry.symbols.filter((symbol) => symbol.kind === 'method').length, 0);
add('coverage/current-catalog-audit.md', `# 現行implementation/evidence台帳の監査

基準日: 2026-09-23。以下は計画開始時点の確認値や。数が載っていることと実装・parityの証拠は分ける。

## Pinned Java source

- 106 files / ${sourceLines.toLocaleString('en-US')} lines。現snapshotはDynmapCoreAPI renderer、DynmapCore hdmap/utilsの候補範囲であり、依存closure確定ではない。
- JSONの1,489 rowsには${lexicalMethods.toLocaleString('en-US')}件のmethod-kind候補があるが、Java regex抽出でif / switch / for / return等をmethodとして誤検出し、overloadも区別しない。AST authorityとして無効。
- 現行Rust destinationはcandidate hint。原典の全call/data/resource dependencyを調べてrequired、adapter-only、excludedを確定する。

## Resources / built-ins

- Resource catalog ${resourceCatalog.entries.length}件: ${Object.entries(resourceScopes).map(([key, value]) => `${key}=${value}`).join(', ')}。分類はpath heuristicであり、consumer解析をしていない。
- Built-in renderer ${builtinCatalog.entries.length}件。現catalogのtranslated表記はsource mapping statusに過ぎない。全39件でfixture/referenceTrace/pixelGolden/requiredAssetsが空なので、全てrenderer parity未検証として扱う。

## Versions / reference / runtime

- Official release metadata ${matrix.entries.length}件、${matrix.range.minimum}〜${matrix.range.maximum}。status counts: ${JSON.stringify(statusCounts(matrix.entries, 'status'))}。artifactStatus counts: ${JSON.stringify(statusCounts(matrix.entries, 'artifactStatus'))}。公式URL/length/SHA-1 metadataがあってもJAR取得・SHA-256・adapter evidenceとは別。
- Anvil adapter matrix登録: ${anvilVersions.join(', ') || 'なし'}。1.21.4 decoder/合成region fixtureが存在しても、captured real world Anvil fixtureや全版parityを証明しない。
- Paper build/snapshot matrix登録 ${paperVersions}件、版別referenceCapture ${referenceVersions}件。Rust 1.21.4 snapshot decoderとprotocol fixtureは存在するが、real Paper plugin/provider通信は未証明。
- Reference harnessはBox/Cuboid/Pane/Plantのpatch trace fixtureを持つ。version-bound real chunk/assetsとreference PNG/pixel hashは未登録。
- real-acceptance-matrix.jsonはglobal blocked、per-version override 0件。per-version evidenceを後続phaseで明示化する。
- Tauri request_map_renderはrenderer_not_connectedを返し、実rendererへのpipeline接続がない。
`);

for (const entry of builtinCatalog.entries) add(`phases/builtins/${slug(entry.class)}.md`, builtinPage(entry));

const generatedIndexRows = [];
for (const phase of corePhases) {
  add(`phases/phase-${phase.n}-${phase.file}.md`, corePage(phase));
  generatedIndexRows.push(`| common | P-${phase.n} | ${link(`phase-${phase.n}-${phase.file}.md`, phase.title)} | ${phase.source} |`);
}
for (const entry of builtinCatalog.entries) generatedIndexRows.push(`| built-in | ${entry.class} | ${link(`builtins/${slug(entry.class)}.md`, 'phase')} | ${entry.sourcePath} |`);
for (const entry of matrix.entries) for (const stage of stageNames) {
  const file = stage === 'paper-snapshot' ? 'paper-snapshot' : stage === 'reference-and-parity' ? 'reference-and-parity' : stage === 'real-acceptance' ? 'real-acceptance' : stage;
  add(`phases/versions/${entry.minecraftVersion}/${file}.md`, versionPage(entry, stage));
  generatedIndexRows.push(`| version | ${entry.minecraftVersion} | ${link(`versions/${entry.minecraftVersion}/${file}.md`, stage)} | exact release |`);
}
add('phases/generated-index.md', `# Generated renderer-specialist phase index

再生成コマンド: bun spec/map/plan/tools/generate-phase-files.mjs --write。検証コマンド: bun spec/map/plan/tools/generate-phase-files.mjs --check。Generatorは古くなったfileを自動削除せえへん。matrix縮小時も削除候補をdiffで人が確認する。

37 common phase、39 built-in renderer phase、48 exact releases × 5 stage = **316個の実装phase文書**。AST closureから追加されるwork unitにも個別文書を加える。

| 種別 | 対象 | Phase file | 固定対象 |
| --- | --- | --- | --- |
${generatedIndexRows.join('\n')}
`);

const check = process.argv.includes('--check');
const write = process.argv.includes('--write');
if (check === write) throw new Error('Pass exactly one of --write or --check');
const stale = [];
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
  console.log(`${write ? 'Generated' : 'Verified'} ${outputs.size} plan artifacts: ${corePhases.length} common phases, 39 built-ins, 240 version stages, 106 source candidates.`);
}
