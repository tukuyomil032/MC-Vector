# Dynmap Renderer Source Boundary

MC-Vector uses a selected, source-only snapshot from Dynmap v3.0 as the
renderer specification. The immutable source ref is
`93b454efb8802dc7406d6873434f2aeec5c636f4`.

- Source snapshot and hashes: [`SOURCE-REF.md`](../../src/map/dynmap/SOURCE-REF.md)
- Port map: [`porting-manifest.md`](../../src/map/dynmap/porting-manifest.md)
- Scope: [`source-scope-and-version.md`](source-scope-and-version.md)
- Rust boundary: [`source-porting.md`](source-porting.md)
- License and notice: `src/map/dynmap/LICENSE-APACHE-2.0` and `src/map/dynmap/NOTICE`

The snapshot is not runtime code. It is never bundled into the frontend or
Paper plugin. MC-Vector is not Dynmap-compatible and does not copy Dynmap's
Bukkit lifecycle, web server, storage, commands, or configuration system.
