# P-025: Saved Anvil and Paper live renderer equivalence

## 目的と固定対象

- 対象source/symbol: same chunk bytes through Anvil and Paper provider into ChunkView。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: source-independent input digest, identical Java/Rust trace and PNG。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 007,024,all-version-anvil-paper-stage。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

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
