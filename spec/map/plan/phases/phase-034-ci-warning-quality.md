# P-034: Warning-clean Rust and exhaustive CI matrix

## 目的と固定対象

- 対象source/symbol: Cargo workspace, Java/Gradle harness, TypeScript scripts and catalogs。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: reproducible CI gates derived from source/version manifests。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000-033。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: catalog drift ignored, action/version matrix stale, warning suppression, CI green while required target silently omitted.

## 実装作業

1. Run fmt/check/clippy -D warnings/test for renderer crate independently from unrelated application warnings.
2. Run Java oracle and immutable fixture verifier; reject runtime golden generation.
3. Generate all per-version CI jobs from version-matrix JSON; do not keep hand-written duplicate release list.
4. Run Bun check/test/typecheck/build and cargo app-library tests with separately reported outcomes.
5. Keep real Paper/Tauri manual evidence as an explicit gate rather than claiming CI mock proves it.

- 固定fixture / reference: clean checkout workflow, changed version manifest, missing phase file, unexpected new source/resource/builtin, lint regression.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all automated supported gates are green, with real acceptance still separately evidenced.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun run check && bun run test && bun run typecheck:tests && bun run build && cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
ci: enforce map renderer coverage matrix
```
