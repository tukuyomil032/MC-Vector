# Map Renderer ADR Index

これらは実装の完了証拠やなく、全phaseで守る設計判断や。pinned sourceの実際の仕様と矛盾が見つかったときは、先に根拠付きADR amendmentをcommitしてからコードを変える。都合だけで静かに逸脱せえへん。

| ADR | Decision |
| --- | --- |
| [0001](ADR-MAP-0001-renderer-scope.md) | Dynmap v3.0 renderer dependency closureを唯一の意味基準にする |
| [0002](ADR-MAP-0002-host-boundary.md) | Bukkit/Web/storage/command hostは移植せず、renderer入力契約だけを再現する |
| [0003](ADR-MAP-0003-rust-core-boundary.md) | Rendererは独立Rust crateでwarning-cleanにする |
| [0004](ADR-MAP-0004-coverage-ledger.md) | AST/resource/sourceから実装・fixture・証拠まで一件単位で追跡する |
| [0005](ADR-MAP-0005-version-matrix.md) | 1.14〜26.3の全exact releaseを個別対応する |
| [0006](ADR-MAP-0006-shared-chunk-domain.md) | Anvil/Paper/fixtureを同一source-independent domainへ変換する |
| [0007](ADR-MAP-0007-java-reference-and-parity.md) | 実pinned Java oracleと固定trace/pixel goldenを正解基準にする |
| [0008](ADR-MAP-0008-unsupported-data.md) | missing/unsupported/failureを推測値やempty successへ変換しない |
| [0009](ADR-MAP-0009-license-and-provenance.md) | Apache attribution・origin・再配布境界を全assetに保持する |
| [0010](ADR-MAP-0010-asset-trust-and-limits.md) | version-bound assetを検証し、全入力に資源上限を設ける |
| [0011](ADR-MAP-0011-builtins-and-custom-api.md) | 全Dynmap built-inと必要CustomRenderer APIを再現し第三者実装は除外する |
| [0012](ADR-MAP-0012-paper-snapshot.md) | Paperはsnapshot providerでありrendererではない |
| [0013](ADR-MAP-0013-tile-cache-scheduler.md) | Tile/cache/schedulerはverified outputとfailureを区別する |
| [0014](ADR-MAP-0014-ipc-and-consent.md) | IPC/UIのMap enabledはrenderer/terrain gateを通った状態だけにする |
| [0015](ADR-MAP-0015-viewport-interaction.md) | Cursor-anchor smooth zoomとcommitted panはtileが成立した後に戻す |
| [0016](ADR-MAP-0016-evidence-and-completion.md) | Build/test/mock/real acceptanceは別証拠で、未解決requiredがあれば未完了 |

**Status:** Accepted as execution constraints. 2026-09-23時点の実装statusを示すものではない。
