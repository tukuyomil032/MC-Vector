# MC-Vector Map Renderer Phase Index

基準: 2026-09-23。全体Goalの完了条件は[definition-of-done.md](definition-of-done.md)、継続実行指示は[goal-prompt.md](goal-prompt.md)。phaseは依存順に進め、失敗を別phaseのpassで覆わない。

## 共通実装phase

| ID | 内容 | 個別phase | 依存 | 独立commit message |
| --- | --- | --- | --- | --- |
| P-000 | Pinned source AST と依存closure | [phase file](phases/phase-000-source-ast-closure.md) | なし | `chore: close pinned dynmap renderer source inventory` |
| P-001 | 全renderer resource consumer closure | [phase file](phases/phase-001-resource-closure.md) | 000 | `chore: close dynmap renderer resource inventory` |
| P-002 | Minecraft exact release matrixとartifact lock | [phase file](phases/phase-002-version-matrix-lock.md) | 000,001 | `chore: lock exact minecraft release matrix` |
| P-003 | Apache-2.0 source attribution and distribution boundary | [phase file](phases/phase-003-license-source-boundary.md) | 000,001 | `chore: define map renderer source and license boundary` |
| P-004 | Pinned Java reference renderer harness | [phase file](phases/phase-004-java-reference-harness.md) | 000,001,003 | `test: build pinned dynmap java reference harness` |
| P-005 | Warning-clean Rust renderer crate boundary | [phase file](phases/phase-005-renderer-core-isolation.md) | 000,003 | `ref: isolate map renderer core boundary` |
| P-006 | Dynmap-equivalent source-independent chunk domain | [phase file](phases/phase-006-source-independent-domain.md) | 000,005 | `feat: define complete map chunk renderer domain` |
| P-007 | Shared Saved Anvil/NBT decoder | [phase file](phases/phase-007-saved-anvil-common-decoder.md) | 002,006 | `feat: add bounded anvil decoder core` |
| P-008 | Verified client JAR/resource pack loading | [phase file](phases/phase-008-versioned-assets.md) | 001,002,003,005 | `feat: load versioned minecraft renderer assets` |
| P-009 | Matrix/vector and HD perspective transforms | [phase file](phases/phase-009-dynmap-matrix-perspective.md) | 004,006 | `feat: port dynmap matrix and perspective transforms` |
| P-010 | RenderPatch/patch factory geometry | [phase file](phases/phase-010-dynmap-patch-geometry.md) | 004,006,009 | `feat: port dynmap patch geometry and intersections` |
| P-011 | MapIterator and voxel/ray traversal | [phase file](phases/phase-011-dynmap-voxel-traversal.md) | 006,007,009,010 | `feat: port dynmap map iterator and voxel traversal` |
| P-012 | Versioned blockstate and model resolver | [phase file](phases/phase-012-blockstate-model-resolution.md) | 001,002,008,010 | `feat: resolve minecraft blockstate models` |
| P-013 | HDBlockModels and custom/volumetric model registry | [phase file](phases/phase-013-hd-block-model-registry.md) | 000,006,010,012,019 | `feat: port dynmap block model registry` |
| P-014 | TexturePack atlas, UV and alpha pipeline | [phase file](phases/phase-014-texture-pack-and-atlas.md) | 001,004,008,010,012,013 | `feat: port dynmap texture pack and atlas` |
| P-015 | Connected Texture Mod (CTM) behavior | [phase file](phases/phase-015-ctm-texture-pack.md) | 011,012,014 | `feat: port dynmap connected texture rules` |
| P-016 | Biome tint, color multipliers and materials | [phase file](phases/phase-016-biome-color-material.md) | 006,007,012,014 | `feat: port dynmap biome colors and materials` |
| P-017 | HDLighting implementations | [phase file](phases/phase-017-hd-lighting.md) | 006,007,010,011,016 | `feat: port dynmap hd lighting` |
| P-018 | HDShader lifecycle and shader resources | [phase file](phases/phase-018-hd-shader.md) | 001,014,016,017 | `feat: port dynmap hd shader lifecycle` |
| P-019 | Dynmap CustomRenderer/MapDataContext API contract | [phase file](phases/phase-019-custom-renderer-api.md) | 000,006,010,013 | `feat: port dynmap renderer api contracts` |
| P-020 | Complete built-in renderer registry | [phase file](phases/phase-020-builtin-registry.md) | 000,019 | `chore: map every dynmap builtin to an implementation phase` |
| P-021 | 39 individual built-in renderer phases | [phase file](phases/phase-021-builtin-renderer-family-gate.md) | 004,006,009-020 | `feat: complete dynmap builtin renderer set` |
| P-022 | Pixel rasterization and alpha compositing | [phase file](phases/phase-022-raster-compositing.md) | 014,016,017,018 | `feat: port dynmap raster and alpha compositing` |
| P-023 | Full intermediate trace and pixel parity | [phase file](phases/phase-023-reference-pixel-parity.md) | 004,009-022 | `test: enforce full dynmap reference and pixel parity` |
| P-024 | Paper snapshot provider, Core artifact and protocol | [phase file](phases/phase-024-paper-snapshot-protocol.md) | 002,003,006,007,019 | `feat: implement paper snapshot provider protocol` |
| P-025 | Saved Anvil and Paper live renderer equivalence | [phase file](phases/phase-025-saved-live-equivalence.md) | 007,024,all-version-anvil-paper-stage | `test: prove saved and live renderer equivalence` |
| P-026 | WorldXZ/Iso tile geometry and zoom pyramid | [phase file](phases/phase-026-tile-geometry-pyramid.md) | 009,011,025 | `feat: implement map tile geometry and zoom pyramid` |
| P-027 | Verified tile cache, stale and retry states | [phase file](phases/phase-027-verified-tile-cache.md) | 022,023,026 | `feat: add verified map tile cache` |
| P-028 | Bounded tile scheduler and cancellation | [phase file](phases/phase-028-bounded-render-scheduler.md) | 026,027 | `feat: add bounded map render scheduler` |
| P-029 | Connect verified renderer to Tauri IPC | [phase file](phases/phase-029-tauri-ipc-diagnostics.md) | 025,027,028 | `feat: connect map renderer to tauri ipc` |
| P-030 | Map status, diagnostic and consent UI | [phase file](phases/phase-030-status-consent-ui.md) | 029 | `feat: expose verified map renderer status` |
| P-031 | Cursor-anchored continuous zoom and committed pan | [phase file](phases/phase-031-smooth-zoom-pan.md) | 026,027,029,030 | `feat: add cursor anchored map zoom and pan` |
| P-032 | Cross-layer failure and consent safety | [phase file](phases/phase-032-failure-safety.md) | 025,027-031 | `fix: enforce map renderer failure safety` |
| P-033 | Renderer input bounds, security and memory | [phase file](phases/phase-033-resource-security-performance.md) | 007,008,011,027-029 | `fix: bound map renderer resource usage` |
| P-034 | Warning-clean Rust and exhaustive CI matrix | [phase file](phases/phase-034-ci-warning-quality.md) | 000-033 | `ci: enforce map renderer coverage matrix` |
| P-035 | All-version Paper/Tauri acceptance runs | [phase file](phases/phase-035-real-acceptance-orchestration.md) | 023-034 and every version real-acceptance child | `test: record complete map renderer real acceptance` |
| P-036 | Strict final source-to-runtime closure audit | [phase file](phases/phase-036-final-coverage-audit.md) | 000-035 and all generated specialist phases | `test: close complete map renderer coverage audit` |

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
