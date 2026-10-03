# P-010: RenderPatch/patch factory geometry

## 目的と固定対象

- 対象source/symbol: PatchDefinition, PatchDefinitionFactory, RenderPatch, RenderPatchFactory, Polygon。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: face/partial/rotated patch construction, intersection and UV basis。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 004,006,009。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: wrong winding/UV/side visibility silently accepted or invalid geometry rendered with guessed fallback.

## 実装作業

1. Port patch plane, origin, axes, normal, winding, side visibility, texture index, UV rotation and bounds.
2. Port factory methods and parameter semantics from the exact API; preserve float order and validation behavior.
3. Implement ray/plane/patch intersection, parallel/degenerate/backface rules, face orientation and culling.
4. Expose trace fields needed to compare vertices, face index, hit distance and UV with Java.

- 固定fixture / reference: all cube faces, partial/diagonal/rotated patch, transparent patch, parallel ray, degenerate basis, backface and boundary hit.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: factory construction and patch-hit traces match fixed Java reference vectors.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core geometry && bun run test:map:reference
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: port dynmap patch geometry and intersections
```
