# P-030: Map status, diagnostic and consent UI

## 目的と固定対象

- 対象source/symbol: src/map/**, MapView, MapSetupModal, App server map consent, i18n。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: Core/client asset/renderer/terrain/source states separated in UI and IPC types。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 029。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通対象にし、該当Minecraft release差分はその版の5 stage pageとversion adapterへ反映する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: consent enabled for unresolved renderer, bridge mislabeled terrain-ready, unresolved failure shown as empty world.

## 実装作業

1. Represent Core artifact, bridge connectivity, client rendering assets, tile state, source and live counts independently.
2. Render downloading/verifying/rendering/empty/unloaded/offline/invalid/retry/restart states with localized redacted codes.
3. Persist consent only when renderer verified and terrain component active or waiting_restart; do not infer from bridge connected.
4. Keep clipboard/App error states outside Map diagnostic mapping.

- 固定fixture / reference: TypeScript state mapping, unresolved enable result, verified active, waiting restart, asset selected but Core missing, raw path/token/body redaction.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: frontend state and Rust return contract agree, all consent/error tests pass in Japanese and English.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun run check && bun run test && bun run typecheck:tests
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
feat: expose verified map renderer status
```
