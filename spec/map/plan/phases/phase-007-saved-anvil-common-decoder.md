# P-007: Shared Saved Anvil/NBT decoder

## 目的と固定対象

- 対象source/symbol: Anvil region/NBT primitives and every versioned chunk-layout dependency。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: bounded common region/NBT reader plus per-version decoder interface。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 002,006。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: panic, overread, allocation outside budget, invalid chunk normalized to valid empty, wrong adapter accepted.

## 実装作業

1. Decode region header/sector table/compression/NBT with checked offsets, lengths, endianness and allocation ceilings.
2. Decode chunk status, sections, palettes, packed states, heightmaps, biomes and light into domain.
3. Handle negative region/chunk coordinates, cross-region neighbors, legacy section formats and modern layouts via version adapters.
4. Report truncated, malformed, wrong DataVersion, missing chunk and valid empty generated chunk distinctly.

- 固定fixture / reference: real captured region plus deterministic malformed/truncated/overflow/negative-coordinate fixtures for each supported family.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: shared decoder yields stable domain digest for valid chunks and structured non-success for every malformed case.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core world::anvil && cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: add bounded anvil decoder core
```
