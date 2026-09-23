# P-012: Versioned blockstate and model resolver

## 目的と固定対象

- 対象source/symbol: DynmapBlockState, blockstate JSON/model references, version data definitions。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: deterministic variant/multipart/model inheritance resolver。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 001,002,008,010。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: fallback to default/guessed model on unmatched state, parent cycle, wrong asset version or malformed face.

## 実装作業

1. Parse blockstate variants and multipart conditions with exact property matching, defaults and state aliases.
2. Resolve model parent chains, texture variables, x/y rotations, uvlock, cullface, AO and element faces.
3. Support version-specific registries and resource format profiles without version branches in shared ray code.
4. Return unsupported/missing/cycle failures with source IDs and selected branch trace.

- 固定fixture / reference: stone, grass, stairs, slabs, fences, doors, leaves, glass, fluids, redstone, rails; parent cycles and malformed JSON.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: selected variant/multipart branch, parent chain and final face descriptors match the Java/reference resolver.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core assets::blockstate && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: resolve minecraft blockstate models
```
