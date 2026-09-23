import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createSourceRootCandidateAudit } from '../audit-source-root-candidates.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';
const tree = '632ec26b9f995c8c7acaf525325b359a8a996175';
const ast = {
  sourceRevision: revision,
  sourceTreeSha1: tree,
  semanticDependencyClosureComplete: false,
  sourceFiles: [{ sourcePath: 'core/A.java' }, { sourcePath: 'core/B.java' }, { sourcePath: 'web/C.java' }, { sourcePath: 'web/D.java' }],
  counts: { sourceFiles: 4 },
  declarations: [
    { symbolId: 'type:A', sourcePath: 'core/A.java' },
    { symbolId: 'method:A#paint()', sourcePath: 'core/A.java' },
    { symbolId: 'method:B#decode()', sourcePath: 'core/B.java' },
    { symbolId: 'type:C', sourcePath: 'web/C.java' },
    { symbolId: 'type:D', sourcePath: 'web/D.java' },
  ],
};
const dependencies = {
  sourceRevision: revision,
  sourceTreeSha1: tree,
  closureComplete: false,
  inputDigests: { astInventorySha256: 'AST_DIGEST' },
  counts: { resolvedPinnedDeclarationEdges: 3 },
  edges: [
    { edgeId: 'edge-call', sourceSymbolId: 'method:A#paint()', targetSymbolId: 'method:B#decode()', kind: 'method_call', sourcePath: 'core/A.java', line: 8 },
    { edgeId: 'edge-data', sourceSymbolId: 'method:B#decode()', targetSymbolId: 'type:C', kind: 'identifier', sourcePath: 'core/B.java', line: 12 },
    { edgeId: 'edge-nested-data', sourceSymbolId: 'type:C', targetSymbolId: 'type:D', kind: 'member_select', sourcePath: 'web/C.java', line: 3 },
  ],
};
const sourcePhaseMap = { revision, entries: [{ sourcePath: 'core/A.java' }] };

test('separates over-inclusive file seeds, call reachability, and direct data references', () => {
  dependencies.inputDigests.astInventorySha256 = createHash('sha256').update(JSON.stringify(ast)).digest('hex');
  const audit = createSourceRootCandidateAudit({
    ast,
    dependencies,
    sourcePhaseMap,
    rendererRoots: ['method:A#paint()'],
    reviewExamples: ['type:C'],
  });
  assert.equal(audit.status, 'open_overinclusive_file_seed_not_renderer_closure');
  assert.equal(audit.counts.fileSeedDeclarations, 2);
  assert.equal(audit.counts.reachableDeclarations, 5);
  assert.equal(audit.counts.reachableFilesOutsideCandidateMap, 3);
  assert.equal(audit.counts.rendererRootCandidateDeclarations, 2);
  assert.equal(audit.counts.rendererRootCandidateFiles, 2);
  assert.equal(audit.counts.rendererRootCallEdgesTraversed, 1);
  assert.equal(audit.counts.rendererRootDirectNonCallReferenceEdges, 1);
  assert.equal(audit.counts.rendererRootDirectNonCallTargetDeclarations, 1);
  assert.equal(audit.rendererRootReachability.status, 'open_candidate_call_graph_only');
  assert.deepEqual(audit.rendererRootReachability.directNonCallReferences.map((edge) => edge.targetSymbolId), ['type:C']);
  assert.deepEqual(audit.reviewExamplesReached.map((entry) => ({
    reachedFromFileSeed: entry.reachedFromFileSeed,
    reachedFromCallGraph: entry.reachedFromCallGraph,
    reachedByDirectNonCallReference: entry.reachedByDirectNonCallReference,
  })), [{ reachedFromFileSeed: true, reachedFromCallGraph: false, reachedByDirectNonCallReference: true }]);
});

test('rejects an absent renderer dispatch root and a falsely closed input graph', () => {
  dependencies.inputDigests.astInventorySha256 = createHash('sha256').update(JSON.stringify(ast)).digest('hex');
  assert.throws(() => createSourceRootCandidateAudit({
    ast,
    dependencies,
    sourcePhaseMap,
    rendererRoots: ['missing-root'],
    reviewExamples: ['type:C'],
  }), /renderer dispatch roots are absent/);
  assert.throws(() => createSourceRootCandidateAudit({
    ast,
    dependencies: { ...dependencies, closureComplete: true },
    sourcePhaseMap,
    rendererRoots: ['method:A#paint()'],
    reviewExamples: ['type:C'],
  }), /must not accept a claimed closed/);
});
