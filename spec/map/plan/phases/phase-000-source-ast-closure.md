# P-000: Pinned source AST と依存closure

## Machine-checked dependency contract

```json
{
  "schemaVersion": 1,
  "phaseId": "P-000",
  "kind": "common",
  "document": "phases/phase-000-source-ast-closure.md",
  "dependsOn": [],
  "commitMessage": "chore: close pinned dynmap renderer source inventory"
}
```

## 目的と固定対象

- 対象source/symbol: all 856 Java files at pinned Dynmap revision and every renderer-reachable declaration/reference/resource edge。詳細な宣言IDはP-000 AST ledgerを正とする。
- Rust destination / output: stable AST symbol ledger、call/data/resource edge、required/adapter-only/excluded分類、source-to-phase map。具体的なmodule ownerはAST・coverage ledgerで全symbolへ割り当てる。
- 依存phase: なし。依存gateが未達のまま、このphaseを実装済みにしない。
- version scope: pinned Dynmap revisionを共通behavior baselineとするが、各Minecraft releaseを処理できるDynmap source revision/moduleを独立に選定する。baselineとの差分はrelease evidenceへ記録し、Rust implementation phaseは既存profileで処理できないbehavior gapがある場合だけ追加する。

## 入力・failure contract

入力はrevision/hash固定されたsource、対象version metadata、domain contract、固定fixtureのいずれかに限る。missing・unsupported・malformed・unavailable・timeout・resource limitは別のstructured failureで返す。欠落情報をair、推測model/color/light、transparent successへ変換せえへん。
このphase固有の失敗条件: Any parse error, source/hash drift, declaration-ID collision, unassigned declaration/reference candidate, unresolved renderer-reachable edge, heuristic-only exclusion, or source file outside the audited inventory fails this phase.

## 実装作業

1. Run the pinned JDK Compiler Tree API inventory against every Java blob; preserve exact declaration IDs, overload signatures, nested/local/anonymous types, source spans, and javac diagnostics.
2. Resolve attributed calls, field/type references, inheritance/constructor dispatch, imports, reflection/registries, and dynamic resource strings; store resolved, adapter-boundary, excluded, and unresolved candidates without treating regex names as declarations.
3. Start from renderer entry points and traverse the source/resource graph transitively across every module; add every newly reachable source file/resource to the inventory before assigning an owner.
4. Assign every discovered declaration to a required renderer phase, adapter phase, or evidence-backed exclusion; route unresolved candidates to this phase with an explicit review record rather than silently dropping them.
5. Generate stable per-symbol disposition and dependency-edge ledgers, then independently compare their IDs and source hashes against the pinned Git tree and AST inventory.

## Current full-tree candidate inventory (not closure proof)

- The independently materialized source tree has 856 Java files, 18,201 stable declarations, and 296,914 syntax reference candidates.
- The attributed candidate graph records 303,383 semantic references, 87,883 pinned declaration edges, 6,469 unmatched semantic references, 81,398 external reference groups, 11,071 dynamic-string review candidates, 165 import-resolution candidates, 34 manual super/this dispatch candidates, and 100 javac analysis diagnostics.
- All 6,469 unmatched semantic references retain their stable IDs, source spans, compiler resolution, and available context. Resolution breakdown: external_or_generated_declaration=6,022, resolved_pinned_source_declaration=421, manual_super_or_this_constructor_resolution_required=26. Each row must be resolved or evidence-backed as an adapter boundary/exclusion; none may be silently dropped as compiler noise.
- These are candidate totals, not reviewed renderer dependencies. The dependency inventory status is `open-not-a-complete-renderer-closure`; P-000 must resolve or justify every applicable candidate and must not set closure complete based on matching counts alone.
- The current dependency-edge ledger records 87,883 classified AST reference candidates and 209,031 unresolved candidates out of 296,914; its status is `open`. The unresolved count is assigned to P-000 only and is not semantically resolved.
- Open-candidate evidence is preserved in `source-dependency-edges.json#/unresolved/0` and the exact inventories listed below. The P-000 workflow must join every AST reference candidate by source path, span, context, and kind, then record each target or evidence-backed boundary/exclusion; count-only closure is forbidden.
- Current supplemental candidate families include unmatched semantic references, external reference groups, lexical binding groups, dynamic strings, imports, manual super/this dispatch, and javac diagnostics. These group counts can overlap and are investigation indexes, not a partition of the AST candidate total.

- 固定fixture / reference: AST parser corpus covering overloads, nested/local/anonymous types, generics/annotations, constructor delegation, inheritance, reflection registration, dynamic resource lookup, external API boundaries, plus the complete pinned-tree javac report.
- 期待値はpinned Java reference harnessから事前captureしてhash固定する。テスト中にgoldenを生成・更新しない。source差分は許容値を広げず、symbolまたはresource consumerへ帰属させる。

## 検証gate

- 合格条件: Every pinned Java declaration and reference candidate is in the ledgers, every renderer-reachable edge is resolved or has a source-backed adapter/exclusion decision, and each required declaration has a concrete Rust phase plus fixture/reference/test/evidence plan.
- Rust品質条件: `cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check` と当該crateのtest/check/clippy `-D warnings`を実行し、未使用warning抑制で作業を隠さない。
- 成果物条件: 実装diff、focused test、fixture/reference IDとdigest、failure tests、coverage rowを同じphase evidenceへ記録する。

```bash
java spec/map/plan/tools/DynmapAstInventory.java <pinned-source-root> <raw-ast.json> 93b454efb8802dc7406d6873434f2aeec5c636f4 && node spec/map/plan/tools/materialize-ast-inventory.mjs --source-root <pinned-source-root> --git-dir <pinned-git-dir> --ast-json <raw-ast.json> --check && node spec/map/plan/tools/validate-plan-coverage.mjs && git diff --check
git diff --check
```

## 完了状態の記録

完了していない場合は理由を `blocked` / `failed` / `not_applicable` のいずれかと具体的証拠で記録し、隣接phaseやmockの結果を代用しない。required itemが一つでも未確認ならこのphaseは未完了。

## Commit

このphase内の独立した作業単位を一つずつcommitする。次の文字列はこのphaseの最終gateを満たした変更だけに使う。

```text
chore: close pinned dynmap renderer source inventory
```
