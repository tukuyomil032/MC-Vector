# P-025: Saved Anvil and Paper live renderer equivalence

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-025",
  "kind": "common",
  "document": "phases/phase-025-saved-live-equivalence.md",
  "dependsOn": [
    "P-007",
    "P-024",
    "V-1.14-anvil",
    "V-1.14-paper-snapshot",
    "V-1.14.1-anvil",
    "V-1.14.1-paper-snapshot",
    "V-1.14.2-anvil",
    "V-1.14.2-paper-snapshot",
    "V-1.14.3-anvil",
    "V-1.14.3-paper-snapshot",
    "V-1.14.4-anvil",
    "V-1.14.4-paper-snapshot",
    "V-1.15-anvil",
    "V-1.15-paper-snapshot",
    "V-1.15.1-anvil",
    "V-1.15.1-paper-snapshot",
    "V-1.15.2-anvil",
    "V-1.15.2-paper-snapshot",
    "V-1.16-anvil",
    "V-1.16-paper-snapshot",
    "V-1.16.1-anvil",
    "V-1.16.1-paper-snapshot",
    "V-1.16.2-anvil",
    "V-1.16.2-paper-snapshot",
    "V-1.16.3-anvil",
    "V-1.16.3-paper-snapshot",
    "V-1.16.4-anvil",
    "V-1.16.4-paper-snapshot",
    "V-1.16.5-anvil",
    "V-1.16.5-paper-snapshot",
    "V-1.17-anvil",
    "V-1.17-paper-snapshot",
    "V-1.17.1-anvil",
    "V-1.17.1-paper-snapshot",
    "V-1.18-anvil",
    "V-1.18-paper-snapshot",
    "V-1.18.1-anvil",
    "V-1.18.1-paper-snapshot",
    "V-1.18.2-anvil",
    "V-1.18.2-paper-snapshot",
    "V-1.19-anvil",
    "V-1.19-paper-snapshot",
    "V-1.19.1-anvil",
    "V-1.19.1-paper-snapshot",
    "V-1.19.2-anvil",
    "V-1.19.2-paper-snapshot",
    "V-1.19.3-anvil",
    "V-1.19.3-paper-snapshot",
    "V-1.19.4-anvil",
    "V-1.19.4-paper-snapshot",
    "V-1.20-anvil",
    "V-1.20-paper-snapshot",
    "V-1.20.1-anvil",
    "V-1.20.1-paper-snapshot",
    "V-1.20.2-anvil",
    "V-1.20.2-paper-snapshot",
    "V-1.20.3-anvil",
    "V-1.20.3-paper-snapshot",
    "V-1.20.4-anvil",
    "V-1.20.4-paper-snapshot",
    "V-1.20.5-anvil",
    "V-1.20.5-paper-snapshot",
    "V-1.20.6-anvil",
    "V-1.20.6-paper-snapshot",
    "V-1.21-anvil",
    "V-1.21-paper-snapshot",
    "V-1.21.1-anvil",
    "V-1.21.1-paper-snapshot",
    "V-1.21.10-anvil",
    "V-1.21.10-paper-snapshot",
    "V-1.21.11-anvil",
    "V-1.21.11-paper-snapshot",
    "V-1.21.2-anvil",
    "V-1.21.2-paper-snapshot",
    "V-1.21.3-anvil",
    "V-1.21.3-paper-snapshot",
    "V-1.21.4-anvil",
    "V-1.21.4-paper-snapshot",
    "V-1.21.5-anvil",
    "V-1.21.5-paper-snapshot",
    "V-1.21.6-anvil",
    "V-1.21.6-paper-snapshot",
    "V-1.21.7-anvil",
    "V-1.21.7-paper-snapshot",
    "V-1.21.8-anvil",
    "V-1.21.8-paper-snapshot",
    "V-1.21.9-anvil",
    "V-1.21.9-paper-snapshot",
    "V-26.1-anvil",
    "V-26.1-paper-snapshot",
    "V-26.1.1-anvil",
    "V-26.1.1-paper-snapshot",
    "V-26.1.2-anvil",
    "V-26.1.2-paper-snapshot",
    "V-26.2-anvil",
    "V-26.2-paper-snapshot",
    "V-26.3-anvil",
    "V-26.3-paper-snapshot"
  ],
  "commitMessage": "test: prove saved and live renderer equivalence"
}
```

## 目的と固定対象

- 対象source/symbol: same chunk bytes through Anvil and Paper provider into ChunkView。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: source-independent input digest, identical Java/Rust trace and PNG。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 007,024,all-version-anvil-paper-stage。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: source-specific renderer branch, coordinate mismatch, accepted partial snapshot or empty terrain inference.

## 実装作業

1. Capture same loaded chunk into saved fixture and Paper response with exact identity and asset set.
2. Normalize both adapters to same domain and compare every block/palette/biome/height/light field digest.
3. Render both through one Rust renderer instance and compare full trace and normalized RGBA.
4. Report source and unavailable counts separately; zero live responses never means generated terrain absent.

- 固定fixture / reference: same flat/complex/mixed biome/light chunk from both adapters plus unloaded/timeout and malformed cases.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: equivalent domain digest and output bytes match; unavailable states remain explicit.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test saved_live_equivalence
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
test: prove saved and live renderer equivalence
```
