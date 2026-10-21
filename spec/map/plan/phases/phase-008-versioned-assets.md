# P-008: Verified client JAR/resource pack loading

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-008",
  "kind": "common",
  "document": "phases/phase-008-versioned-assets.md",
  "dependsOn": [
    "P-001",
    "P-002",
    "P-003",
    "P-005"
  ],
  "commitMessage": "feat: load versioned minecraft renderer assets"
}
```

## 目的と固定対象

- 対象source/symbol: TexturePackLoader and both Minecraft client-JAR and asset-index resource roots。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: version-bound read-only resource union with exact per-path provenance and deterministic source resolution。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 001,002,003,005。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: path escape, unverified bytes, unproven source precedence, ambiguous duplicate, unresolved blockstate/model/texture edge, guessed checkerboard/material fallback or cross-version cache reuse.

## 実装作業

1. Verify the exact client JAR and asset-index metadata against version JSON SHA-1/length, then hash downloaded bytes with SHA-256; enumerate client-JAR ZIP entries and asset-index logical-path/object mappings as separate complete inventories.
2. Build a canonical logical-resource map from both roots; preserve each candidate source, byte digest, official SHA-1/size where applicable, and per-version source-resolution rule. Identical duplicates may deduplicate; byte-conflicting duplicates fail unless exact-version vanilla runtime behavior proves a deterministic precedence rule and the evidence is recorded.
3. Resolve renderer closure from block registry/state through blockstate variant/multipart selectors, model parent/texture variables, models and texture/metadata bytes across the canonical map; record added/removed/changed IDs, properties, selectors, model edges, texture pixel/alpha digests, biome/material/light inputs and source-location changes against the preceding stable release.
4. Require complete inventories for all client-JAR entries, asset-index objects, block registry, block states, canonical resource map, resolved model graph and renderer-only closure; bind every manifest to exact target/baseline artifacts and fail unresolved, missing, unverified or ambiguous paths.
5. Load exact-version renderer assets with namespace/path canonicalization, pack.mcmeta and explicit vanilla/user-pack precedence; keep Minecraft assets separate from Dynmap source and Core artifact.
6. Use the 1.14 and 26.3 client-JAR probes only as packaging-layout regression fixtures; they do not prove semantic version deltas, adapter coverage or pixel parity.

- 固定fixture / reference: exact 1.14 and 26.3 JAR/index packaging probes, path relocation, JAR-only/index-only/identical duplicate/conflicting logical path, traversal/zip bomb, version mismatch, model inheritance, multipart selection, texture alpha and corrupted bytes.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: the asset report is schema v2, both official source roots are exact-digest-bound, every renderer-visible block/state resolves through verified model and texture bytes, and semantic deltas or verified no-diff fingerprints are linked to fixtures and Java-reference pixel evidence.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core assets && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: load versioned minecraft renderer assets
```
