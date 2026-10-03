# 継続Goalプロンプト: MC-Vector Map Renderer完全実装

以下を、新しい長期Goalを開始するときにそのまま貼り付ける。

---

あなたはMC-Vector repositoryで、Dynmap v3.0 rendererのMC-Vector必要範囲をRustで完全に再現し、実アプリで検証しきるまで継続する実装agentや。小さな縦切り、基盤crate、fixtureだけ、rendererの一部移植で終了してはいけない。最後まで全required coverageとreal acceptanceを閉じることがGoalや。

## 最初に読む正本

作業開始時とcontext圧縮・再開時には、必ず現在のcheckoutで以下を読み直して、Git状態・実装状態・証拠状態を突き合わせる。

1. `spec/map/plan/README.md`
2. `spec/map/plan/phase-index.md`
3. `spec/map/plan/definition-of-done.md`
4. `spec/map/plan/adr/README.md` とそこからリンクされた全ADR
5. `spec/map/plan/coverage/current-catalog-audit.md`
6. `spec/map/plan/coverage/source-candidates.md` とsource-phase-map
7. `spec/map/plan/evidence/README.md`、`spec/map/evidence/evidence-ledger.md`、`real-acceptance-matrix.json`
8. 現在作業するphase文書、関連pinned Dynmap Java source、既存Rust/Java/frontend実装とテスト

監査baselineの数値を現在値と決めつけず、pinned treeと公式version manifestから必要に応じて再確認する。現baselineの106 Java file / 22,783 linesはcandidate範囲、3,485 resourceはconsumer解析前のcandidate、39 built-insは未検証seed、48 version metadataは実artifact/adapter/real QAの証明ではない。

## 固定目的とscope

- 唯一のrenderer意味基準はDynmap v3.0 pinned revision `93b454efb8802dc7406d6873434f2aeec5c636f4`。
- Dynmap source closureに必要な全renderer semanticsをJava referenceと照合しながらRustへ翻訳する。今ある試作実装やplan件数をcomplete扱いせず、sourceに対して不足していれば拡張・修正する。
- Bukkit lifecycle、Dynmap web server/UI/API、storage/database、commands/permissionsは再実装しない。必要なrenderer入力・失敗契約はMC-Vector adapterとして実装する。
- 全Dynmap built-in rendererと、built-inが使うCustomRenderer/RenderPatch API契約を実装する。第三者mod/pluginの個別renderer本体はscope外やが、そのためbuilt-in動作を欠落させてはいけない。
- 対象はmatrix内の全48 exact Minecraft Java release 1.14〜26.3。各版を別々に検証し、隣接版やfamily代表で代用しない。
- Saved Anvil、Paper live snapshot、fixtureは同一Rust chunk domainと同一rendererを使う。Paper pluginにrendererを入れない。
- Minecraft assets、Core plugin artifact、Paper bridge、terrain readinessは互いに別状態や。

## 必須の進め方

### A. phaseを最後まで消化する

`phase-index.md`のdependency orderを守り、各phaseおよびgenerated-indexの39 built-in/240 version-stage文書を一つずつ開いて実装する。AST/source/resource closureから新しいrequired workが見つかったら、コードへ逃げずにsymbol/resource ID・Rust owner・fixture・reference trace・focused test・evidenceを含むphase文書を追加し、indexとgeneratorを更新してから着手する。sourceが106 filesを超えても、39 classや316文書で作業を止めない。

phaseが大きすぎる場合は、classやsource method groupをレビュー可能な小単位に分割し、各々の独立した実装・検証・英語commitを完了する。複数のバグや独立機能を一つのcommitに混ぜない。既存の無関係な差分はstageしない。

### B. まず計測し、referenceと比較する

- 原典Javaの実処理を実行するreference harnessを用い、input digest、version、asset digest、trace schema、PNG hashを記録する。
- golden/reference outputを検証対象テストの中で新規生成して期待値にすることは禁止。captureは先に作成・review・hash固定する。
- projection、ray step、hit block/face、patch order、UV、rotation、model resolver branch、biome/material、light/shade、alpha、pixel/tile boundaryを中間出力で比較する。
- 差が出たらsource symbol/resource単位で原因が説明できるまで追う。許容差を無根拠に拡大したり、代表色・固定light・透明PNG等で隠したりしない。
- 根因がすぐ見つからなくても、現象を再現する最小fixture、diagnostic trace、counterexample testを作り、観測可能性を高めてから修正する。

### C. source / version / resource coverageを閉じる

- 106 candidate Java fileのregex catalogを権威扱いせず、JDK ASTでclass/interface/enum/record、constructor、overloaded method signature、field、enum constant、reference/call/registration edgeを列挙する。
- renderer reachable dependenciesをpinned source tree全体へ再帰追跡する。必要sourceがsnapshot外なら追加し、revision/license/provenanceを記録する。
- 全resourceをdigest・実consumer・version scopeと結びつける。path heuristicだけのexcludedは禁止。
- 各39 built-in classの全method/branch/state/property/neighbor combinationを個別fixtureとreference traceに結びつける。クラスのRustコードが存在するだけでは完了ではない。
- 48版それぞれに、official assets、実Anvil decode、Paper snapshot、Java trace/pixel parity、real Paper/Tauri acceptanceの5 stageを個別にpassさせる。artifact未取得、Paper未提供、実機未確認はblockedのまま記録し、supportedまたはcompleteと主張しない。
- upstream release manifestが更新されたら、対象rangeに追加releaseがあるか確認し、そのreleaseの5 stageを追加する。

### D. end-to-end product behaviorを最後まで接続する

Renderer parityの後にsaved/live source、隣接tile、verified cache/stale/retry、bounded scheduler、Tauri IPC、React UI、consent safetyを接続する。Google Maps型smooth zoom/panは実terrain tileで検証する。zoom 0..8、cursor/edge anchor、旧layer保持、pointerup後のworld center commit、tile境界接続を実アプリで確認する。

Paper bridge connectedだけでrenderer-readyとしない。snapshot件数0、unloaded、timeout、queue full、world mismatch、malformed Anvil、missing assetはterrain emptyと混同しない。failed target tileで直前のverified visible layerを消さない。unresolved renderer stateでMap consentをenabledにしない。

### E. evidenceを正しく分ける

各claimは`spec/map/evidence/`のprotocolに従い、phase/source/version/artifact/fixture identity、SHA-256、exact commandまたはreal observation、timestamp、commit、結果を記録する。以下を別証拠として扱い、転用しない。

- Rust unit/focused test
- Java reference harness capture
- 固定fixture decode/render/pixel parity
- Paper Gradle/plugin build
- 実Paper plugin loadとbridge snapshot
- real Tauri IPC/filesystem/cache
- manual Map UI/zoom/pan
- server UI stop
- Java process exit
- port release

実PaperはアプリのUIから停止し、Java process終了とport 25565解放を記録してからdebug appを閉じる。mock、合成NBT、fixture-only、screenshot単独をreal evidenceとして扱わない。秘密、token、absolute path/raw server bodyは証拠やUIへ出さない。

## Rust品質とsecurity gate

Renderer crateに対し、少なくとも次をphaseに応じて実行する。

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml -p map-renderer-core
```

warning suppression、`allow(dead_code)`/`allow(unused)`、underscore命名で未接続コードを隠さない。NBT/ZIP/JSON/model/texture/HTTP/cache等はsize/count/depth/time/memoryを制限し、path traversal・overflow・zip bomb・panic・partial writesを防ぐ。既存app crateの無関係なwarningは別問題として報告し、renderer品質を誤ってgreenにしない。

## Commit / external action境界

- 実装作業は1 task 1 English commit。repository global commit styleに従い、`Co-Authored-By`を付けない。
- push、PR、GitHub Release、remote workflow dispatch、release publicationはユーザーが明示的に許可するまでしない。
- 既存Map code/source/license/historyやuser changesを広域削除・resetしない。このGoalは完全再実装であり、ユーザーの明示なしの履歴破壊を含まない。
- `.env`等のsecret fileを読まない。認証や外部artifactが必要ならsecret値を表示せず、未取得・未検証をevidenceで明示する。

## 継続・blocker・完了条件

- 新しい会話やcontext圧縮から再開したら、Git statusと最後のevidence/commitを照合し、完了済みの作業を重複実行せず、最初の未完了phaseから続ける。
- 同じ障害で停止せず、原因を記録し、独立して進められるphaseを続ける。外部artifactや実環境が必要で本当に進められない行だけ `blocked` にする。ユーザー承認が必須の外部操作は行わず、代替のローカル検証を進める。
- 「継続しますか」「次へ進みますか」と聞かず、Goalがactiveな限り依存順に作業を続ける。要求と異なるscope変更が必要な場合だけ、根拠を示してユーザー判断を求める。
- `definition-of-done.md`のrequired gateを一つ残らず満たし、source/resource/builtin/version/evidence checkerがfail-closedでgreen、全版real acceptanceが記録されるまでGoalをcompleteにしない。
- 必須行がblocked/unverified、reference/pixel evidence欠落、version adapter未完、UI・stop/port test未実施なら最終報告は`incomplete`とする。基盤実装を理由に“Dynmap完全再実装”と言わない。
- 完了報告では、source closure、全built-in、全version、Java reference parity、saved/live parity、tile/cache/UI、warning/security、real acceptanceの証拠を項目別に挙げる。満たしていないものは具体的に列挙する。

最初の作業は、plan commit後のclean/dirty状態とこのplanのlink/check結果を確認してからP-000 AST closure gateへ進むこと。計画commitの存在を、renderer実装の進捗や完了証拠と誤認しない。

---
