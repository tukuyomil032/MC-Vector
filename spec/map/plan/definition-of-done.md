# Map Renderer Definition of Done

## 全体Goalの完了条件

以下がすべて実装済みで、再現できる証拠を持つまでDynmap rendererのRust完全実装完了とは呼ばへん。計画ファイル数、Rust行数、compile成功、代表版のpassで条件を置換しない。

1. Pinned source dependency closureに含まれる各class/interface/enum/record、constructor、overloadを区別したmethod、field、enum constant、annotation、reflection/registration edge、renderer-related resourceが一件ずつ `required` / `adapter-only` / `excluded` に分類される。requiredは独立したRust owner phase、fixture、Java reference、focused test、evidenceまで結びつき、adapter-only/excludedは依存元と除外根拠が具体的に書かれている。未分類・未追跡は0件。source closure追加時は実装前にplanを追加し、その分のcommitを完了する。
2. source treeとresource archiveはrevisionとhashが固定され、全renderer output consumerが分類済み。AST symbol台帳はsignatureとownerを保持し、overloadを別symbolとして扱う。
3. 全ソース・登録経路の監査で確定したbuilt-in renderer全件に、個別Rust implementation、原典registration parity、全分岐fixture、Java trace、固定pixel goldenがある。現行39件はseed catalogであって完了件数の上限ではない。mod固有第三者実装は範囲外だが、Dynmap built-inの該当挙動は対象外にしない。
4. Mojang公式manifestを基準日 `2026-09-23` で照合したsnapshotはJava 1.14以降48 exact stable release（最終ID `26.3`）や。各releaseの公式version JSON/client/server JAR/asset-index JSONを固定し、version metadataのSHA-1/lengthと実取得後SHA-256を照合する。renderer asset sourceはclient JAR内の直接ZIP entriesとasset-index object mappingの両方を独立inventory化し、exact runtimeで証明したsource precedenceを適用したcanonical logical-resource mapを作る。どちらか一方に全資産があると仮定せず、source location、entry/object digest、length、consumer/model edgeを保持し、異なるbytesの同一path conflictは根拠なく解決しない。詳しいcontainer probeは[version asset container audit](version-asset-container-audit.md)にあるが、二版のprobeは48版のsemantic delta証拠ではない。正本の[`version-delta-matrix.json`](../coverage/version-delta-matrix.json)は各releaseのrenderer asset/Anvil/Paper差分reportを持ち、48 rowすべてが実データ証拠で閉じるまで未完了や。各exact versionを直前stable releaseと比較し、block registry ID add/remove/change、state property/value set、blockstate variants/multipart、model parent/elements/faces/rotation/uvlock/cullface、texture/alpha、biome tint/material/light/emissionを具体entryごとに記録する。新旧state差分はexact runtime registry reportから抽出し、各stateをselector→resolved model graph→verified texture bytes→fixture→Dynmap trace/pixel比較まで結ぶ。asset reportはschema v2でclientJarEntries、assetIndexObjects、canonicalResourceMap、blockRegistry、blockStates、resolvedModelGraph、rendererAssetClosureの全manifestをexact artifact digestへ結びつける。各版Anvil fixtureからDataVersion、dimension min/max Y、chunk NBT fields、sections、block/biome palette encoding、heightmap、sky/block light、block entity schema、region/compression profileを記録する。Paper build availability/API/runtime mapping/snapshot adapterはrenderer/Anvil profileと別軸で固定する。fingerprint一致は差分なしの主張にだけ必須とする。入力fingerprintが異なるreleaseでも、各renderer-visible deltaがexact fixture・Dynmap trace・Rust pixel parityで既存generic profileにより正しく処理されると証明できれば同じimplementation profileを共有してよい。既存profileで再現可能なbehavior gapが見つかった場合に限りadapterを作る。各exact releaseの5 verification page（assets / Anvil / Paper snapshot / reference parity / real acceptance）は、観測された差分・fixture/reference/test ID・implementation-profile decisionを持ち、adapter ownerはgapがある場合だけ記載する。ページがあるだけではpassにしない。1.18のheight expansionおよびchunk NBT/palette/biome layout変更のような既知のformat transitionをfixtureで再現する。新しいstable releaseがmanifestに追加・訂正された場合は差分とphaseを実装開始前に更新する。
5. Saved AnvilとPaper liveから同じdomain chunkを作った場合、同じrenderer trace・normalized RGBA outputとなる。生成済みテストfixtureだけでreal-world source完了を代用しない。
6. Zoom 0〜8のtile geometry、adjacent tile、cache、stale/retry/cancel、bounded scheduler、Tauri IPC、consent safety、Map UI、cursor anchored smooth zoom、pan center commitが実際のrenderer outputを使って動作する。
7. Missing/unsupported/malformed/unavailable/timeout/checksum/conflict failureをempty terrainやtransparent successへ変換しない。valid old layerをtarget renderの失敗時に保持する。
8. 各版で実行可能なPaper plugin load、hello/heartbeat、loaded snapshot、real Tauri render、UI操作、Paper停止、Java process終了、port 25565 releaseが別々の証拠として残る。Paper artifact/providerが存在せず版別の実機証拠を採れない版は `blocked` であり、全体Goalはcompleteではない。
9. `map-renderer-core` がfmt/check/clippy `-D warnings`/testを通過し、unused/dead_code許容で未実装を隠していない。
10. 最終coverage audit、frontend/repo check、build、real acceptance ledgerに required unresolved rowがない。

## Version-specific Dynmap oracle gate

各Minecraft releaseは、Minecraft data adapterだけではなく、比較対象となるDynmap実装の適合を別に証明する。Pinned revision `93b454efb8802dc7406d6873434f2aeec5c636f4`を全版のoracleと仮定しない。各releaseについて、選んだupstream commit/module/build、exact-version supportのsource evidence、reference build digest、pinned baselineとの差分manifestを[`version-delta-matrix.json`](../coverage/version-delta-matrix.json)の`dynmapOracle` reportへ保存する。同じDynmap revisionを複数版で共有することは可能やが、各版のregistry/state/model/resourceと実際にbuildしたreferenceの適合を個別に証明する。baseline以後のrenderer-relevant symbol/resource差分はRust source ledgerへ登録され、実装・fixture・test・traceが揃うまで当該releaseを未対応にする。現在の48版別ページは検証指示のseedであり、データ差分を抽出済みという証拠ではない。

Release notesや未merge pull requestは候補の発見には使えるが、差分確定やparity証拠にはならない。たとえば26.1のworld-data/lightmap/block/texture変更候補、26.2の新block mapping・blockstate rename・special renderer候補は、実client/server JAR、block registry/state、resolved models/textures、Anvil bytes、exact-version Java oracleから確認する。DataVersion table一つやasset filename一覧だけでrelease全体の対応を証明しない。

## 必須禁止状態

全体Goalは、必須項目に `planned`、`in_progress`、`unverified`、`blocked`、`not_downloaded`、fixture/reference欠落、またはevidence IDのない `verified` が一件でもあれば未完了や。外部artifactや実Paper環境が得られへん場合は該当項目をblockedのまま記録し、可能な他phaseを続ける。制約を緩めてpassにしたり、supported版から黙って除外したりせえへん。

## これら単独では完了証拠にならない

- Rust crateがbuildできる、または大量のRust codeが存在する。
- PNGファイルが出る、alpha/coverageが非zero、画面がgrid以外に見える。
- bridge connected、Paper plugin loaded、mock snapshot、生成NBT fixtureがpassする。
- 4つの既存patch trace fixture、単一Minecraft release、近いversion familyがpassする。
- UIにerrorが出ない、client JARが選べる、consentがenabledと表示される。

build、Rust focused tests、Java reference、fixed fixture、Paper smoke、real Tauri、manual UI、server stop/port releaseは別々の証拠レベルや。
