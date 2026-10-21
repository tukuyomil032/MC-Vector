import assert from 'node:assert/strict';
import test from 'node:test';
import { buildResourceCatalog, buildSourceLedger } from '../materialize-plan-ledger-shards.mjs';

const revision = '93b454efb8802dc7406d6873434f2aeec5c636f4';

function declaration(symbolId, sourcePath) {
  return {
    symbolId,
    sourcePath,
    signature: `${symbolId}:signature`,
    startLine: 1,
    endLine: 1,
    sourceSpan: { startLine: 1, endLine: 1 },
    sourceGitBlobSha1: 'a'.repeat(40),
    sourceContentSha256: 'b'.repeat(64),
  };
}

function sourceFile(sourcePath) {
  return { sourcePath, gitBlobSha1: 'a'.repeat(40), contentSha256: 'b'.repeat(64) };
}

function disposition(row) {
  return {
    ...row,
    classification: 'required',
    rationale: 'Mapped to a pinned renderer behavior phase; evidence remains planned, not verified.',
    dependencyEdgeIds: [],
    rustDestination: 'src-tauri/crates/map-renderer-core/src/domain/mod.rs',
    ownerPhaseId: 'P-000',
    ownerPhaseDocument: 'phases/phase-000-source-ast-closure.md',
    fixturePlanIds: [`FIX-${row.symbolId}`],
    referencePlanIds: [`REF-${row.symbolId}`],
    focusedTestPlanIds: [`TEST-${row.symbolId}`],
    evidencePlanIds: [`EVID-${row.symbolId}`],
  };
}

function resourceRow(sourcePath) {
  return {
    sourcePath,
    sourceRevision: revision,
    gitBlobSha1: 'c'.repeat(40),
    contentSha256: 'd'.repeat(64),
    byteLength: 16,
    scope: 'excluded',
    scopeStatus: 'planned_source_backed_exclusion',
    license: null,
    licenseStatus: 'unverified_per_resource',
    consumerSymbolIds: [],
    ownerPhaseId: 'P-001',
    phaseDocument: 'phases/phase-001-resource-closure.md',
    fixturePlanIds: [],
    referencePlanIds: [],
    focusedTestPlanIds: [],
    evidencePlanIds: [],
    exclusionRationale: 'The pinned source only publishes this exact path to a non-renderer surface.',
    exclusionEvidenceIds: [`EXC-${sourcePath}`],
  };
}

test('merges disjoint source declaration shards and derives edge ownership from the closed ledger', () => {
  const first = declaration('method:type:a.A#render()', 'DynmapCore/src/main/java/a/A.java');
  const second = declaration('type:b.B', 'DynmapCore/src/main/java/b/B.java');
  const firstEdge = { edgeId: 'EDGE-a', sourceSymbolId: first.symbolId };
  const result = buildSourceLedger({
    ast: {
      sourceRevision: revision,
      counts: { referenceCandidates: 1 },
      sourceFiles: [sourceFile(first.sourcePath), sourceFile(second.sourcePath)],
      declarations: [first, second],
    },
    existing: { sourceRevision: revision, status: 'partial', counts: {}, entries: [disposition(first)] },
    shards: [{ path: 'part-b.json', value: { sourceRevision: revision, entries: [disposition(second)] } }],
    edges: {
      sourceRevision: revision,
      status: 'closed',
      referenceCandidateCount: 1,
      resolvedReferenceCandidateCount: 1,
      boundaryReferenceCandidateCount: 0,
      excludedReferenceCandidateCount: 0,
      unresolvedReferenceCandidateCount: 0,
      edges: [firstEdge],
      unresolved: [],
    },
  });

  assert.equal(result.status, 'closed_pinned_symbol_and_dependency_coverage');
  assert.equal(result.counts.dispositionedDeclarations, 2);
  assert.equal(result.entries.find((row) => row.symbolId === first.symbolId).dependencyEdgeIds[0], 'EDGE-a');
  assert.deepEqual(result.entries.find((row) => row.symbolId === second.symbolId).dependencyEdgeIds, []);
});

test('materializes every symbol without claiming unresolved P-000 reference candidates are closed', () => {
  const row = declaration('method:type:a.A#render()', 'DynmapCore/src/main/java/a/A.java');
  const result = buildSourceLedger({
    ast: {
      sourceRevision: revision,
      counts: { referenceCandidates: 3 },
      sourceFiles: [sourceFile(row.sourcePath)],
      declarations: [row],
    },
    existing: { entries: [disposition(row)] },
    shards: [],
    edges: {
      sourceRevision: revision,
      status: 'open',
      referenceCandidateCount: 3,
      resolvedReferenceCandidateCount: 1,
      boundaryReferenceCandidateCount: 0,
      excludedReferenceCandidateCount: 0,
      unresolvedReferenceCandidateCount: 2,
      edges: [{ edgeId: 'EDGE-a', sourceSymbolId: row.symbolId }],
      unresolved: [{
        candidateCount: 2,
        phaseId: 'P-000',
        phaseDocument: 'spec/map/plan/phases/phase-000-source-ast-closure.md',
        reason: 'Exact semantic resolution remains a P-000 implementation task.',
        candidateInventoryPointers: { ast: 'spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/*' },
      }],
    },
  });

  assert.equal(result.status, 'complete_symbol_disposition_with_open_dependency_closure');
  assert.equal(result.counts.dispositionedDeclarations, 1);
  assert.equal(result.counts.unresolvedDependencyReferenceCandidates, 2);
  assert.equal(result.entries[0].dependencyEdgeCoverage, 'known-edges-attached; remaining-candidates-owned-by-p000');
});

test('preserves exact import-context ownership without inventing an AST declaration', () => {
  const row = declaration('type:a.A', 'DynmapCore/src/main/java/a/A.java');
  const importOwner = 'import:org.dynmap.fabric';
  const initializerOwner = 'initializer:type:org.dynmap.Cache#static@23';
  const result = buildSourceLedger({
    ast: {
      sourceRevision: revision,
      counts: { referenceCandidates: 2 },
      sourceFiles: [sourceFile(row.sourcePath)],
      declarations: [row],
      referenceCandidates: [
        {
          sourcePath: row.sourcePath,
          startOffset: 7,
          endOffset: 28,
          contextSymbolId: importOwner,
          kind: 'import_type_candidate',
          target: 'org.dynmap.common.DynmapPlayer',
        },
        {
          sourcePath: row.sourcePath,
          startOffset: 40,
          endOffset: 55,
          contextSymbolId: initializerOwner,
          kind: 'identifier_candidate',
          target: 'CACHE_FIELD',
        },
      ],
    },
    existing: { entries: [disposition(row)] },
    shards: [],
    edges: {
      sourceRevision: revision,
      status: 'closed',
      referenceCandidateCount: 2,
      resolvedReferenceCandidateCount: 2,
      boundaryReferenceCandidateCount: 0,
      excludedReferenceCandidateCount: 0,
      unresolvedReferenceCandidateCount: 0,
      edges: [
        { edgeId: 'EDGE-import', sourceSymbolId: importOwner, targetSymbolId: 'type:org.dynmap.common.DynmapPlayer', resolution: 'resolved' },
        { edgeId: 'EDGE-initializer', sourceSymbolId: initializerOwner, targetSymbolId: 'field:type:org.dynmap.Cache#CACHE_FIELD', resolution: 'resolved' },
      ],
      unresolved: [],
    },
  });

  assert.deepEqual(result.entries[0].dependencyEdgeIds, []);
  assert.deepEqual(result.nonDeclarationEdgeOwners, [{
    sourceSymbolId: importOwner,
    ownerKind: 'import-context',
    dependencyEdgeIds: ['EDGE-import'],
    candidateInventoryPointers: ['spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/0'],
  }, {
    sourceSymbolId: initializerOwner,
    ownerKind: 'initializer-context',
    dependencyEdgeIds: ['EDGE-initializer'],
    candidateInventoryPointers: ['spec/map/coverage/java-ast-inventory.json.gz#/referenceCandidates/1'],
  }]);
  assert.equal(result.counts.nonDeclarationDependencyEdges, 2);
});

test('rejects open dependency candidates without complete counts and P-000 ownership', () => {
  const row = declaration('method:type:a.A#render()', 'DynmapCore/src/main/java/a/A.java');
  const base = {
    sourceRevision: revision,
    status: 'open',
    referenceCandidateCount: 2,
    resolvedReferenceCandidateCount: 1,
    boundaryReferenceCandidateCount: 0,
    excludedReferenceCandidateCount: 0,
    unresolvedReferenceCandidateCount: 1,
    edges: [{ edgeId: 'EDGE-a', sourceSymbolId: row.symbolId }],
    unresolved: [{ candidateCount: 1, phaseId: 'P-000', phaseDocument: 'spec/map/plan/phases/phase-000-source-ast-closure.md', reason: 'Open.', candidateInventoryPointers: { ast: 'inventory' } }],
  };
  const inputs = {
    ast: { sourceRevision: revision, counts: { referenceCandidates: 2 }, sourceFiles: [sourceFile(row.sourcePath)], declarations: [row] },
    existing: { entries: [disposition(row)] },
    shards: [],
  };

  assert.throws(() => buildSourceLedger({ ...inputs, edges: { ...base, unresolvedReferenceCandidateCount: 0 } }), /exact AST reference-candidate count/);
  assert.throws(() => buildSourceLedger({ ...inputs, edges: { ...base, unresolved: [{ ...base.unresolved[0], phaseId: '' }] } }), /planned owner/);
});

test('refuses a source ledger with a missing declaration instead of marking it closed', () => {
  const row = declaration('type:a.A', 'DynmapCore/src/main/java/a/A.java');
  assert.throws(() => buildSourceLedger({
    ast: {
      sourceRevision: revision,
      counts: { referenceCandidates: 0 },
      sourceFiles: [sourceFile(row.sourcePath)],
      declarations: [row],
    },
    existing: { entries: [] },
    shards: [],
    edges: {
      sourceRevision: revision,
      status: 'closed',
      referenceCandidateCount: 0,
      resolvedReferenceCandidateCount: 0,
      boundaryReferenceCandidateCount: 0,
      excludedReferenceCandidateCount: 0,
      unresolvedReferenceCandidateCount: 0,
      edges: [],
      unresolved: [],
    },
  }), /coverage is incomplete/);
});

test('merges exact resource identity and refuses missing paths', () => {
  const path = 'DynmapCore/src/main/resources/extracted/web/example.js';
  const row = resourceRow(path);
  const inventory = {
    sourceRevision: revision,
    entries: [{ sourcePath: path, gitBlobSha1: row.gitBlobSha1, contentSha256: row.contentSha256, byteLength: row.byteLength }],
  };
  const existing = { entries: [] };
  const shards = [{ path: 'part-a.json', value: { sourceRevision: revision, entries: [row] } }];
  const merged = buildResourceCatalog({ inventory, existing, shards });

  assert.equal(merged.classificationComplete, true);
  assert.equal(merged.consumerClosureComplete, false);
  assert.equal(merged.counts.total, 1);
  assert.equal(merged.entries[0].sourcePath, path);
  assert.throws(() => buildResourceCatalog({ inventory, existing, shards: [] }), /coverage is incomplete/);
});

test('rejects resource digest drift and incomplete renderer consumer plans', () => {
  const path = 'DynmapCore/src/main/resources/texturepacks/standard/assets/minecraft/test.png';
  const row = resourceRow(path);
  const inventory = {
    sourceRevision: revision,
    entries: [{ sourcePath: path, gitBlobSha1: row.gitBlobSha1, contentSha256: row.contentSha256, byteLength: row.byteLength }],
  };
  const badDigest = { ...row, contentSha256: 'e'.repeat(64) };
  assert.throws(() => buildResourceCatalog({
    inventory,
    existing: { entries: [] },
    shards: [{ path: 'part-a.json', value: { sourceRevision: revision, entries: [badDigest] } }],
  }), /does not match pinned resource identity/);

  const runtime = { ...row, scope: 'renderer-runtime', exclusionRationale: null, exclusionEvidenceIds: [] };
  assert.throws(() => buildResourceCatalog({
    inventory,
    existing: { entries: [] },
    shards: [{ path: 'part-a.json', value: { sourceRevision: revision, entries: [runtime] } }],
  }), /consumerSymbolIds/);
});
