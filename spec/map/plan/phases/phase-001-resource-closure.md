# P-001: 全renderer resource consumer closure

## 目的と固定対象

- 対象source/symbol: DynmapCore resources全件、Java resource loader/consumer、client JAR/pack resource。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: 全resourceのhash・consumer symbol・scope・version adapter・fixture/evidence link。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: consumerなしのrequired項目、同一path衝突、実参照を未説明でexcludedにする分類、asset zip bombはfailure。

## 実装作業

1. 3,485 current candidatesに限らずpinned resource tree全entryをenumerateしdigestを計算する。
2. AST call edgeと文字列/resource lookup解析からtexturepacks、renderdata、colorschemes、shaders、lightings、perspectives等のconsumerを特定する。
3. 全resourceをrequired-renderer / adapter-input / excluded-platformに分類し、path heuristicのみの分類を解除する。
4. required resourceごとにparse/resolve fixtureとmissing/invalid failureを割り当てる。

- 固定fixture / reference: valid/duplicate/missing/corrupt/oversized asset、namespaceとoverride precedence、各定義file parse fixtures。
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: pinned resource tree全件にscope/root/hash/consumerまたは根拠付きexcludeがある。
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-renderer-coverage.mjs --require-all-resource-consumers
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: close dynmap renderer resource inventory
```
