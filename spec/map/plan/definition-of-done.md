# Map Renderer Definition of Done

## 全体Goalの完了条件

以下がすべて実装済みで、再現できる証拠を持つまでDynmap rendererのRust完全実装完了とは呼ばへん。計画ファイル数、Rust行数、compile成功、代表版のpassで条件を置換しない。

1. Pinned source dependency closureに含まれる各class/interface/enum/record、constructor、overloadを区別したmethod、field、enum constant、annotation、reflection/registration edge、renderer-related resourceが一件ずつ `required` / `adapter-only` / `excluded` に分類される。requiredは独立したRust owner phase、fixture、Java reference、focused test、evidenceまで結びつき、adapter-only/excludedは依存元と除外根拠が具体的に書かれている。未分類・未追跡は0件。source closure追加時は実装前にplanを追加し、その分のcommitを完了する。
2. source treeとresource archiveはrevisionとhashが固定され、全renderer output consumerが分類済み。AST symbol台帳はsignatureとownerを保持し、overloadを別symbolとして扱う。
3. 全39 built-in rendererに個別Rust implementation、原典registration parity、全分岐fixture、Java trace、固定pixel goldenがある。mod固有第三者実装は範囲外だが、Dynmap built-inの該当挙動は対象外にしない。
4. 現version catalogにある全48 exact release（1.14〜26.3）に、公式client/server artifact digest、asset adapter、Anvil adapter、Paper snapshot adapter、Java reference/pixel parity、real Paper/Tauri acceptanceがある。各releaseに `assets.md`、`anvil.md`、`paper-snapshot.md`、`reference-and-parity.md`、`real-acceptance.md` の5つを個別にpassさせる。新しいofficial stable releaseが対象rangeへ加われば5 phaseを足して全件完了する。
5. Saved AnvilとPaper liveから同じdomain chunkを作った場合、同じrenderer trace・normalized RGBA outputとなる。生成済みテストfixtureだけでreal-world source完了を代用しない。
6. Zoom 0〜8のtile geometry、adjacent tile、cache、stale/retry/cancel、bounded scheduler、Tauri IPC、consent safety、Map UI、cursor anchored smooth zoom、pan center commitが実際のrenderer outputを使って動作する。
7. Missing/unsupported/malformed/unavailable/timeout/checksum/conflict failureをempty terrainやtransparent successへ変換しない。valid old layerをtarget renderの失敗時に保持する。
8. 各版で実行可能なPaper plugin load、hello/heartbeat、loaded snapshot、real Tauri render、UI操作、Paper停止、Java process終了、port 25565 releaseが別々の証拠として残る。Paper artifact/providerが存在せず版別の実機証拠を採れない版は `blocked` であり、全体Goalはcompleteではない。
9. `map-renderer-core` がfmt/check/clippy `-D warnings`/testを通過し、unused/dead_code許容で未実装を隠していない。
10. 最終coverage audit、frontend/repo check、build、real acceptance ledgerに required unresolved rowがない。

## 必須禁止状態

全体Goalは、必須項目に `planned`、`in_progress`、`unverified`、`blocked`、`not_downloaded`、fixture/reference欠落、またはevidence IDのない `verified` が一件でもあれば未完了や。外部artifactや実Paper環境が得られへん場合は該当項目をblockedのまま記録し、可能な他phaseを続ける。制約を緩めてpassにしたり、supported版から黙って除外したりせえへん。

## これら単独では完了証拠にならない

- Rust crateがbuildできる、または大量のRust codeが存在する。
- PNGファイルが出る、alpha/coverageが非zero、画面がgrid以外に見える。
- bridge connected、Paper plugin loaded、mock snapshot、生成NBT fixtureがpassする。
- 4つの既存patch trace fixture、単一Minecraft release、近いversion familyがpassする。
- UIにerrorが出ない、client JARが選べる、consentがenabledと表示される。

build、Rust focused tests、Java reference、fixed fixture、Paper smoke、real Tauri、manual UI、server stop/port releaseは別々の証拠レベルや。
