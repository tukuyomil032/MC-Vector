# R32: Version-specific asset adapters

## 目的

共通のZIP archive readerとblockstate/model resolverの前に、Minecraft版のasset contractを固定する。今回の実装対象は、R06/R07で実体化した `1.21.4` に限定する。

## 実装

- `AssetVersionProfile`へMinecraft version、version family、asset index id/SHA-1、DataVersion、必須asset entryを固定する。
- `1.21.4` のblockstate、model、PNG textureが存在し、JSON/PNGの最小形式が壊れていないことを検証する。
- blockstate/model/texture pathのnamespaceとtraversalを検証する。
- 未登録版は `UnsupportedVersion` として返し、既知版のassetとして推測しない。

## Gate

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
git diff --check
```

## 完了範囲

`1.21.4`のasset adapterと必須entry validationのみ完了。`1.14`〜`26.3`全版のasset adapter、実client JARのSHA-256 binding、texture atlas parity、reference PNG parityは未完了や。

## Commit

```text
feat: add asset adapter for 1.21.4
```
