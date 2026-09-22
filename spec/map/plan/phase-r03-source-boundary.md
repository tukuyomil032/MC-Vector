# R03: Apache-2.0 source boundary and attribution

## 目的

R03は、R02で列挙したpinned Dynmap renderer closureを、出所・revision・hashが追跡できるsource-only snapshotとして固定する。Rust translationとupstream Javaを同じ実装物として扱わず、ライセンス境界と未移植状態を残す。

## 実装

- `src-tauri/crates/map-renderer-core/third_party/dynmap/upstream/`へrenderer closureのJava 106ファイルをvendorする
- `ORIGIN-MANIFEST.json`に全source path、local path、revision、SHA-256、Rust destination、symbolを記録する
- `SOURCE-REF.md`を機械生成し、manifestと同じhashを表示する
- `LICENSE-APACHE-2.0`、`NOTICE`、crate-level `NOTICE`を保持する
- `scripts/verify-dynmap-source.mjs`で全106ファイルを再計算する
- source snapshotをRust crate、frontend、Paper pluginのruntime dependencyにしない

Dynmap標準のtexturepackやweb/marker assetは、このphaseでruntimeへ取り込まない。resource catalogでrenderer asset・renderer definition・platform assetを分け、版違いのMinecraft assetを混ぜる操作を禁止する。

## Gate

```bash
node scripts/vendor-dynmap-renderer-source.mjs
bun scripts/verify-dynmap-source.mjs
bunx --no-install oxfmt --check scripts/vendor-dynmap-renderer-source.mjs scripts/verify-dynmap-source.mjs
git diff --check
```

## 完了条件

- pinned revisionが全manifest entryで一致する
- source-only、non-runtime boundaryがmanifestに明記される
- 106 Java filesのhashが固定される
- Rust translation側へApache sourceを直接compile/importしていない
- license/NOTICE/attributionを追跡できる
- resource catalogの未移植assetをsuccess扱いしない

このphaseの完了はlicense/source boundaryの完了であり、Dynmap rendererのRust parityやasset resolverの完了ではない。

## Commit

```text
chore: lock dynmap renderer source and attribution
```
