# P-018: HDShader lifecycle and shader resources

## 目的と固定対象

- 対象source/symbol: HDShader, HDShaderState, Default/TexturePack/Underwater/Cave/Topo/ChunkStatus/ChunkVersion/Inhabited shaders。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: per-ray shader state, resource/config parser and RGBA output。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 001,014,016,017。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: shader state skipped/reset at wrong pixel, config default guessed, missing input rendered as success.

## 実装作業

1. Port shader state initialization, per-block transitions, pixel completion and required-data declarations.
2. Port each built-in shader and shader/lightings/perspectives definition resource.
3. Match shader-selected material/biome/height/light/underwater/cave inputs and alpha.
4. Reject unknown shader configuration and missing required data with explicit structured errors.

- 固定fixture / reference: all shader variants, above/below water, cave, height bands, chunk status/version, inhabited state, missing required sample.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: lifecycle events, data requirements, selected shader branch and output RGBA match reference.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core shaders && bun run test:map:reference
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap hd shader lifecycle
```
