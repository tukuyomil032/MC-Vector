# MC-Vector Map Renderer 完全実装計画

> **実装者向け:** Goal実行では `goal-prompt.md` を最初に読み、`phase-index.md` の依存順にphaseごとに実装・検証・英語commitを完了する。phase文書はこのrepositoryとpinned Dynmap sourceを一次根拠とする。

**Goal:** Dynmap v3.0のMC-Vectorに必要なrenderer依存closureをRustで再現し、監査日現在のMojang公式manifestに存在するMinecraft Java 1.14以降の全exact stable releaseについてsaved Anvil/Paper source、reference parity、Map UI、実環境acceptanceまで完了する。2026-09-23の基準snapshotでは最新stableは[26.3（2026-09-15公式告知）](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3)やが、これは将来の上限を固定する指定ではない。

**Architecture:** Rust renderer coreをsource-independentに保ち、Saved Anvil・Paper snapshot・fixtureを共通chunk domainへ変換する。Dynmap revision `93b454...`を共通behavior baselineに保ちつつ、各Minecraft releaseを実際に処理するupstream source revision/moduleを別途選び、source deltaをRust移植・reference oracle・pixel evidenceへ追跡する。

**Tech Stack:** Rust workspace / `map-renderer-core`, Tauri v2, React/TypeScript, Paper Java plugin, Gradle, JDK compiler AST API, Bun/Node verification scripts, fixed Anvil/assets/reference fixtures.

> **Plan package status: ready for execution; renderer status: not implemented.** The current plan maps all 18,201 pinned Java declarations, all 296,914 syntax-reference candidates, all 3,673 resources, every built-in renderer, and all exact-release phase pages to explicit work. The source dependency ledger still has 209,031 open reference candidates assigned to P-000. The resource ledger retains 58 exact paths as unclassified rows assigned to P-001. Those counts are open implementation gates, not claims of semantic closure or renderer readiness. Start the execution Goal at P-000 and keep both ledgers open until their strict closure checks pass.

---

## この計画の読み方

以前のR00〜R48文書は正本から外し、このplan commitで削除する。以前のcommit・Map実装コード・Dynmap source snapshot・license・fixtureは保持する。過去phase名や試作goldenは新しい完了証拠に再利用しない。

正本は次の通りや。

- [`phase-index.md`](phase-index.md): 全phase、依存順、commit境界。
- [`goal-prompt.md`](goal-prompt.md): 全phaseを順番に実装・検証し、完全実装の全gateが揃うまで継続するGoal本文。
- [`definition-of-done.md`](definition-of-done.md): 全体Goalの必須exit criteria。
- [`coverage/`](coverage/): source/resource/renderer/versionを漏れなく割り当てる計画台帳。
- [`coverage/version-matrix.json`](../coverage/version-matrix.json) は公式release metadata、[`coverage/version-delta-matrix.json`](../coverage/version-delta-matrix.json) は各exact releaseの実asset/Anvil/Dynmap-oracle/Paper差分と証拠を結ぶ台帳や。後者の全48件は今は`pending`で、対応済みversionの一覧ではない。
- [`evidence/`](evidence/): 証拠の種別、保存項目、状態遷移。
- [`adr/`](adr/README.md): scope、数値互換、source、version、parity、failure等の固定判断。
- [`phases/`](phases/): 共通phase、built-in候補ごとの個別phase、exact releaseごとの検証文書。版別ページの数は完了指標やなく、各releaseの実block/state/model/texture差分、Anvil schema差分、Paper adapter差分と証拠が本体。

現行seed catalogから生成されるspecialist pageは **279件**（built-in候補39件 + 2026-09-23 version snapshot 48件 × 5 release-verification stage）。共通phase 37件を含む **316件** は文書数に過ぎず、特に版別pageは実artifact差分をまだ持たないので実装readyでもversion coverageでもない。plan-authoring gateでは、各exact releaseのclient/server artifactからrenderer inputとAnvil schemaの差分を抽出し、共有できる実装profile、実差分に必要なversion-specific adapter、fixture/reference ownerまで確定してからphase文書を確定する。

version対応の実作業は「48個のページを埋める」ことではない。**今ある48件の版別ページは、各版で何を調べるかを記した未実施の作業票であり、互換性の証拠でも、意味のある実差分をすでに洗い出した結果でもない。** 現時点では`version-delta-matrix.json`の48 rowがすべて`pending`やから、対応済みと呼べる版はゼロや。

実際の調査では、各公式client/server artifactを取得してdigestを検証する。client JARだけにMinecraft assetsがすべて入っているとは仮定せず、version JSONのasset-indexと、そこから参照されるrenderer-consumed object bytesも閉じてから直前stable releaseと少なくとも次を機械比較する。

ここで、**データ差分とRust実装差分を分ける**。たとえば新ブロックやtextureが増えた場合、exact releaseのデータ差分・state coverage・pixel parityは必ず記録する。しかし既存の汎用model resolverが新しいblockstate/model/textureを正しく処理できるなら、版専用adapterは増やさず同じimplementation profileを使う。Anvil field/layout、Paper snapshot contract、model解釈やlighting意味論など、既存profileでは扱えない構造・挙動差が実証された場合だけ、独立implementation phaseを追加する。差分がないと主張するときの同一fingerprintと、データが違っても同じコードprofileを使えるという互換性証明は別の判定や。

- 新規・削除・変更されたblock registry IDとstate property/value
- blockstate variant/multipart、解決後model graph、face/UV/cullface/rotation
- texture pixel/alpha、biome tint、material、light/emission
- 実worldのAnvil/region/chunk NBT、section/palette packing、dimension height、biome/light/block entity
- その版を処理するDynmap reference sourceのversion mapping・renderer registration・renderer-relevant source/resource差分

Minecraft renderer assetの入力源は、各versionのclient JAR内に直接格納されたZIP entryと、version JSONが指定するasset-indexのlogical path→object mappingの**両方**や。全client JARに全renderer assetがあるとも、asset-indexに全renderer assetがあるとも仮定しない。両rootを独立に全件inventory化し、exact bytes hash・logical path・source provenanceを保持したcanonical resource mapを作る。exact client runtimeで確認できたsource precedenceだけを適用し、同一logical pathでbytesが衝突して優先規則を証明できない場合はfailureにする。実地の二つのcontainer probeは[version asset container audit](version-asset-container-audit.md)に記録したが、これは版差分の証拠ではない。

各exact releaseのasset reportでは、runtime block registry ID、full state property/value set、blockstate selector、variant/multipart選択、resolved model inheritance/geometry、texture/metadata bytes、UV/rotation/cullface/alpha、biome/material/light/emission入力を直前stable releaseと具体的なadded/removed/changed entry単位で比較する。registry inventory、state inventory、client-JAR entries、asset-index objects、canonical resource map、resolved model graph、renderer-only closureの各manifestをexact artifact digestへ結びつける。state→selector→model graph→verified texture bytes→fixture→Dynmap reference trace→Rust pixel comparisonの鎖を閉じ、source-container relocation/changeも記録する。これが無い「block ID一覧」やresource filename一覧だけでは新ブロックの描画互換を示せへん。

新ブロックが増えたなら、block IDだけで終わらせず、その全stateからmodel・texture・特殊rendererへ追い、fixture・Java trace・Rust pixel比較まで通す。差分がゼロと主張する場合は、両artifact digestとrenderer-input/schema fingerprintが一致せなあかん。一方、入力データが違っていても、すべての差分caseで同じ汎用Rust implementationが正しいtrace/pixelを返せば同じimplementation profileを共有できる。Dynmap source revisionも毎版必ず別物にするという意味ではない。同じrevisionを再利用できる場合は、各版の実データをそのreference buildが正しく解決できる証拠が必要や。実差分が発見されていない現在は、版別ファイルの存在自体に互換性上の意味はない。

PaperのAPI/live snapshotはさらに独立した軸や。

たとえばMinecraft 26.1の公式notesには、world storage/data format変更、lightmap計算の書き換え、Golden Dandelionとtexture追加、tripwire alpha-cutout変更、block-state rendering変更がある。それぞれがterrain renderer入力に影響するかをclient JAR・asset-index objects・exact runtime registry・実chunk bytesで確認し、影響する差分だけadapter・fixture・referenceに割り当てる。Dynmap側も同じ版を扱うsource commit/moduleを選ばなあかん。固定revision `93b454...`を全releaseに対するoracleと決めつけず、後発sourceを使う場合はrenderer code/resource差分もRust portへ追加する。報告ページは今のところ作業指定であって、まだ実データを調べた結果ではない。

## 対象境界

- Dynmap revision `93b454efb8802dc7406d6873434f2aeec5c636f4` をrenderer共通behavior baselineにする。各Minecraft releaseのreference sourceはそのreleaseの実対応が確認できたDynmap source commit/moduleから個別に選ぶ。
- DynmapのBukkit lifecycle、web server/UI、database/storage、commands/permissions、第三者mod/plugin固有renderer実装は移植対象外。rendererへ渡る入力契約・failure semanticsは必要な範囲で再現する。
- Dynmap built-in rendererはmod integrationを含む39候補すべてが個別の必須phaseや。各classの原典分岐、登録、resource依存を実際に確認する。
- version matrixは2026-09-23時点で1.14から最新stable 26.3までの48 exact releaseを固定snapshotとして持つ。実装開始前・監査再開時に公式manifestと照合し、1.14以降のstable release追加・削除・訂正があれば該当version phaseを増減してから実装する。26.3を恒久的な上限として扱わない。
- version supportを単なるrelease metadataやJAR名で表さない。exact releaseごとにruntime block registry/state property、blockstate/model dependency、client-JAR entryとasset-index object両rootのcanonical resource差分、texture/UV/alpha、biome tint/material/light/emission、DataVersion・dimension height・section/palette/biome/light/chunk NBT schemaの差分をartifact-derived ledgerに記録する。
- adapterは実証された挙動差で分ける。renderer-consumed asset/schema fingerprint一致は「データ差分なし」を言う条件であり、同一Rust implementation profileを共有する条件ではない。異なる入力でも各差分caseでexact fixture・Dynmap trace・Rust pixel parityが通れば同じ汎用profileを共有できる。既存profileで扱えないbehavior gapが再現された場合だけadapterを追加する。Minecraft版が違うというだけでRust adapterを複製しない一方、同じmajor/familyというだけで差分を無視もしない。Dynmap Java oracle/sourceも版ごとに適合を証明し、別revisionならsource deltaを全件ledgerへ登録する。
- Paper build/Java/API/mapping compatibilityは上記renderer/Anvil profileと別に記録する。Paper live非対応はSaved Anvil renderer非対応と同一視しない。
- Paperのlive providerはPaper互換server用。Paper pluginを提供できないserver typeはsupportedと表示しない。Saved Anvilでの可否とlive bridgeの可否は別の証拠にする。

## 現在状態

作成時点の監査値は [`coverage/current-catalog-audit.md`](coverage/current-catalog-audit.md) と [source候補一覧](coverage/source-candidates.md) に固定した。既存Rustコード、Java snapshot、license、fixtureは保持し、この文書commitでは実装コードへ触れない。数値は監査baselineであり、pinned sourceの全Git tree/official release manifestとの差を計画完了時に独立再照合する。計画完了ゲートでは未分類のscope-discoveryを残さない。

## 完了の意味

この計画や計画commit自体はrenderer実装完了ではない。全required symbol/resource、実棚卸しで確定した全built-ins、manifest照合済みの全exact releaseの5 stage、saved/live同等性、tile/UI、warning/security gate、real acceptanceが [definition-of-done.md](definition-of-done.md) と証拠台帳を満たしたときに限り、renderer完全実装完了と言える。
