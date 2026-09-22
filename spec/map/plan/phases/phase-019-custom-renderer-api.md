# P-019: Dynmap CustomRenderer/MapDataContext API contract

## 目的と固定対象

- 対象source/symbol: DynmapCoreAPI renderer six source files。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: Rust-compatible API semantics needed by all Dynmap built-ins。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000,006,010,013。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: API method stub returns synthetic data that changes renderer output, hidden context dependency or untracked method.

## 実装作業

1. Port lifecycle, block-state context, neighbor reads, tile/entity data access and missing-data behavior from API source.
2. Port RenderPatch/Factory interface contract and CustomColorMultiplier call semantics without importing Bukkit.
3. Document every API method as implemented, adapter-only or out-of-scope with reason and fixture.
4. Run every built-in against the same Rust API model; keep method results and call order traceable.

- 固定fixture / reference: neighbor reads at chunk edge, absent tile data, property lookup, patch factory args, color multiplier lifecycle.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: every required API symbol is mapped and each built-in consumes identical contract semantics.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core --test dynmap_api_contract && bun run test:map:reference
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap renderer api contracts
```
