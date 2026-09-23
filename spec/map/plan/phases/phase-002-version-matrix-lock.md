# P-002: Exact release inventoryとrenderer/Anvil/Paper data-delta profiles

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-002",
  "kind": "common",
  "document": "phases/phase-002-version-matrix-lock.md",
  "dependsOn": [
    "P-000",
    "P-001"
  ],
  "commitMessage": "chore: lock exact minecraft release matrix"
}
```

## 目的と固定対象

- 対象source/symbol: 2026-09-23時点のMojang official version manifestと、1.14以降の各exact stable releaseに対応する公式client/server artifact。現snapshotは48件・最新26.3。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: exact release set、artifact locks、version-delta-matrix.json、releaseごとのdata delta/evidence records、差分に応じたshared implementation profileと必要なadapter owner。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: 000,001。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: official artifact unavailable/mismatch、block registry unresolved、unattributed/conflicting asset source、version-delta row missing、no-diff without matching fingerprints、shared profile without exact per-change parity、adapter without observed behavior-gap evidence、Paper unavailable mislabeled as supported。

## 実装作業

1. 公式manifestのstable release集合を固定し、matrixとのID set equalityを検査する。
2. 各client/server JARを公式SHA-1/lengthと照合して一時領域へ取得し、SHA-256を記録する。ダウンロード総量を事前表示し、versionごとに抽出後は原本を一時領域外へ残さない。
3. client JAR ZIP entry inventoryとasset-index object inventoryを別々に全件作り、両方の実bytesを検証した上でversion固有のresource source-resolution規則を適用し、canonical logical-path mapを作る。JAR内resourceとasset-index objectをどちらか片方で代替せず、出所・取得hash・優先順位・衝突を記録する。
4. 隣接stable release間でcanonical renderer-consumed resource closureを比較し、block registry IDの追加/削除/変更、block-state property/value、blockstate variants/multipart、model parent/elements/faces/rotation/uvlock/cullface、texture/alpha、biome tint/material/light/emissionの差分を生成する。block registryはexact runtime registry reportから取得し、resource filename差分で代用しない。
5. exact-version world fixtureを公式serverから生成または正規取得し、DataVersion、dimension min/max Y、chunk NBT fields、sections、block/biome palette encoding、packed state layout、heightmap、sky/block light、block entity、region/compression差分を記録する。
6. Paper stable build/API/Java runtime/mappingとsnapshot serializationをrenderer asset・Anvil profileから独立に記録する。Paper buildが無いreleaseはlive compatibility unavailableとし、saved renderer statusへ混ぜない。
7. 全releaseにversion-delta-matrix rowを作る。renderer-input/schema fingerprint一致は「データ差分なし」の根拠に限って使う。入力fingerprintが異なる場合も、全renderer-input changeをexact fixture・Dynmap trace・Rust pixel parityへ結び、既存generic profileの正しさが証明できればprofileを共有してよい。
8. 各changed entryをrenderer_input / provenance_only / non_rendererに証拠付きで分類する。renderer_inputに一つでも既存profileで再現するbehavior gapがあれば、失敗fixture・Dynmap trace・Rust failure evidence・owner phaseを記録してadapterを実装する。新releaseごとにadapter phaseを自動生成しない。
9. 各releaseの5 verification pagesへ観測済み差分、data profile、implementation profile decision、change IDs、report IDs、fixture/reference/test IDsを埋める。page countだけのseed textを実装readyとして残さない。

## Dynmap oracle source lineage

- `93b454efb8802dc7406d6873434f2aeec5c636f4`は共通behavior baselineやが、後発Minecraft releaseへの対応を自動的に証明せえへん。各releaseで対応するDynmap source commit/module/buildを、version-specific adapter、block mapping、registry/registration path、実build evidenceから個別に選定する。
- baseline以後のsource revisionを使うreleaseではrenderer-relevant Java symbol/resource diffを全件AST/resource ledgerへ追加し、Rust destination、fixture、Java trace、testを割り当てる。source deltaが未分類ならreleaseを未対応とする。
- `spec/map/evidence/version-deltas/<version>/dynmap-oracle.json`はselected source revision/tree digest、exact release support evidence、reference build digest、baselineとの差分manifest、new/changed block-state renderer mapping coverageを持つ。固定pinをそのまま流用しただけのreportはstrict gateで拒否する。
- 26.1の調査入口: Mojang公式release notesはworld storage/data format変更、lightmap algorithmの書き換え、Golden Dandelion/block texture追加、tripwire alpha-cutout、block-state rendering変更を記載する。これらをcandidate listとして実client/server artifactsから検証し、実際にrenderer入力へ影響する項目だけを差分とする。
- upstream Dynmap PR #4271は26.2 mapping作業でSulfur/Cinnabar family、Sulfur Spike、Golden Dandelion、`creaking_heart` property変更、special-rendered Copper Golem Statueのcube approximationを挙げている。これは発見用leadであり、未merge PRをrelease supportやparity proofに使わない。
- vendored `ChunkVersionHDShader`のDataVersion表は1.21.0 / 3953で終わるが、これはそのshaderの表の範囲だけを示す。renderer全体の対応可否はsymbol/data/resource単位で別に証明する。

## バージョン対応をpassにする実データ証拠

- 版別asset対応はclient JARとasset-indexの両rootから作る。client JARのZIP entries、asset-index JSON、renderer-consumed object bytesを独立してexact digest/size検証し、どちらか片方に全resourcesがあると仮定しない。
- `canonical logical-resource map`はclient-JAR ZIP entry inventoryとasset-index object inventoryの両方を含み、各pathの出所を保持する。`deterministic source precedence`は対象Minecraft runtimeで実証した規則だけを使い、同一pathの異なるbytesを推測で優先しない。
- `client-jar-entry-inventory.json`はdirect JAR entry path/CRC/uncompressed size/bytes SHA-256/consumerを、`asset-object-inventory.json`はlogical path/index object SHA-1/size/downloaded SHA-256/consumer edgeを固定する。`canonical-resource-map.json`は両方のsource provenanceとruntime-proven precedenceを結び、conflicting same-path bytesを根拠なく選ばない。
- `spec/map/evidence/version-deltas/<version>/assets.json` schema v2は、client JAR entries、asset-index objects、canonical resource map、runtime block registry、full block-state inventory、resolved model graph、renderer-only asset closureのmanifest path/hash/countをexact target/baseline digestへbindし、各added/removed/changed entryにstable change ID、render-impact classification、理由またはfixture/reference ownerを持つ。新規・変更stateはstate→selector→model graph→verified texture bytes→fixture→Dynmap trace→Rust pixel比較まで追跡する。
- 1.14/26.3の実JARと26.3 asset-index probeは[version asset container audit](../version-asset-container-audit.md)に固定したpackaging-layout regression evidenceであり、48-release semantic deltaやversion supportの証拠には数えない。
- saved-world対応はexact releaseのworld bytesからdimension height、region compression、chunk NBT、section/palette/packed states、biome、heightmap、sky/block light、block entityを抽出する。`DataVersion`だけではschema deltaを確定できないためfixture bytesとnormalized schema fingerprintが必要や。fingerprintが違うAnvil schemaも、既存decoder profileが全変更fixtureを正しく処理すれば同じimplementation profileを共有できる。
- `no_renderer_visible_delta`は両releaseのartifact digestとinput/schema fingerprintが一致したときだけ許可する。空配列、同じversion family、隣接patchの結果だけではno-diffにできない。異なるfingerprintの差分を同じコードprofileで扱うには、変更IDごとのexact fixture/reference trace/pixel comparisonが全件必要で、adapterは観測されたbehavior gapに限る。
- Paperはclient asset/Anvilのどちらとも別軸にする。exact stable buildの有無/API/runtime/mapping/snapshot wireを個別に記録し、Paper live unavailableでもsaved Anvilのrenderer statusを変えない。
- first release (`1.14`) はprevious release比較ではなくabsolute baseline inventoryと全state coverageを作る。後続releaseは直前のofficial stable releaseと比較する。

- 固定fixture / reference: official client/server artifact digest fixtures、全version asset diff report、block/state registry comparison、1.18 height/NBT/palette/biome transition fixtures、verified no-diff fixture、different-data shared-profile parity fixture、observed behavior-gap adapter fixture、Paper-unavailable fixture。
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: 公式stable ID setとdelta ledger ID setが完全一致し、全releaseのrenderer/Anvil/Paper差分がartifact-boundである。no-diffのみfingerprint一致で成立する。全renderer_input deltaはfixture/reference/pixel comparisonへ到達し、既存profileが通れば共有、具体的gapが再現されたものだけadapterへ割り当てる。
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
bun scripts/check-map-version-phase.mjs --all --phase delta-audit --require-artifact-diffs --require-dynmap-oracle && bun scripts/check-map-renderer-coverage.mjs --require-all-versions --require-version-deltas && bun spec/map/plan/tools/validate-plan.mjs --require-dynmap-oracle
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: lock exact minecraft release matrix
```
