# R04: Source-independent renderer domain contract

## 目的

R04は、Saved Anvil、Paper live snapshot、fixtureの差をrenderer本体へ漏らさないための共通domainを固定する。どのsourceから来たchunkでも、rendererは同じidentity、block state、palette、biome、height、light、boundary、asset stateを受け取る。

## 実装

`map-renderer-core`に次を追加した。

- `MinecraftVersionId`
- `WorldId` / `DimensionId`
- `WorldCoordinate` / `ChunkCoordinate`
- `ChunkIdentity`
- `ChunkDataAvailability` とmissing-data分類
- `BlockStateProperty`
- `ModelReference` / `TextureReference` / `Material`
- `MapChunkCache.identity` / `availability`
- block state propertiesの保持
- identity coordinate mismatchの拒否

既存の`BlockCoord`、`ChunkCoord`、`TileBoundary`、`SectionPalette`、light/biome/height dataはrenderer互換を保ったままsource-independent contractの内部表現として維持する。

## 禁止事項

- Anvil/Paper型をrenderer moduleへ直接持ち込まない
- missing dataをair、固定light、代表色へ変換しない
- identityのversion/world/dimension/chunk coordinateを省略してsuccess扱いしない
- `allow(dead_code)`でcontractを隠さない

## Gate

```bash
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo check --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo clippy --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core -- -D warnings
cargo test --offline --manifest-path src-tauri/Cargo.toml -p map-renderer-core
cargo check --offline --manifest-path src-tauri/Cargo.toml --lib
```

## 完了条件

- domain contractが独立moduleとして公開される
- chunk identityのcoordinate mismatchが拒否される
- partial/missing/completeを区別できる
- blockstate propertiesを保持できる
- renderer crateがwarning-cleanである
- app crateがrendererの未接続実装を再importしていない

これはAnvil decoder、Dynmap parity、Paper adapterが完了したことを意味せえへん。それぞれR06以降のgateで個別に証明する。

## Commit

```text
feat: define complete renderer domain contracts
```
