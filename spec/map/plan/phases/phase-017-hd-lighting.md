# P-017: HDLighting implementations

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-017",
  "kind": "common",
  "document": "phases/phase-017-hd-lighting.md",
  "dependsOn": [
    "P-006",
    "P-007",
    "P-010",
    "P-011",
    "P-016"
  ],
  "commitMessage": "feat: port dynmap hd lighting"
}
```

## 目的と固定対象

- 対象source/symbol: HDLighting, DefaultHDLighting, LightLevelHDLighting, ShadowHDLighting, LightLevels。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: exact face shade, ambient, sky/block light, shadow and brightness result。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 006,007,010,011,016。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: fixed light fallback, guessed missing light, wrong table rounding or face orientation dependence.

## 実装作業

1. Port brightness table, face direction shade, ambient and emitted light behavior from Java.
2. Use decoded sky/block samples and perspective hit geometry; do not inject fixed light.
3. Port default/light-level/shadow policies and configuration boundaries.
4. Expose per-ray lighting trace including raw sample, selected rule, multiplier and output channel.

- 固定fixture / reference: sky/block light 0..15 cross product, day/night, all face directions, shadow on/off, emissive, cave and water.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: light selection, shade factor, ambient and output RGBA match Java traces across the finite matrix.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core renderer::dynmap::lighting && bun run test:map:reference
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap hd lighting
```
