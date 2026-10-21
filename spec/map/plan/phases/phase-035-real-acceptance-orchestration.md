# P-035: All-version Paper/Tauri acceptance runs

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-035",
  "kind": "common",
  "document": "phases/phase-035-real-acceptance-orchestration.md",
  "dependsOn": [
    "P-023",
    "P-024",
    "P-025",
    "P-026",
    "P-027",
    "P-028",
    "P-029",
    "P-030",
    "P-031",
    "P-032",
    "P-033",
    "P-034",
    "V-1.14-real-acceptance",
    "V-1.14.1-real-acceptance",
    "V-1.14.2-real-acceptance",
    "V-1.14.3-real-acceptance",
    "V-1.14.4-real-acceptance",
    "V-1.15-real-acceptance",
    "V-1.15.1-real-acceptance",
    "V-1.15.2-real-acceptance",
    "V-1.16-real-acceptance",
    "V-1.16.1-real-acceptance",
    "V-1.16.2-real-acceptance",
    "V-1.16.3-real-acceptance",
    "V-1.16.4-real-acceptance",
    "V-1.16.5-real-acceptance",
    "V-1.17-real-acceptance",
    "V-1.17.1-real-acceptance",
    "V-1.18-real-acceptance",
    "V-1.18.1-real-acceptance",
    "V-1.18.2-real-acceptance",
    "V-1.19-real-acceptance",
    "V-1.19.1-real-acceptance",
    "V-1.19.2-real-acceptance",
    "V-1.19.3-real-acceptance",
    "V-1.19.4-real-acceptance",
    "V-1.20-real-acceptance",
    "V-1.20.1-real-acceptance",
    "V-1.20.2-real-acceptance",
    "V-1.20.3-real-acceptance",
    "V-1.20.4-real-acceptance",
    "V-1.20.5-real-acceptance",
    "V-1.20.6-real-acceptance",
    "V-1.21-real-acceptance",
    "V-1.21.1-real-acceptance",
    "V-1.21.10-real-acceptance",
    "V-1.21.11-real-acceptance",
    "V-1.21.2-real-acceptance",
    "V-1.21.3-real-acceptance",
    "V-1.21.4-real-acceptance",
    "V-1.21.5-real-acceptance",
    "V-1.21.6-real-acceptance",
    "V-1.21.7-real-acceptance",
    "V-1.21.8-real-acceptance",
    "V-1.21.9-real-acceptance",
    "V-26.1-real-acceptance",
    "V-26.1.1-real-acceptance",
    "V-26.1.2-real-acceptance",
    "V-26.2-real-acceptance",
    "V-26.3-real-acceptance"
  ],
  "commitMessage": "test: record complete map renderer real acceptance"
}
```

## 目的と固定対象

- 対象source/symbol: all exact-version real-acceptance pages and evidence matrix。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: one evidence record per exact release and final UI/process/port results。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 023-034 and every version real-acceptance child。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: missing version row, Paper mock, app stopped by force without UI evidence, port check omitted, evidence without hashes/commit.

## 実装作業

1. Provision version-matched Paper and Java runtime for each matrix entry; if unavailable, keep that version blocked and continue independent versions.
2. Execute the version-specific real-acceptance command and manual UI sequence from each child page.
3. Record plugin load, hello/heartbeat, loaded snapshots, actual terrain, cache, zoom/pan, failure safety and artifact digests per release.
4. Stop Paper via app UI; record process exit and port 25565 release before closing app.
5. Never copy evidence from fixture/mock/smoke or a neighboring version.

- 固定fixture / reference: real server worlds and client assets for every exact version; no synthetic-only substitution.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: all exact releases in the verified manifest snapshot have independently verified real evidence; unresolved row blocks entire Goal.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-acceptance-evidence.mjs --require-complete
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
test: record complete map renderer real acceptance
```
