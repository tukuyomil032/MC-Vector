import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeSourceDependencyCandidates } from '../materialize-source-dependency-candidates.mjs';

const REVISION = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const TREE = '632ec26b9f995c8c7acaf525325b359a8a996175';

function fixtures({ unresolved = false } = {}) {
  const ownerType = {
    symbolId: 'type:org.example.Owner',
    kind: 'class',
    signature: 'org.example.Owner',
    sourcePath: 'core/Owner.java',
    startOffset: 0,
    endOffset: 100,
  };
  const sourceMethod = {
    symbolId: 'method:type:org.example.Owner#render()',
    kind: 'method',
    signature: 'org.example.Owner#render()->void',
    sourcePath: 'core/Owner.java',
    startOffset: 10,
    endOffset: 70,
  };
  const targetMethod = {
    symbolId: 'method:type:org.example.Target#draw()',
    kind: 'method',
    signature: 'org.example.Target#draw()->void',
    sourcePath: 'core/Target.java',
    startOffset: 0,
    endOffset: 20,
  };
  const ast = {
    sourceRevision: REVISION,
    sourceTreeSha1: TREE,
    counts: { declarations: 3, referenceCandidates: 3 },
    declarations: [ownerType, sourceMethod, targetMethod],
    referenceCandidates: [
      { sourcePath: 'core/Owner.java', startOffset: 20, endOffset: 31, line: 4, contextSymbolId: sourceMethod.symbolId, kind: 'method_call_candidate', target: 'target.draw()' },
      { sourcePath: 'core/Owner.java', startOffset: 35, endOffset: 36, line: 5, contextSymbolId: sourceMethod.symbolId, kind: 'identifier_candidate', target: 'local' },
      { sourcePath: 'core/Owner.java', startOffset: 40, endOffset: 46, line: 6, contextSymbolId: sourceMethod.symbolId, kind: 'string_literal_candidate', target: 'asset' },
    ],
  };
  const semantic = {
    sourceRevision: REVISION,
    status: 'attribution_inventory_only_closure_open',
    closureComplete: false,
    parser: 'test compiler',
    compilerVersion: 'test',
    counts: { declarations: 3, references: 3, parseDiagnostics: 0, analysisDiagnostics: 0 },
    references: [
      {
        sourcePath: 'core/Owner.java', startOffset: 20, endOffset: 31, line: 4, kind: 'method_call',
        resolution: 'resolved_pinned_source_declaration', targetKind: 'method', targetSignature: 'draw()',
        targetSourcePath: 'core/Target.java', targetStartOffset: 0, targetEndOffset: 20, targetStartLine: 1,
      },
      {
        sourcePath: 'core/Owner.java', startOffset: 35, endOffset: 36, line: 5, kind: 'identifier',
        resolution: 'resolved_pinned_source_declaration', targetKind: 'local_variable', targetSignature: 'local',
        targetSourcePath: 'core/Owner.java', targetStartOffset: 72, targetEndOffset: 77, targetStartLine: 8,
      },
      {
        sourcePath: 'core/Owner.java', startOffset: 40, endOffset: 46, line: 6, kind: 'string_literal',
        resolution: 'manual_reflection_or_resource_review_required', literal: 'asset',
        enclosingCalls: [{
          callee: 'loader.getResourceAsStream',
          targetSignature: 'getResourceAsStream(java.lang.String)',
          targetOwnerQualifiedName: 'java.lang.ClassLoader',
          targetName: 'getResourceAsStream',
          argumentIndex: 0,
        }],
      },
    ],
  };
  if (unresolved) {
    semantic.references.push({
      sourcePath: 'core/Owner.java', startOffset: 52, endOffset: 58, line: 7, kind: 'method_call',
      resolution: 'unresolved', sourceExpression: 'missing()',
    });
    semantic.counts.references++;
    ast.referenceCandidates.push({
      sourcePath: 'core/Owner.java', startOffset: 52, endOffset: 58, line: 7, contextSymbolId: sourceMethod.symbolId,
      kind: 'method_call_candidate', target: 'missing()',
    });
    ast.counts.referenceCandidates++;
  }
  return { ast, semantic, sourceMethod, targetMethod };
}

test('maps resolved source edges and keeps lexical, dynamic-string, unmatched, and unresolved references distinct', () => {
  const { ast, semantic, sourceMethod, targetMethod } = fixtures({ unresolved: true });
  semantic.references.push({
    sourcePath: 'core/Owner.java', startOffset: 75, endOffset: 91, line: 9, kind: 'member_select',
    contextMethodStartOffset: sourceMethod.startOffset, contextMethodEndOffset: sourceMethod.endOffset,
    resolution: 'external_or_generated_declaration', targetKind: 'package', targetSignature: 'org.example.external',
    sourceExpression: 'org.example.external',
  });
  semantic.counts.references++;
  const result = materializeSourceDependencyCandidates(ast, semantic);

  assert.equal(result.closureComplete, false);
  assert.equal(result.status, 'open-not-a-complete-renderer-closure');
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].sourceSymbolId, sourceMethod.symbolId);
  assert.equal(result.edges[0].targetSymbolId, targetMethod.symbolId);
  assert.equal(result.counts.lexicalBindingGroups, 1);
  assert.equal(result.dynamicStringReviewCandidates[0].literal, 'asset');
  assert.equal(result.dynamicStringReviewCandidates[0].enclosingCalls[0].targetSignature, 'getResourceAsStream(java.lang.String)');
  assert.equal(result.dynamicStringReviewCandidates[0].enclosingCalls[0].targetOwnerQualifiedName, 'java.lang.ClassLoader');
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].reason, 'unresolved');
  assert.equal(result.unmatchedSemanticReferences.length, 1);
  assert.equal(result.unmatchedSemanticReferences[0].sourceSymbolId, sourceMethod.symbolId);
  assert.equal(result.unmatchedSemanticReferences[0].resolution, 'external_or_generated_declaration');
  assert.equal(result.unmatchedSemanticReferences[0].targetSignature, 'org.example.external');
  assert.equal(result.counts.unmatchedSemanticReferences, 1);
  assert.equal(result.counts.unmatchedSyntaxCandidates, 0);
});

test('rejects inventories from another pinned revision or a closed-claim semantic input', () => {
  const { ast, semantic } = fixtures();
  assert.throws(() => materializeSourceDependencyCandidates({ ...ast, sourceRevision: 'wrong' }, semantic), /pinned Dynmap revision/);
  assert.throws(() => materializeSourceDependencyCandidates(ast, { ...semantic, closureComplete: true }), /preserve its open-closure status/);
});
