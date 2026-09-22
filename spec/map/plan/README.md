# MC-Vector Map Renderer 完全実装計画

> **実装者向け:** Goal実行では `goal-prompt.md` を最初に読み、`phase-index.md` の依存順にphaseごとに実装・検証・英語commitを完了する。phase文書はこのrepositoryとpinned Dynmap sourceを一次根拠とする。

**Goal:** Dynmap v3.0のMC-Vectorに必要なrenderer依存closureをRustで再現し、Minecraft 1.14〜26.3の全exact Java releaseについてsaved Anvil/Paper source、reference parity、Map UI、実環境acceptanceまで完了する。

**Architecture:** Rust renderer coreをsource-independentに保ち、Saved Anvil・Paper snapshot・fixtureを共通chunk domainへ変換する。pinned Dynmap Javaはreference oracleとして保持し、source symbols/resources/built-ins/versionごとに中間trace、pixel golden、実環境証拠を対応づける。

**Tech Stack:** Rust workspace / `map-renderer-core`, Tauri v2, React/TypeScript, Paper Java plugin, Gradle, JDK compiler AST API, Bun/Node verification scripts, fixed Anvil/assets/reference fixtures.

---

## この計画の読み方

以前のR00〜R48文書は正本から外し、このplan commitで削除する。以前のcommit・Map実装コード・Dynmap source snapshot・license・fixtureは保持する。過去phase名や試作goldenは新しい完了証拠に再利用しない。

正本は次の通りや。

- [`phase-index.md`](phase-index.md): 全phase、依存順、commit境界。
- [`definition-of-done.md`](definition-of-done.md): 全体Goalの必須exit criteria。
- [`goal-prompt.md`](goal-prompt.md): 継続実行用の貼り付けprompt。
- [`coverage/`](coverage/): source/resource/renderer/versionを漏れなく割り当てる計画台帳。
- [`evidence/`](evidence/): 証拠の種別、保存項目、状態遷移。
- [`adr/`](adr/README.md): scope、数値互換、source、version、parity、failure等の固定判断。
- [`phases/`](phases/): 37共通phase、39個別built-in phase、48×5個別version stage。

初期specialist phaseは **279件**（39 built-in + 48 exact releases × 5 stage）。共通phase 37件を含むと、現時点の個別実装phase文書は **316件** や。これは上限やない。Java AST/call/resource closureで追加クラス、field/method group、resource consumerが判明したら、その全件を実装開始前にmanifest・独立phase文書・index・commit境界へ加える。106候補や316文書でclosureを止めへん。

## 対象境界

- Dynmap revision `93b454efb8802dc7406d6873434f2aeec5c636f4` をrendererの唯一の意味基準にする。
- DynmapのBukkit lifecycle、web server/UI、database/storage、commands/permissions、第三者mod/plugin固有renderer実装は移植対象外。rendererへ渡る入力契約・failure semanticsは必要な範囲で再現する。
- Dynmap built-in rendererはmod integrationを含む39候補すべてが個別の必須phaseや。各classの原典分岐、登録、resource依存を実際に確認する。
- version matrixはJava Editionのexact stable release 1.14〜26.3を基点とし、manifest更新時には公式release追加分をphase generatorとともに追加する。
- Paperのlive providerはPaper互換server用。Paper pluginを提供できないserver typeはsupportedと表示しない。Saved Anvilでの可否とlive bridgeの可否は別の証拠にする。

## 現在状態

作成時点の監査値は [`coverage/current-catalog-audit.md`](coverage/current-catalog-audit.md) と [source候補一覧](coverage/source-candidates.md) に固定した。既存Rustコード、Java snapshot、license、fixtureは保持し、この文書commitでは実装コードへ触れない。数値は監査baselineであり、最新のpinned source/official releaseとの差をPhase P-000〜P-002で再照合する。

## 完了の意味

この計画や計画commit自体はrenderer実装完了ではない。全required symbol/resource、39 built-ins、全48 exact releaseの5 stage、saved/live同等性、tile/UI、warning/security gate、real acceptanceが [definition-of-done.md](definition-of-done.md) と証拠台帳を満たしたときに限り、renderer完全実装完了と言える。
