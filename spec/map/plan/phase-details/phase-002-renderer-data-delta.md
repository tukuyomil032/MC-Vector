# P-002 detail: exact-release renderer and Anvil data-delta extraction

> **For agentic workers:** Implement this plan in small reviewable tasks. Do not mark a release delta complete until its exact inputs, extraction coverage, change mappings, and required evidence pass the gates below.

**Goal:** For every exact supported Minecraft stable release, produce an artifact-bound, reproducible comparison against the immediately preceding stable release (or an absolute first-release baseline) covering all renderer inputs and saved-world Anvil schema fields.

**Architecture:** Keep official artifact acquisition and verification, canonical extraction, adjacent-release comparison, and evidence binding as separate stages. The canonical delta bundle is the source for the existing per-release `assets`, `anvil`, `dynmap-oracle`, and `reference-and-parity` work; the current `version-delta-matrix.json` remains a metadata/evidence index and is never counted as extracted data coverage.

**Tech Stack:** Bun/Node.js command-line tooling, Mojang version manifest/client and server JARs, official asset-index objects, ZIP/NBT parsers selected and pinned during implementation, pinned Dynmap Java reference harness, Rust renderer fixtures, deterministic JSON and SHA-256.

---

## Scope and ownership

This detail completes the data-extraction contract for P-002. It does not claim that any release has been audited. At plan authoring time the exact JARs have not been downloaded and the matrix records are pending; therefore every per-release finding remains `pending` until the extraction pipeline runs against verified bytes.

The comparison unit is one exact official stable release `T` against `P`, the immediately preceding stable release in the official manifest's stable-release order. The first supported release has no predecessor and receives an `absolute_baseline` inventory. Do not compare against a family representative, a convenient neighboring patch, an arbitrary “latest” artifact, or only the release metadata. A release's client assets and server-generated Anvil data are independent input sets.

The current 48-release snapshot and its 240 generated release-verification pages are scheduling/indexing facts only. `version-delta-matrix.json`, its artifact hashes, row count, and `metadata_verified` state prove neither that bytes were downloaded nor that renderer or Anvil differences were extracted. Per-release completion requires the data artifacts and evidence defined here.

## Planned files and ownership boundaries

Implement these paths in the follow-up implementation phase. No generated per-release page, shared matrix, or validator is changed by this planning document.

| Path | Responsibility |
| --- | --- |
| `spec/map/plan/tools/acquire-version-artifacts.mjs` | Read the canonical version matrix; fetch exact manifest, client/server JARs and all asset-index objects into a version-scoped cache; verify official SHA-1/length and record actual SHA-256. |
| `spec/map/plan/tools/extract-renderer-inputs.mjs` | Extract complete client-JAR and asset-index inventories, runtime resource precedence, block registry/state definitions, blockstates, resolved models, textures and renderer-consumed color/material/light inputs into canonical inventories. |
| `spec/map/plan/tools/extract-anvil-schema.mjs` | Generate controlled worlds using the exact official server JAR and fixed recipe; extract actual region/chunk/NBT schema observations and canonical schema inventories. |
| `spec/map/plan/tools/compare-version-data-delta.mjs` | Compare target and immediate predecessor inventories, classify adds/removals/changes/renames, assign stable IDs, and emit the release delta bundle and report projections. |
| `spec/map/plan/tools/bind-version-delta-evidence.mjs` | Require source-symbol, adapter-owner, fixture, exact Dynmap trace, pixel-parity and evidence links for renderer-visible changes; require decode/reference evidence for Anvil changes. |
| `spec/map/plan/tools/tests/version-data-delta/` | Deterministic synthetic archives, registry/model/texture and NBT fixtures, expected canonical inventories, rename/removal cases, incomplete-artifact cases, and no-change proof cases. |
| `spec/map/evidence/version-deltas/<version>/renderer-input-delta.json` | Canonical renderer-input delta and coverage/no-change proof for one exact release. |
| `spec/map/evidence/version-deltas/<version>/anvil.json` | Canonical Anvil schema delta and decode evidence links for one exact release. |
| `spec/map/evidence/version-deltas/<version>/assets.json` | Stable report consumed by the existing version `assets.md` phase; includes renderer input changes and coverage links, not merely file checksums. |
| `spec/map/evidence/version-deltas/<version>/renderer-inventory-before.json` and `renderer-inventory-target.json` | Content-addressed normalized inventories needed to independently reproduce the adjacent-release comparison. |
| `spec/map/evidence/version-deltas/<version>/anvil-schema-before.json` and `anvil-schema-target.json` | Content-addressed normalized schema inventories derived from controlled exact-version world fixtures. |

The delta bundle owns the change records. The `assets.json` and `anvil.json` reports are stable consumer views and must carry the bundle digest and evidence IDs; they must not independently re-infer changes. Existing Dynmap-oracle and parity reports retain their distinct responsibilities and refer back to the same change IDs.

## Exact inputs and reproducibility contract

For both `P` and `T`, resolve inputs from the exact-version records in `spec/map/coverage/version-matrix.json` and the matching official version JSON. The acquisition manifest must include:

- Exact Minecraft version ID, release type/time, official version JSON URL and SHA-256, target and predecessor IDs, and the manifest snapshot digest.
- Client JAR and server JAR official URLs, official SHA-1, expected byte length, downloaded byte length, and downloaded SHA-256. Reject any mismatch before extraction.
- Asset-index ID, official URL/hash/length, downloaded hash/length, plus every referenced object path, official hash/size, downloaded SHA-256 and fetch status. Client-JAR resources and asset-index objects are separate source roots; neither is assumed to contain the complete runtime set.
- Exact server executable JAR digest, Java runtime major, world-generation command/options, seed, game rules, dimension list, and generated world/region fixture digests used to observe Anvil schema. Fix the recipe and store it with the fixture; do not derive schema from `DataVersion` alone.
- Extractor source revision and SHA-256, dependency lockfile digest, canonicalization schema version, operating system/architecture where parser behavior could affect output, and command arguments.
- For reference evidence, exact selected Dynmap repository/revision/source-tree digest/build digest for `T`, plus the fixed baseline revision `93b454efb8802dc7406d6873434f2aeec5c636f4` and source-tree digest. The fixed baseline is a comparison anchor, not automatic proof of target-version compatibility.

All downloads and extraction are staged under an explicit version-scoped cache. Preserve the downloaded source archives or provide a verified immutable local artifact cache; never rewrite official bytes in place. Canonical JSON uses UTF-8, sorted object keys, sorted arrays by declared identity, normalized namespace/path separators, explicit `null` for absent optional fields, and no timestamps other than source release metadata. Hash canonical JSON bytes with SHA-256.

Any missing object, failed request, unknown resource precedence, ZIP/NBT parse error, unresolved reference, extractor warning affecting coverage, digest mismatch, or incomplete inventory yields `pending` or `blocked`; it cannot be coerced to an empty inventory or no-change result.

## Deterministic extraction and comparison

### 1. Resolve and verify artifacts

Read the official stable release set and exact version rows. Verify target and predecessor artifacts against official hash/length before unzipping or opening them. Enumerate every client-JAR ZIP entry and every asset-index object, including entries later classified outside renderer scope. Record ignored entries and the reason they cannot reach rendering. Resolve duplicate logical resource paths using the exact version's proven runtime lookup/precedence rules; conflicting bytes without a proven deterministic winner block the release.

For the first stable release, use the same extraction and classification path, but emit `baselineKind: "absolute_baseline"`, no predecessor ID, and complete absolute inventories. Never fabricate a zero-change predecessor.

### 2. Build complete canonical renderer inventories

Extract and close the complete renderer-relevant dependency graph, not a handpicked list of changed-looking filenames:

1. Runtime block registry identifiers and all block-state property names and legal values. Record registry add/remove/rename and state-property/value add/remove/change independently. Runtime registry evidence, not resource filename presence, decides block identity.
2. Every blockstate JSON selector, `variants` entry, multipart condition/apply branch, weighted model choice, rotation, and referenced model. Preserve raw selector/condition semantics and also record normalized resolved outputs.
3. The transitive model graph: parent, texture-variable resolution, elements, `from`/`to`, face texture, UV, rotation, tint index, cull face, shade, and render-relevant display/geometry values. Missing parents or unresolved variables are explicit failures.
4. Every reached texture's decoded width/height, color mode, per-pixel RGBA digest, alpha occupancy/cutout class, animation metadata and sampler/UV-relevant layout. Preserve raw PNG digest as provenance; equal path or equal compressed-file size is not pixel equality.
5. Every reached biome tint/color input, colormap, tint index, biome registry linkage and blend rule. Include foliage/grass/water tint sources where consumed.
6. Every reached material and lighting input: render layer/cutout/translucency, emissive/light emission, shade flags, ambient occlusion, face/vertex light behavior and other source-confirmed values affecting raster output.
7. Resource logical identity, source root, physical entry/object path, byte digests, runtime precedence decision and consumer edge for every node in the renderer closure.

Produce a coverage partition of every registry block/state and every enumerated resource as `renderer_relevant`, `proven_not_renderer_relevant`, or `unresolved`. A release cannot be complete while `unresolved > 0`; exclusions require the source consumer/non-reachability evidence and exact resource identity.

### 3. Build Anvil schema inventories from actual bytes

Generate deterministic worlds from the exact official server JAR using fixed recipes that exercise each available dimension and representative blocks/biomes. Extract observed fields and encodings from actual region and chunk bytes, retaining source paths and NBT type/shape. Cover, at minimum:

- `DataVersion`, world/dimension identity, min/max Y and section count;
- region header/sector allocation and compression type;
- root and chunk NBT fields including additions, removals, renames, type/list/compound shape changes and semantic encoding changes;
- section Y and block-state palette entries, palette ordering/identity and packed-long bit layout;
- biome palette entries, section/column layout and packing;
- heightmaps and packed values;
- sky-light and block-light presence, array length and encoding;
- block entities and fields that affect block identity/state, model choice, tint, emission or renderer output;
- coordinates, status and other fields the shared decoder consumes to choose/render a chunk.

Compare normalized schema paths and semantics as well as raw observed shape. A changed `DataVersion` alone is a change marker to investigate, not a schema delta classification; unchanged `DataVersion` is not proof of unchanged schema. Each schema field must be classified as added, removed, renamed, type/encoding changed, semantic changed, or byte-level-only changed. Connect renderer-affecting schema changes to the corresponding decoded block/state/biome/light fixture and pixel-parity record; storage-only changes still require exact decoder fixture and reference-domain digest evidence.

### 4. Compare adjacent releases, including removals and renames

Compare canonical semantic identities, resolved graphs and content digests, not release labels or raw ZIP entry counts. Emit explicit `added`, `removed`, `changed`, and `renamed` operations. A rename is an additional relation over the explicit removed and added records and is allowed only with evidence that establishes identity (official registry/resource migration evidence or exact semantic equivalence plus source trace). Fuzzy filename similarity may nominate a review candidate but cannot merge identities or erase a removal.

For each changed node, retain before/after canonical values and fingerprints, the nearest changed dependency edges, and the resolved downstream impact set. Propagate texture/model/biome/material changes to every dependent block/state so the parity fixture set covers rendered behavior, while retaining a single source change ID to avoid hiding fan-out.

### 5. Bind changes to implementation and evidence

For every renderer-visible change, map the canonical change ID to:

- the exact Dynmap source symbol IDs (AST IDs plus repository-relative file and line span) that register, resolve, shade or consume the changed input;
- the Rust version-adapter/profile owner ID and owning phase, chosen from the existing architecture: P-008 versioned assets, P-012 blockstate/model resolution, P-014 texture/UV, P-016 biome tint/material, P-017 lighting, P-007 Anvil decode, or a separately planned adapter phase only after a demonstrated behavior gap;
- one or more deterministic fixtures with exact input digests and expected intermediate renderer/decode outputs;
- the exact target-compatible pinned Dynmap reference trace ID, source revision/build digest, trace digest and input fixture ID. When target behavior differs from the fixed baseline, preserve both traces and identify the source-symbol delta that explains the difference;
- normalized RGBA parity case ID, expected image digest, actual image digest, pixel-diff result and tolerance policy. Do not raise tolerance to mask a semantic mismatch;
- a stable evidence ID linking the artifact manifest, before/after inventories, extraction coverage, source mapping, fixture, trace and parity result.

One change may fan out to multiple states or fixtures; every affected output path must be covered. Several changes may share one fixture only if that fixture independently exercises each listed change and the trace records each change ID. No changed renderer input may be left at “covered by release” without a direct mapping.

### 6. Prove no-change without inferring it

Emit `no_change_verified` only when all of the following hold for target and predecessor: verified client JAR and asset-index object bytes; complete equal registry/state/model/resource/biome/material/light inventories; equal canonical renderer-input fingerprints; equal extraction-coverage sets with zero unresolved nodes; equal relevant precedence policy; extractor/schema versions recorded; and reproducible rerun yields the same inventory hashes. For the first release, no relative no-change claim exists.

An equal fingerprint with missing inputs, incomplete closure, an unrecognized field, or an extractor error is not proof. A matrix row, artifact hash alone, empty manually authored change list, equal release-family tag or absent file is not proof.

## Stable IDs and report schema

Canonical change ID:

```text
MVD1-<target-version>-<12 lowercase hex chars>
```

The 12-character suffix is the prefix of SHA-256 over UTF-8 canonical JSON containing `comparisonSchema`, `baselineVersion` (or `absolute_baseline`), `axis`, `logicalIdentity`, `operation`, `beforeFingerprint`, and `afterFingerprint`. `logicalIdentity` includes namespace/resource path and registry/state key as applicable. The same semantic change therefore retains its ID when unrelated records are added; a baseline, operation or before/after content change creates a distinct ID. Rename relations have their own deterministic ID derived from the paired removed/added change IDs and rename-proof evidence identity.

Evidence IDs use `MVE1-<target-version>-<12 hex>` from the ordered tuple `(changeId, evidenceKind, fixtureId, referenceTraceId, parityCaseId, ownerId)`. Fixture, trace and parity IDs are content-addressed and include exact release and input fingerprints; no mutable `latest` alias is valid evidence.

The canonical `renderer-input-delta.json` envelope must include:

```json
{
  "schemaVersion": 1,
  "targetVersion": "<exact-version>",
  "baseline": { "kind": "previous_stable_release", "version": "<exact-version>" },
  "status": "pending_input",
  "inputArtifacts": {},
  "extractor": {},
  "inventoryDigests": { "baseline": null, "target": null },
  "rendererInputFingerprints": { "baseline": null, "target": null },
  "coverage": { "enumerated": 0, "rendererRelevant": 0, "provenExcluded": 0, "unresolved": 0 },
  "changes": [],
  "renameRelations": [],
  "noChangeProof": null,
  "evidenceIds": []
}
```

Use only these lifecycle states: `pending_input`, `pending_extraction`, `pending_evidence`, `no_change_verified`, `delta_verified`, `blocked`, and `failed`. Empty `changes` is valid only with `noChangeProof` and terminal state `no_change_verified`; while inputs are unavailable it remains `pending_input`, not “no changes.” A report projection records `status` and `bundleSha256`, and cannot upgrade the canonical bundle's state.

Each renderer change record contains `changeId`, `axis`, `operation`, stable `logicalIdentity`, `before` and `after` values/fingerprints, `impactIds` (block IDs, state keys and renderer-input IDs), `sourceSymbolIds`, `ownerPhaseId`, `adapterOwnerId`, `fixtureIds`, `dynmapReferenceTraceIds`, `pixelParityCaseIds`, `evidenceIds`, and `status`. Each Anvil change record contains corresponding before/after field paths and shapes, owning decoder profile/phase, schema fixture IDs, reference-domain digests, and renderer parity IDs when render-visible.

## Commands to implement

These commands are planned interfaces, not commands available in the current checkout. Implement them without changing the shared matrix, validator or generated per-version documents until this extraction contract has been reviewed and adopted by their owners.

```bash
# Verify metadata and print exact target/predecessor artifact locks and planned byte totals.
bun spec/map/plan/tools/acquire-version-artifacts.mjs --version 1.21.4 --plan

# Download only after the plan is inspectable; verify official SHA-1/length and write local SHA-256 manifest.
bun spec/map/plan/tools/acquire-version-artifacts.mjs --version 1.21.4 --download --cache /tmp/mc-map-artifacts/1.21.4

# Extract full target and predecessor input inventories; the first release uses --baseline absolute.
bun spec/map/plan/tools/extract-renderer-inputs.mjs --version 1.21.4 --cache /tmp/mc-map-artifacts/1.21.4 --output /tmp/mc-map-artifacts/1.21.4/renderer
bun spec/map/plan/tools/extract-anvil-schema.mjs --version 1.21.4 --cache /tmp/mc-map-artifacts/1.21.4 --recipe spec/map/fixtures/version-world-recipe.json --output /tmp/mc-map-artifacts/1.21.4/anvil

# Compare, classify, and emit canonical bundle plus stable assets/anvil report projections.
bun spec/map/plan/tools/compare-version-data-delta.mjs --version 1.21.4 --renderer-before /tmp/mc-map-artifacts/1.21.3/renderer --renderer-target /tmp/mc-map-artifacts/1.21.4/renderer --anvil-before /tmp/mc-map-artifacts/1.21.3/anvil --anvil-target /tmp/mc-map-artifacts/1.21.4/anvil --output spec/map/evidence/version-deltas/1.21.4

# Bind implementation and parity evidence; absent evidence leaves pending_evidence and exits nonzero in gate mode.
bun spec/map/plan/tools/bind-version-delta-evidence.mjs --version 1.21.4 --bundle spec/map/evidence/version-deltas/1.21.4/renderer-input-delta.json --evidence-root spec/map/evidence/version-deltas/1.21.4 --check

# Batch exact-release acquisition planning and verified-completeness checks over official manifest membership.
bun spec/map/plan/tools/acquire-version-artifacts.mjs --all --plan
bun spec/map/plan/tools/compare-version-data-delta.mjs --all --check-complete
```

`--plan` must be read-only and enumerate exact downloads. `--download` may write only to the supplied cache/output locations. `--check` and `--check-complete` must never regenerate or bless evidence. A target release cannot be marked complete by running only the `--all` metadata check.

## Mapping matrix: changed inputs to owners and required proof

Source symbol IDs must be resolved from the pinned Dynmap AST/source inventory and exact selected target-compatible source revision; symbol family names below identify the lookup/consumer classes to discover, not substitute symbols or line references.

| Changed input | Dynmap source symbols to resolve | Default implementation owner | Required proof per change |
| --- | --- | --- | --- |
| Block registry add/remove/rename and state property/value changes | Block registration/mapping, state decoding, renderer dispatch/lookup symbols and their exact source resource consumers | P-012; P-020/P-021 when dispatch changes; new adapter phase only for measured gap | Registry/state fixture; exact reference state/dispatch trace; pixel parity for every newly/changed visible state; removal/rename fixture proving old IDs and saved-world behavior. |
| Blockstate selector, variant or multipart logic | Blockstate parser, selector matcher, multipart evaluator, model-choice/weighted-choice resolver | P-012 | Fixture for each new/changed selector branch; trace of selected model(s), transform and condition; pixel parity. |
| Model graph, inheritance, geometry, faces, UV/rotation/cull/tint/shade | Model loader/resolver, face/patch construction and projection symbols | P-012/P-013; P-010 for geometry behavior | Parent/texture resolution fixture, intermediate model/face/UV trace and exact pixel parity. |
| Texture bytes, alpha/cutout, UV mapping or animation metadata | Texture resource resolution/loading, alpha compositing and UV sampling symbols | P-008/P-014/P-015/P-022 as consumed | Decoded RGBA/alpha fixture, resolved source-path trace, UV/sample trace and normalized RGBA parity. |
| Biome tint, colormap, tint index or blend behavior | Biome color lookup, `ColorScheme` and shader tint application symbols | P-016 | Exact biome/position/tint fixture, color lookup trace and pixel parity with tint enabled. |
| Material/render layer, ambient occlusion, shade, emissive or light values | Material/face shading and `HDLighting`/shader symbols | P-016/P-017/P-018 | Fixture with relevant face/light/biome inputs, intermediate light/shade trace and pixel parity including alpha. |
| Anvil root/chunk/section/palette/heightmap/light/block-entity field or encoding | Chunk/section/palette/biome/height/light decode call chain from exact pinned Java oracle; source field access symbols | P-007 and the owning versioned decoder profile; renderer owner above if values affect output | Exact raw region/chunk fixture, field/encoding comparison, decoded-domain digest against reference; renderer trace and pixel parity when output-visible. |

Map concrete symbols with stable AST symbol IDs plus file/line anchors; pin the source tree commit and digest so later line movement does not invalidate identity. Assign a concrete `adapterOwnerId` to a shared profile when reused. Create a version-specific adapter owner only after a fixture demonstrates that the existing profile fails to represent the exact change and the exact reference confirms expected behavior.

## Downstream use by the 48 × 5 release pages

The existing 48 release folders each contain five phase pages. Once the contract is implemented, all five consume the same target release identity and canonical data-delta bundle digest; they do not repeat extraction or invent separate findings.

| Per-release page | Delta output consumed | Page decision driven by the delta |
| --- | --- | --- |
| `assets.md` | `assets.json` projection plus canonical renderer bundle | Verify client/resource roots; list added/removed/changed/renamed renderer inputs and coverage; require source and adapter ownership. |
| `anvil.md` | `anvil.json` plus canonical Anvil inventory digests | Verify exact server-generated schema findings, removed/renamed fields and decoder fixture/reference evidence. |
| `paper-snapshot.md` | Canonical bundle identity for release linkage only; Paper remains an independent axis | Keep live Paper availability/build/snapshot findings independent of client renderer and saved Anvil status. |
| `reference-and-parity.md` | All renderer change IDs, Anvil render-visible change IDs, `dynmap-oracle.json`, `dynmap-source-delta.json` | Require exact compatible oracle traces and per-change normalized pixel comparison; verify explicit removals and no-change proof. |
| `real-acceptance.md` | Verified delta bundle digest, adapter profile IDs and parity evidence IDs | Exercise at least one exact-release real-world case for each material behavior family and all release-specific adapters; it cannot upgrade pending extraction evidence. |

The downstream phase runner/generator work must make every version page print the canonical bundle status and digest and reject `pending_*`, `blocked`, or `failed` where the page requires a completed gate. For 48 releases, a finished delta ledger means 48 independently complete bundles (or an updated official release set after refresh), not 48 generated links. Five pages per version are consumers of this ledger, not five separate data-delta attestations.

## Acceptance gates

1. **Exact identity gate:** target and predecessor match consecutive official stable releases; first release is explicitly absolute baseline. All official hashes and byte lengths match and downloaded SHA-256 is recorded.
2. **Complete-input gate:** client JAR entries and asset-index objects are independently enumerated and verified; exact server JAR world recipe and fixture digests exist; resource precedence is resolved; no required input is unavailable.
3. **Coverage gate:** every registry block/state and every enumerated resource is classified relevant/excluded/unresolved; relevant model/texture/biome/material/light closure is complete; unresolved count is zero.
4. **Delta gate:** every add/remove/change/rename is represented with deterministic ID and before/after values; all transitive impacts are listed; no removed/renamed item is lost by a one-sided target scan.
5. **Anvil gate:** schema comparison comes from exact bytes; all listed field/encoding classes are checked; `DataVersion` is not used as a proxy; decoder fixtures match exact reference-domain results.
6. **Ownership gate:** every renderer change maps to concrete Dynmap source symbol IDs, exact target oracle source revision, Rust adapter/profile owner and owning phase. No adapter is introduced solely because hashes differ.
7. **Behavior gate:** every renderer-visible change has fixture, exact Dynmap trace and pixel-parity result; every storage-only change has raw fixture and decode/reference digest; render-visible Anvil changes also pass renderer trace and pixel parity.
8. **No-change gate:** only the complete equal-inventory/fingerprint proof in step 6 above can yield `no_change_verified`; pending or incomplete input always remains pending/blocked.
9. **Reproducibility gate:** clean re-extraction from the same verified bytes and pinned toolchain reproduces canonical inventory, bundle and report hashes exactly. Golden artifacts are captured before tests and never self-updated by test execution.
10. **Downstream gate:** each of the five pages for a release points to the same bundle digest, and the reference/parity page consumes every change/evidence ID. The matrix remains an index; its hashes and release count are not accepted as substitutes.

At plan authoring time, exact input artifacts are not proven downloaded. Initial outputs for every release must therefore use `status: "pending_input"`, null inventory fingerprints and an empty, explicitly unverified change list. The first executable follow-up is the read-only `--all --plan`, followed by artifact download and per-release extraction; it must not begin by writing `no_change_verified` for any release.
