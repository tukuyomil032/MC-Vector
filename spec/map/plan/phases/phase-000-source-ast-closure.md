# P-000: Pinned source AST と依存closure

## 目的と固定対象

- 対象source/symbol: pinned Dynmap Java 106 candidate filesとその全call/resource dependencies。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: stable AST symbol ledger、call/data/resource edge、required/adapter-only/excluded分類、source-to-phase map。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: なし。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: parse失敗、unresolved required call edge、未分類symbol、未登録source file、重複symbol IDはphase failure。

## 実装作業

1. JDK Compiler Tree APIでclass/interface/enum/record、constructor、overloaded method signature、field、enum constant、annotation、source spanを収集する。
2. method call、field/type参照、reflection/registry/resource lookupを抽出し、pinned source tree上のdependency graphを作る。
3. candidate 106 fileに限らずrenderer reachable dependencyを再帰追跡し、欠けたsource fileをsource snapshotとcoverage manifestへ追加する。
4. 各symbolをrequired / adapter-only / excludedへ分類し、excludedは呼び出し元とMC-Vector境界を根拠として記録する。
5. regex由来1,489 rowsをauthorityから外し、overloadを別IDにしたAST schemaで置き換える。

- 固定fixture / reference: overload、nested type、generic/annotation、constructor delegation、reflection登録、resource lookup、外部API adapter境界の小fixtureと全pinned Java file parse report。
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: pinned Java declaration/referenceがAST台帳へ1対1対応し、renderer dependency closureの未分類が0。
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-renderer-coverage.mjs --require-source-ast --require-closed-dependencies
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: close pinned dynmap renderer source inventory
```
