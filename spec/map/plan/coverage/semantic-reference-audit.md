# Semantic Reference Inventory Audit

Audit date: 2026-09-23. This report records an independent javac semantic-reference pass over the pinned Dynmap source tree. It is an inventory result, not proof that the renderer dependency closure is complete.

## Pinned inputs and tool

- Pinned Dynmap revision: `93b454efb8802dc7406d6873434f2aeec5c636f4`.
- Verified pinned Git tree: `632ec26b9f995c8c7acaf525325b359a8a996175`.
- JDK: `26.0.2`.
- Scanner: `DynmapSemanticReferenceInventory.java`, using the public Java Compiler Tree API, `TreePathScanner`, and `JavacTask.analyze`.

## Results

- Java files parsed: 856/856.
- Parse diagnostics: 0.
- Javac analysis diagnostics: 100.
- Semantic references: 303,383.
- References resolved to pinned declarations: 153,953.
- External/generated reference occurrences: 138,160, grouped into 81,398 distinct source-symbol/target groups.
- Semantic references absent from the syntax-candidate inventory: 6,469 (6,022 external/generated, 421 pinned-source, 26 explicit/implicit constructor review). Their exact source spans, context, target, and stable reference IDs are retained in `unmatchedSemanticReferences`; they remain open for individual adjudication.
- Unresolved import-resolution candidates: 165.
- Explicit or implicit `super`/`this` constructor candidates requiring review: 34.
- Unresolved non-import semantic references: 0.
- String-literal contexts: 11,071. This count includes ordinary user-facing messages and data strings; it is not a count of dynamic lookups.

Candidate artifact: [`source-dependency-candidates.json.gz`](../../coverage/source-dependency-candidates.json.gz), compressed SHA-256 `7c97a1e9ed67af4ab2f8750e2e2cf604bf216cfe6dc5b8517cb6691cf31883a1`. String-literal and unmatched-semantic rows retain source locations and available enclosing AST context. String-literal rows retain up to eight enclosing AST call contexts with resolved callee owner/name/signature and argument position.

## Pinned render invocation roots

The pinned Java source was inspected at the actual tile dispatch boundary. These roots define where renderer-specific closure analysis must start; they do not by themselves prove that the transitive closure is closed.

| Role | Exact pinned symbol / source span | Observed behavior |
|---|---|---|
| Scheduler-to-tile caller | `org.dynmap.MapManager$FullWorldRenderState#processTile(MapTile,long,int)->boolean`, `DynmapCore/src/main/java/org/dynmap/MapManager.java:754-862` | Calls `tile.getRequiredChunks()` at line 756, `tile.render(...)` at lines 797 and 812, and adjacent-tile lookup at line 820. Scheduling, cache, and storage around these calls are boundary candidates, not renderer implementation roots. |
| Tile render dispatch | `org.dynmap.hdmap.HDMapTile#render(MapChunkCache,String)->boolean`, `DynmapCore/src/main/java/org/dynmap/hdmap/HDMapTile.java:96-99` | Delegates through the `HDPerspective` interface; concrete implementation selection is dynamic/configuration-driven. |
| Required chunk dispatch | `org.dynmap.hdmap.HDMapTile#getRequiredChunks()->List<DynmapChunk>`, `DynmapCore/src/main/java/org/dynmap/hdmap/HDMapTile.java:101-104` | Delegates required-world-chunk geometry through `HDPerspective`. |
| Adjacent tile dispatch | `org.dynmap.hdmap.HDMapTile#getAdjecentTiles()->MapTile[]`, `DynmapCore/src/main/java/org/dynmap/hdmap/HDMapTile.java:106-109` | Delegates tile-neighbor topology through `HDPerspective`. |
| Concrete isometric renderer | `org.dynmap.hdmap.IsoHDPerspective#getRequiredChunks(MapTile)->List<DynmapChunk>`, lines `1173-1248`; `#render(MapChunkCache,HDMapTile,String)->boolean`, lines `1250-1459`; `#getAdjecentTiles(MapTile)->MapTile[]`, lines `1147-1162`, all in `DynmapCore/src/main/java/org/dynmap/hdmap/IsoHDPerspective.java` | Performs tile volume/chunk intersection, pixel ray traversal, shader output, and neighbor calculation. Each method is an independent behavior owner in the implementation plan. |
| Shader/perspective/lighting configuration | `HDMapManager#loadHDShaders(DynmapCore)->void` (`HDMapManager.java:24-52`), `#loadHDPerspectives(DynmapCore)->void` (`:54-81`), `#loadHDLightings(DynmapCore)->void` (`:83-108`), and `#getShaderStateForTile(HDMapTile,MapChunkCache,MapIterator,String,int)->HDShaderState[]` (`:120-145`) | Loads configured implementations and creates per-tile shader states; configuration lookup and reflective/factory dispatch must be traced separately from ordinary call edges. |
| Data-driven block model registration | `HDBlockModels#loadModels(DynmapCore,ConfigurationNode)->void`, `HDBlockModels.java:161-266`, and `#loadModelFile(InputStream,String,ConfigurationNode,DynmapCore,String)->void`, `:336-1206` | Loads model definitions and registrations consumed by the render traversal. The large parser method must be decomposed by branch/behavior rather than assigned as one opaque implementation task. |

An exploratory reachability calculation was run over the current candidate edge artifact, using only edges whose source and target IDs both resolve to AST declarations. It found 397 declarations reachable from the nine exact method roots above, 1,806 from the broader renderer/configuration class seed set, and 2,632 from all declarations under the `hdmap` package seed. These counts differ because the latter seed sets intentionally include more behaviors. They are not closure counts: the candidate graph does not yet close reflection, dynamic registrations, resource references, external API boundaries, unresolved import candidates, or all virtual dispatch. None may be used to exclude a declaration or to claim completion.

## Open work (not a pass)

The candidate graph does not classify all declarations or dependency edges, close reflective/registry/resource dataflow, resolve the import and constructor review candidates, or assign every required symbol to an implementation phase. The 11,071 string-literal contexts include ordinary messages and data strings as well as potential lookup keys; each must be classified from its enclosing call/dataflow context, not by literal shape alone.

The strict plan gate must remain failed until the source disposition ledger and semantic edge ledger cover the pinned inventory and all required rows are linked to phase, fixture, reference, and test plans. No source-closure-complete claim follows from this report.
