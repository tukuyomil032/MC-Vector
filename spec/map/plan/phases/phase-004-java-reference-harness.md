# P-004: Pinned Java reference renderer harness

## 目的と固定対象

- 対象source/symbol: actual Dynmap Java renderer closure at pinned revision; existing four empty-context patch traces only as bootstrap。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: repeatable chunk+asset input adapter and traces/PNG from unmodified Java renderer semantics。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000,001,003。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: stubbed algorithm path, hidden method behavior, nondeterministic trace, empty fallback or runtime-generated expected output.

## 実装作業

1. Extend harness to inject complete versioned chunk cache, block state, biome/light, texture/model resources and perspective/shader settings.
2. Replace empty-context-only invocation with deterministic fixture manifest and explicit requested renderer/tile.
3. Capture projection, ray steps, block/model resolution, patch hits, UV, shade/light, shader output, boundary events, RGBA and PNG SHA-256.
4. Compile actual required pinned Java algorithms; stubs may implement only excluded host interfaces and may not provide renderer outputs.
5. Capture reference artifacts before Rust comparisons and verify immutable manifest hashes.

- 固定fixture / reference: flat, cliff, water, forest/leaves, snow, stairs, slab, door, fence, glass, boundary, malformed and custom-pack fixture families.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: reference output is reproducible from pinned Java source and fixture digest for every required renderer primitive.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun run test:map:reference && bun run test:map:reference:fixtures
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
test: build pinned dynmap java reference harness
```
