# Evidence protocol

計画上の全claimはevidence classとartifact identityを持つ。既存の運用ledgerは [`spec/map/evidence/evidence-ledger.md`](../../evidence/evidence-ledger.md)、compact real-acceptance stateは [`spec/map/evidence/real-acceptance-matrix.json`](../../evidence/real-acceptance-matrix.json) に残し、この計画directoryは採取規則を定める。

各version/phaseの証拠に必須のfields:

- phase ID、Minecraft exact version、Dynmap revision、source symbol/resource IDs。
- app commit SHA、client/server/Paper/Core JARのSHA-256、asset index/resource pack digest。
- fixture IDとinput digest、Java reference build/capture ID、Rust test/command exact result。
- 実Paper/Tauri/manual evidenceの場合は日時、OS、Java runtime、server process identity、UI result、shutdown/process exit/port result。
- statusは `planned` / `running` / `passed` / `failed` / `blocked` のいずれか。`passed`はcommand/trace/artifactを実際に保存したときだけ許可する。

Build、unit test、Java oracle、fixture decode、Paper smoke、real Tauri、visual manual QA、shutdown/port releaseは別classで保存する。同じlogや同じmock resultを複数classの証拠に使わない。raw token、secret、private absolute pathは公開reportへ入れない。
