# P-021: Individual built-in renderer phases

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-021",
  "kind": "common",
  "document": "phases/phase-021-builtin-renderer-family-gate.md",
  "dependsOn": [
    "B-box-renderer",
    "B-box-state-renderer",
    "B-chest-renderer",
    "B-chest-state-renderer",
    "B-copy-stair-block-renderer",
    "B-ctmvert-texture-renderer",
    "B-cuboid-renderer",
    "B-door-renderer",
    "B-door-state-renderer",
    "B-fence-gate-block-renderer",
    "B-fence-gate-block-state-renderer",
    "B-fence-wall-block-renderer",
    "B-fence-wall-block-state-renderer",
    "B-fluid-state-renderer",
    "B-frame-renderer",
    "B-glow-lichen-state-renderer",
    "B-head-renderer",
    "B-immibis-micro-renderer",
    "B-pane-renderer",
    "B-pane-state-renderer",
    "B-plant-renderer",
    "B-rail-craft-slab-block-renderer",
    "B-rail-craft-track-renderer",
    "B-redstone-wire-renderer",
    "B-redstone-wire-state-renderer",
    "B-rotated-box-renderer",
    "B-rotated-patch-renderer",
    "B-rpmicro-renderer",
    "B-rprotated-box-renderer",
    "B-rpsupport-frame-renderer",
    "B-skull-renderer",
    "B-stair-block-renderer",
    "B-stair-state-renderer",
    "B-tfcloose-rock-renderer",
    "B-tfcsupport-renderer",
    "B-tfcwood-renderer",
    "B-thaum-furnace-renderer",
    "B-vine-state-renderer",
    "B-wall-head-renderer",
    "P-004",
    "P-006",
    "P-009",
    "P-010",
    "P-011",
    "P-012",
    "P-013",
    "P-014",
    "P-015",
    "P-016",
    "P-017",
    "P-018",
    "P-019",
    "P-020"
  ],
  "commitMessage": "feat: complete dynmap builtin renderer set"
}
```

## 目的と固定対象

- 対象source/symbol: generated-index.md and class-specific child pages under phases/builtins/。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: independently committed implementations and reference evidence for every in-scope built-in。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 004,006,009-020 and every built-in renderer phase。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: child skipped because another renderer is similar, class covered only by family-level visual test, or evidence inherited from adjacent class.

## 実装作業

1. Execute each B-* child in dependency order; each class owns one commit and one AST-symbol subset.
2. Split any source class whose methods do not form one reviewable task into additional symbol-group child phases before coding it.
3. For mod-integrated built-ins use isolated API data fixtures; do not copy third-party renderer implementations.
4. Run the registry-wide cross-renderer fixture after the final class and check registration collisions.

- 固定fixture / reference: class-specific source-branch fixture sets plus registry interaction fixtures for every in-scope built-in.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all cataloged in-scope built-in child pages passed and class-specific reference/pixel evidence is recorded.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-renderer-coverage.mjs --require-all-builtins && bun run test:map:reference:fixtures
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: complete dynmap builtin renderer set
```
