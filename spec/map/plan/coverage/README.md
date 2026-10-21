# Coverage plan and authoritative ledgers

このdirectoryは計画coverageと実装closureを別々に測る。`validate-plan-coverage.mjs` は現在の全inventory itemがsource-closure/resource-closure/family/built-in/version phaseへ割り当てられているかを検査するだけで、意味上の分類・consumer reachability・renderer parityを証明しない。`plan-completeness.mjs` および最終coverage auditは、required implementation coverageが実証済みかをfail-closedで判定する。二つのゲートを同じ「complete」と誤認しない。

- [`source-candidates.md`](source-candidates.md): 現行106 Java source file候補の全件一覧。
- [`source-phase-map.json`](source-phase-map.json): 106候補のowner phase案。すべて `candidate_requires_ast_call_and_resource_review` であり、closure証拠ではない。
- [`source-root-candidate-audit.json.gz`](../../coverage/source-root-candidate-audit.json.gz): 旧106候補ファイル内の全宣言をseedにした探索実験。renderer entrypointの証拠ではなく、過剰包含・未到達・未解析edgeを数値で示すopen report。
- `node spec/map/plan/tools/validate-plan-coverage.mjs`: 全856 Java source file上のAST declaration 18,201件（106 candidate source mapまたはP-000の750-file closure review）、reference candidate 296,914件（P-000）、resource path 3,673件（P-001/family owner）、39 built-ins、全version stage pageのplanned ownerを検証する。candidate数の一致やowner割当はsemantic closureの証拠ではない。
- [`current-catalog-audit.md`](current-catalog-audit.md): 2026-09-23時点の正確な件数・実装証拠状態。
- `spec/map/coverage/java-ast-inventory.json.gz`: pinned tree全JavaファイルのAST declaration/reference-candidate inventory。source blobとrevisionを検証してmaterializeする。これはsymbol disposition ledgerではない。
- `spec/map/coverage/source-dependency-candidates.json.gz`: javac attributed reference candidatesとpinned declaration edges。165 import resolution候補、34 super/this dispatch review、11,071 dynamic string候補、100 analysis diagnosticsが残るため、renderer dependency closureとして使わない。
- `spec/map/coverage/source-symbols.json`: 既存regex由来候補。AST inventoryへ置き換わるまでsymbol identityの根拠として使わない。
- `spec/map/coverage/resources.json`: pinned tree全3,673 resource path/hash。3,500件は未分類、161件はglobal closure待ちのweb exclusion候補、12件はlicense未確認のcolor-scheme runtime候補。provisional dispositionをverified扱いしない。
- `spec/map/coverage/builtin-renderers.json`: 39個別classのseed。`translated`はfixture/reference/pixel proofを示さない。
- `spec/map/coverage/builtin-dispatch-inventory.json` と `builtin-behavior-inventory.json.gz`: pinned sourceから確認したstatic/reflection dispatchと全39 built-in classのjavac AST method/branch inventory。個別ページへの計画ID展開・整合性検査に使う。ここに載るfuture fixture/reference/test IDsは実fixtureやparity evidenceではない。
- `spec/map/coverage/version-matrix.json`: 48 exact releaseの公式metadata matrix。metadata_verifiedはartifact verifiedではない。

Final checkerは全required AST symbol/resource/builtin/version/fixture/reference/evidence edgeを閉じ、unclassified/pending/false verifiedをexit failureにする。AST declaration inventory、dependency candidate graph、symbol disposition ledgerは別artifactとして扱い、candidate graphやphase owner mappingをsource closureの完了証拠にしない。Source closureが既存候補106を越えたらsource inventory・owner map・phase indexと、そのsource用implementation planを同じphaseで追加する。
