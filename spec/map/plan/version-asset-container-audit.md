# Minecraft renderer asset container audit

**Audit date:** 2026-09-23
**Purpose:** Establish which official archive roots must be inspected when planning exact-version renderer asset support.
**Status:** Two package-layout probes only; not a 48-release semantic delta audit and not evidence of renderer/pixel support.

## Method

For each probe, the client JAR and asset-index JSON were selected from the exact official version metadata recorded in `spec/map/coverage/version-matrix.json`. Declared SHA-1 and byte length identify the Mojang artifact; downloaded client JAR bytes were independently hashed with SHA-256. Non-directory ZIP entries were enumerated from the verified JAR. The 26.3 asset-index JSON was also verified using its official SHA-1 and byte length before counting objects and checking renderer-path prefixes.

The counts below are archive observations, not block/state compatibility conclusions. File counts cannot establish which states are registered, which models are selected for each state, or whether their final pixels match Dynmap.

## Verified observations

| Release | Artifact | Official SHA-1 / length | Downloaded SHA-256 | Observed content |
|---|---|---|---|---|
| 1.14 | [client JAR](https://piston-data.mojang.com/v1/objects/7a762a59345c13af7d87111207a93f5a8607f6c0/client.jar) | `7a762a59345c13af7d87111207a93f5a8607f6c0` / 18,796,546 bytes | `93907cbf0655aa5f10d049efa4d745f4250eecc5d0d5d1268046eec3144f323a` | 12,734 non-directory entries; 677 `assets/minecraft/blockstates/*.json`; 1,201 `assets/minecraft/models/block/*.json`; 641 `assets/minecraft/textures/block/*`; 2 `assets/minecraft/textures/colormap/*`; 3,083 `data/minecraft/*` entries. |
| 26.3 | [client JAR](https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar) | `e877b6a07acd633fb3bb475002175cec036e7b87` / 41,483,720 bytes | `4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d` | 32,878 non-directory entries; 1,288 blockstate JSON files; 2,883 block models; 1,405 block textures; 3 colormap resources; 9,883 `data/minecraft/*` entries. |
| 26.3 | [asset-index JSON](https://piston-meta.mojang.com/v1/packages/32a06dd28a0a8a981f4a1dffbdb3931f3075ca6c/34.json) | `32a06dd28a0a8a981f4a1dffbdb3931f3075ca6c` / 597,035 bytes; index ID `34` | SHA-256 not retained in this note; fetch and compute it in the per-version inventory | 5,147 object mappings; zero object logical paths under `assets/minecraft/blockstates/`, `assets/minecraft/models/block/`, `assets/minecraft/textures/block/`, or `assets/minecraft/textures/colormap/`. |

The 1.14 client JAR metadata is recorded in the version matrix; the exact 1.14 version metadata URL is `https://piston-meta.mojang.com/v1/packages/0fd01dd81eaa451d3130b1cf025a10f129585b10/1.14.json`. The audit confirms renderer-relevant resources are directly present in the client JAR for both sampled releases, while the 26.3 asset index does not enumerate those renderer path families. Therefore neither of these assumptions is valid: “all renderer assets come from the asset index” and “the client JAR alone is the universal asset source.”

## Why exact-version comparison is useful

Exact-version work does **not** mean writing one Rust renderer per patch release. It determines which shared data profiles are valid and where a real adapter boundary is required. Two official release notes illustrate the kinds of renderer-visible and storage-format changes that must be checked against the artifacts:

- Minecraft 1.18 documents both changed world height/depth and a changed chunk format. The Anvil phase must compare real 1.17.1 and 1.18 server-generated chunk/region bytes and schema fingerprints, rather than copying one decoder profile across that boundary. See the [official 1.18 release notes](https://feedback.minecraft.net/hc/en-us/articles/4415128577293-Minecraft-Java-Edition-1-18).
- Minecraft 26.1 documents large world-data changes, a tripwire transparency/rendering change, and a lightmap rendering change. These are candidate leads: the exact client/server artifacts still have to establish which block-state/model/texture/light inputs changed and whether each change affects MC-Vector's renderer. See the [official 26.1 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1).

Release notes are discovery hints, **not** version-delta evidence. A renderer-data delta is accepted only from the exact artifact-derived block/state/model/texture or Anvil fingerprint diff described below. Equal normalized fingerprints plus exact artifact digests are required to claim there is no renderer-input delta. A code implementation-profile boundary is a separate decision: different fingerprints may share the existing generic profile only after every renderer-visible change has exact fixture and Dynmap-reference/Rust-pixel parity; create an adapter only for an observed behavior gap the existing profile cannot handle.

## Required version-delta pipeline

Each exact release must independently produce and compare these source inventories against the immediately preceding stable release (1.14 is the absolute baseline):

1. Complete client-JAR ZIP entry inventory, tied to the exact downloaded JAR SHA-256. For each consumed entry, record logical resource path, entry path, uncompressed length, CRC, extracted SHA-256, and consuming blockstate/model/renderer/resource symbol IDs.
2. Complete asset-index object mapping inventory, tied to the exact asset-index digest. For each renderer-consumed object, record logical path, official SHA-1 and length, downloaded byte SHA-1 and SHA-256, and consumer/reference edge.
3. A canonical logical-resource map that preserves every source observation and applies only the exact-version resource manager precedence demonstrated by the corresponding runtime. Identical bytes may deduplicate. Conflicting bytes at the same logical path are a hard failure unless precedence is proven from the exact version's runtime behavior and captured in a version-bound rule; never silently prefer one container.
4. Exact runtime block registry and full state-property/value inventory, cross-checked with client blockstate selectors. Diff additions, removals, renames, and changed states—not merely filenames.
5. A complete blockstate → selected variant/multipart clauses → inherited/resolved model graph → texture variables → verified texture/metadata bytes closure. Diff model geometry, face/UV/rotation/uvlock/cullface, alpha, tint/material, lighting/emission inputs, and source-container changes.
6. Per-release normalized renderer-input fingerprint and concrete `added` / `removed` / `changed` records. Every renderer-input change must link to exact-version fixtures, Dynmap reference traces and Rust pixel comparisons. A change may use an existing generic profile without a new adapter when those comparisons pass. A no-delta claim requires matching normalized fingerprints and retained source artifact digests; empty arrays alone never pass. Adapter ownership is required only when a concrete pre-adapter behavior-gap failure is observed.

The asset report schema is version 2 and must bind `clientJarEntries`, `assetIndexObjects`, `canonicalResourceMap`, `blockRegistry`, `blockStates`, `resolvedModelGraph`, and `rendererAssetClosure`. Its source roots are always explicitly represented—even when a root contributes zero renderer resources—and its conflict/unresolved/unverified counts must be zero.

## Scope boundary

These two probes justify inspecting both official containers and are packaging-layout regression cases only. They do not report 1.14→26.3 added/removed block IDs, property changes, resolved-model deltas, asset parity, Anvil compatibility, Paper support, or Dynmap pixel parity. All 48 release rows remain pending until the exact per-release extraction/comparison evidence exists.
